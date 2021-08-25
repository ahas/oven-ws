import Route from "./route";
import Layer from "./layer";
import methods from "../methods";
import mixin from "utils-merge";
import dbg from "debug";
import { flatten } from "array-flatten";
import parseUrl from "parseurl";
import { Key } from "path-to-regexp";

// types
import { RouterOptions, Params, ParamsDictionary, PathParams, RouterMethod } from "../types";

const debug = dbg("oven/ws:router");
const objectRegExp = /^\[object (\S+)\]$/;
const slice = Array.prototype.slice;
const toString = Object.prototype.toString;

/**
 * Initialize a new `Router` with the given `options`.
 *
 * @param {Object} [options]
 * @return {Router} which is an callable function
 * @public
 */

interface Param {
    error: Error | "route";
    match: any;
    value: any;
}

type ParamRecord = Record<number | string, Param>;
type ParamCallback = (req: oven.ws.Request, res: oven.ws.Response, paramCallback: (err?: Error) => void, paramVal: any, keyName: number | string) => void;

export default class Router {
    public caseSensitive: boolean;
    public mergeParams: boolean;
    public strict: boolean;
    public stack: Layer[];
    public params: Record<string, any>;
    public _params: any[];

    constructor(options: RouterOptions) {
        const opts = options || {};
        this.params = {} as Record<string, any>;
        this._params = [] as any[];
        this.caseSensitive = opts.caseSensitive;
        this.mergeParams = opts.mergeParams;
        this.strict = opts.strict;
        this.stack = [] as any[];
    }

    /**
     * Map the given param placeholder `name`(s) to the given callback.
     *
     * Parameter mapping is used to provide pre-conditions to routes
     * which use normalized placeholders. For example a _:user_id_ parameter
     * could automatically load a user's information from the database without
     * any additional code,
     *
     * The callback uses the same signature as middleware, the only difference
     * being that the value of the placeholder is passed, in this case the _id_
     * of the user. Once the `next()` function is invoked, just like middleware
     * it will continue on to execute the route, or subsequent parameter functions.
     *
     * Just like in middleware, you must either respond to the request or call next
     * to avoid stalling the request.
     *
     *  app.param('user_id', function(req, res, next, id){
     *    User.find(id, function(err, user){
     *      if (err) {
     *        return next(err);
     *      } else if (!user) {
     *        return next(new Error('failed to load user'));
     *      }
     *      req.user = user;
     *      next();
     *    });
     *  });
     * @return {app} for chaining
     * @public
     */
    public param(name: string, handler: oven.ws.ParamHandler): this;
    public param(name: string, regexp: RegExp): this;
    public param(handler: (name: string, matcher: RegExp) => oven.ws.ParamHandler): this;
    public param(arg0: string | ((name: string, matcher: RegExp) => oven.ws.ParamHandler), arg1?: oven.ws.ParamHandler | RegExp): this {
        // param logic
        if (typeof arg0 === "function") {
            this._params.push(arg0);
            return;
        }

        // apply param functions
        const name = arg0;
        const params = this._params;
        const len = params.length;
        let ret;
        for (let i = 0; i < len; ++i) {
            if ((ret = params[i](name, arg1))) {
                arg1 = ret;
            }
        }

        // ensure we end up with a
        // middleware function
        if (typeof arg1 !== "function") {
            throw new Error("invalid param() call for " + name + ", got " + arg1);
        }

        (this.params[name] = this.params[name] || []).push(arg1);

        return this;
    }

    public handle(req: oven.ws.Request, res: oven.ws.Response, out: oven.ws.Next): void {
        const self = this;

        debug("dispatching %s %s", req.method, req.url);

        let idx = 0;
        const protohost = getProtohost(req.url) || "";
        let removed = "";
        let slashAdded = false;
        const calledParams = {} as ParamRecord;

        // store options for OPTIONS request
        // only used if OPTIONS request
        const options = [] as string[];

        // middleware and routes
        const stack = self.stack;

        // manage inter-router variables
        const parentParams = req.params;
        const parentUrl = req.baseUrl || "";
        let done = restore(out, req, "baseUrl", "next", "params");

        // setup next layer
        req.next = next;

        // for options requests, respond with a default if nothing else responds
        if (req.method === "OPTIONS") {
            done = wrap(done, function (old: oven.ws.Next, err: Error) {
                if (err || options.length === 0) {
                    return old(err);
                }
                sendOptionsResponse(res, options, old);
            });
        }

        // setup basic req values
        req.baseUrl = parentUrl;
        req.originalUrl = req.originalUrl || req.url;

        next();

        function next(err?: Error | "route" | "router") {
            let layerError = err === "route" ? null : err;

            // remove added slash
            if (slashAdded) {
                req.url = req.url.substr(1);
                slashAdded = false;
            }

            // restore altered req.url
            if (removed.length !== 0) {
                req.baseUrl = parentUrl;
                req.url = protohost + removed + req.url.substr(protohost.length);
                removed = "";
            }

            // signal to exit router
            if (layerError === "router") {
                setImmediate(done, null);
                return;
            }

            // no more matching layers
            if (idx >= stack.length) {
                setImmediate(done, layerError);
                return;
            }

            // get pathname of request
            const path = getPathname(req);

            if (path == null) {
                return done(layerError);
            }

            // find next matching layer
            let layer: Layer;
            let match;
            let route: Route;

            while (match !== true && idx < stack.length) {
                layer = stack[idx++];
                match = matchLayer(layer, path);
                route = layer.route;

                if (typeof match !== "boolean") {
                    // hold on to layerError
                    layerError = layerError || (match as Error);
                }

                if (match !== true) {
                    continue;
                }

                if (!route) {
                    // process non-route handlers normally
                    continue;
                }

                if (layerError) {
                    // routes do not match with a pending error
                    match = false;
                    continue;
                }

                const method = req.method;
                const hasMethod = route._handles_method(method);

                // build up automatic options response
                if (!hasMethod && method === "OPTIONS") {
                    appendMethods(options, route._options());
                }

                // don't even bother matching route
                if (!hasMethod && method !== "HEAD") {
                    match = false;
                    continue;
                }
            }

            // no match
            if (match !== true) {
                return done(layerError);
            }

            // store route for dispatch on change
            if (route) {
                req.route = route;
            }

            // Capture one-time layer values
            req.params = self.mergeParams ? mergeParams(layer.params, parentParams) : layer.params;
            const layerPath = layer.path;

            // this should be done for the layer
            self.process_params(layer, calledParams, req, res, (err: Error | "route" | "router") => {
                if (err) {
                    return next(layerError || err);
                }

                if (route) {
                    return layer.handle_request(req, res, next);
                }

                trim_prefix(layer, layerError as Error, layerPath, path);
            });
        }

        function trim_prefix(layer: Layer, layerError: Error, layerPath: string, path: string) {
            if (layerPath.length !== 0) {
                // Validate path breaks on a path separator
                const c = path[layerPath.length];
                if (c && c !== "/" && c !== ".") return next(layerError);

                // Trim off the part of the url that matches the route
                // middleware (.use stuff) needs to have the path stripped
                debug("trim prefix (%s) from url %s", layerPath, req.url);
                removed = layerPath;
                req.url = protohost + req.url.substr(protohost.length + removed.length);

                // Ensure leading slash
                if (!protohost && req.url[0] !== "/") {
                    req.url = "/" + req.url;
                    slashAdded = true;
                }

                // Setup base URL (no trailing slash)
                req.baseUrl = parentUrl + (removed[removed.length - 1] === "/" ? removed.substring(0, removed.length - 1) : removed);
            }

            debug("%s %s : %s", layer.name, layerPath, req.originalUrl);

            if (layerError) {
                layer.handle_error(layerError, req, res, next);
            } else {
                layer.handle_request(req, res, next);
            }
        }
    }

    /**
     * Process any parameters for the layer.
     */
    private process_params(layer: Layer, called: ParamRecord, req: oven.ws.Request, res: oven.ws.Response, done: oven.ws.Next) {
        const params = this.params;

        // captured parameters from the layer, keys and values
        const keys = layer.keys;

        // fast track
        if (!keys || keys.length === 0) {
            return done();
        }

        let i = 0;
        let name: number | string;
        let paramIndex = 0;
        let key: Key;
        let paramVal: any;
        let paramCallbacks: ParamCallback[];
        let paramCalled: Param;

        // process params in order
        // param callbacks can be async
        function param(err?: Error | "route"): void {
            if (err) {
                return done(err as Error);
            }

            if (i >= keys.length) {
                return done();
            }

            paramIndex = 0;
            key = keys[i++];
            name = key.name;
            paramVal = req.params[name];
            paramCallbacks = params[name];
            paramCalled = called[name];

            if (paramVal === undefined || !paramCallbacks) {
                return param();
            }

            // param previously called with same value or error occurred
            if (paramCalled && (paramCalled.match === paramVal || (paramCalled.error && paramCalled.error !== "route"))) {
                // restore value
                req.params[name] = paramCalled.value;

                // next param
                return param(paramCalled.error);
            }

            called[name] = paramCalled = {
                error: null,
                match: paramVal,
                value: paramVal,
            };

            paramCallback();
        }

        // single param callbacks
        function paramCallback(err?: Error) {
            const fn = paramCallbacks[paramIndex++];

            // store updated value
            paramCalled.value = req.params[key.name];

            if (err) {
                // store error
                paramCalled.error = err;
                param(err);
                return;
            }

            if (!fn) {
                return param();
            }

            try {
                fn(req, res, paramCallback, paramVal, key.name);
            } catch (e) {
                paramCallback(e);
            }
        }

        param();
    }

    /**
     * Use the given middleware function, with optional path, defaulting to "/".
     *
     * Use (like `.all`) will run for any http METHOD, but it will not add
     * handlers for those methods so OPTIONS requests will not consider `.use`
     * functions even if they could respond.
     *
     * The other difference is that _route_ path is stripped and not visible
     * to the handler function. The main effect of this feature is that mounted
     * handlers can operate without any code changes regardless of the "prefix"
     * pathname.
     */
    public use: oven.ws.ApplicationHandler<this>;

    /**
     * Create a new Route for the given path.
     *
     * Each route contains a separate middleware stack and VERB handlers.
     *
     * See the Route api documentation for details on adding handlers
     * and middleware to routes.
     *
     * @param {String} path
     * @return {Route}
     * @public
     */
    public route(path: PathParams): Route {
        const route = new Route(path);
        const layer = new Layer(
            path,
            {
                sensitive: this.caseSensitive,
                strict: this.strict,
                end: true,
            },
            route.dispatch.bind(route),
        );
        layer.route = route;
        this.stack.push(layer);

        return route;
    }

    /**
     * Special-cased "all" method, applying the given route `path`,
     * middleware, and callback to _every_ HTTP method.
     */
    public all: oven.ws.RouterMatcher<this>;
    public get: oven.ws.RouterMatcher<this>;
    public head: oven.ws.RouterMatcher<this>;
    public post: oven.ws.RouterMatcher<this>;
    public put: oven.ws.RouterMatcher<this>;
    public delete: oven.ws.RouterMatcher<this>;
    public connect: oven.ws.RouterMatcher<this>;
    public options: oven.ws.RouterMatcher<this>;
    public trace: oven.ws.RouterMatcher<this>;
    public patch: oven.ws.RouterMatcher<this>;
}

Router.prototype.use = function (this: Router, fn: any): Router {
    let offset = 0;
    let path = "/";

    // default path to '/'
    // disambiguate router.use([fn])
    if (!isRoutable(fn)) {
        let arg0: typeof fn = fn;

        while (Array.isArray(arg0) && arg0.length !== 0) {
            arg0 = arg0[0];
        }

        // first arg is the path
        if (!isRoutable(arg0)) {
            offset = 1;
            path = fn;
        }
    }

    const callbacks = flatten(slice.call(arguments, offset));

    if (callbacks.length === 0) {
        throw new TypeError("Router.use() requires a middleware function");
    }

    for (let i = 0; i < callbacks.length; i++) {
        let cb = callbacks[i];

        if (cb instanceof Router) {
            cb = cb.handle.bind(cb);
        } else if (typeof cb !== "function") {
            throw new TypeError("Router.use() requires a middleware function or router but got a " + getType(cb));
        }

        // add the middleware
        debug("use %o %s", path, cb.name || "<anonymous>");

        const layer = new Layer(
            path,
            {
                sensitive: this.caseSensitive,
                strict: false,
                end: false,
            },
            cb,
        );

        layer.route = undefined;

        this.stack.push(layer);
    }

    return this;
};

// create Router#VERB functions
(methods as string[]).concat("all").forEach(function (method: RouterMethod) {
    Router.prototype[method] = function (path: string) {
        const route = this.route(path);
        route[method].apply(route, slice.call(arguments, 1));
        return this;
    };
});

// append methods to a list of methods
function appendMethods(list: string[], addition: string[]) {
    for (let i = 0; i < addition.length; i++) {
        const method = addition[i];
        if (list.indexOf(method) === -1) {
            list.push(method);
        }
    }
}

// get pathname of request
function getPathname(req: oven.ws.Request) {
    try {
        return parseUrl(req).pathname;
    } catch (err) {
        return undefined;
    }
}

// Get get protocol + host for a URL
function getProtohost(url: string) {
    if (typeof url !== "string" || url.length === 0 || url[0] === "/") {
        return undefined;
    }

    const searchIndex = url.indexOf("?");
    const pathLength = searchIndex !== -1 ? searchIndex : url.length;
    const fqdnIndex = url.substr(0, pathLength).indexOf("://");

    return fqdnIndex !== -1 ? url.substr(0, url.indexOf("/", 3 + fqdnIndex)) : undefined;
}

// get type for error message
function getType(obj: any) {
    const type = typeof obj;

    if (type !== "object") {
        return type;
    }

    // inspect [[Class]] for objects
    return toString.call(obj).replace(objectRegExp, "$1");
}

/**
 * Match path to a layer.
 *
 * @param {Layer} layer
 * @param {string} path
 * @private
 */

function matchLayer(layer: Layer, path: string): boolean | Error {
    try {
        return layer.match(path);
    } catch (err) {
        return err;
    }
}

// merge params with parent params
function mergeParams(params: ParamsDictionary, parent: Params): ParamsDictionary {
    if (typeof parent !== "object" || !parent) {
        return params;
    }

    // make copy of parent for base
    const obj = mixin({}, parent);

    // simple non-numeric merging
    if (!(0 in params) || !(0 in parent)) {
        return mixin(obj, params);
    }

    let i = 0;
    let o = 0;

    // determine numeric gaps
    while (i in params) {
        i++;
    }

    while (o in parent) {
        o++;
    }

    // offset numeric indices in params before merge
    for (i--; i >= 0; i--) {
        params[i + o] = params[i];

        // create holes for the merge when necessary
        if (i < o) {
            delete params[i];
        }
    }

    return mixin(obj, params);
}

// restore obj props after function
function restore(fn: oven.ws.Next, obj: any, ...args: any[]): oven.ws.Next {
    const props = new Array(args.length);
    const vals = new Array(args.length);

    for (let i = 0; i < props.length; i++) {
        props[i] = args[i];
        vals[i] = obj[props[i]];
    }

    return function () {
        // restore vals
        for (let i = 0; i < props.length; i++) {
            obj[props[i]] = vals[i];
        }

        return fn.apply(this, arguments);
    };
}

// send an OPTIONS response
function sendOptionsResponse(res: oven.ws.Response, options: string[], next: oven.ws.Next) {
    try {
        const body = options.join(",");
        res.set("Allow", body);
        res.send(body);
    } catch (err) {
        next(err);
    }
}

// wrap a function
function wrap(old: oven.ws.Next, fn: (old: oven.ws.Next, err: Error) => void) {
    return function proxy() {
        fn.apply(this, [old, ...Array.from(arguments)]);
    };
}

export function isRoutable(fn: any) {
    return typeof fn === "function" || fn instanceof Router;
}
