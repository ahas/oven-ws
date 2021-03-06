var __spreadArray = this && this.__spreadArray || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++) to[j] = from[i];
    return to;
};
import Route from "./route";
import Layer from "./layer";
import methods from "../methods";
import mixin from "utils-merge";
import dbg from "debug";
import { flatten } from "array-flatten";
import parseUrl from "parseurl";
var debug = dbg("oven/ws:router");
var objectRegExp = /^\[object (\S+)\]$/;
var slice = Array.prototype.slice;
var toString = Object.prototype.toString;
var Router = /** @class */function () {
    function Router(options) {
        var opts = options || {};
        this.params = {};
        this._params = [];
        this.caseSensitive = opts.caseSensitive;
        this.mergeParams = opts.mergeParams;
        this.strict = opts.strict;
        this.stack = [];
    }
    Router.prototype.param = function (arg0, arg1) {
        // param logic
        if (typeof arg0 === "function") {
            this._params.push(arg0);
            return;
        }
        // apply param functions
        var name = arg0;
        var params = this._params;
        var len = params.length;
        var ret;
        for (var i = 0; i < len; ++i) {
            if (ret = params[i](name, arg1)) {
                arg1 = ret;
            }
        }
        // ensure we end up with a
        // middleware function
        if (arg1 && typeof arg1 !== "function") {
            throw new Error("invalid param() call for " + name + ", got " + arg1);
        }
        (this.params[name] = this.params[name] || []).push(arg1);
        return this;
    };
    Router.prototype.handle = function (req, res, out) {
        var self = this;
        debug("dispatching %s %s", req.method, req.url);
        var idx = 0;
        var protohost = getProtohost(req.url) || "";
        var removed = "";
        var slashAdded = false;
        var calledParams = {};
        // store options for OPTIONS request
        // only used if OPTIONS request
        var options = [];
        // middleware and routes
        var stack = self.stack;
        // manage inter-router variables
        var parentParams = req.params;
        var parentUrl = req.baseUrl || "";
        var done = restore(out, req, "baseUrl", "next", "params");
        // setup next layer
        req.next = next;
        // for options requests, respond with a default if nothing else responds
        if (req.method === "OPTIONS") {
            done = wrap(done, function (old, err) {
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
        function next(err) {
            var layerError = err === "route" ? null : err;
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
            var path = getPathname(req);
            if (path == null) {
                return done(layerError);
            }
            // find next matching layer
            var layer;
            var match;
            var route;
            while (match !== true && idx < stack.length) {
                layer = stack[idx++];
                match = matchLayer(layer, path);
                route = layer.route;
                if (typeof match !== "boolean") {
                    // hold on to layerError
                    layerError = layerError || match;
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
                var method = req.method;
                var hasMethod = route._handles_method(method);
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
            var layerPath = layer.path;
            // this should be done for the layer
            self.process_params(layer, calledParams, req, res, function (err) {
                if (err) {
                    return next(layerError || err);
                }
                if (route) {
                    return layer.handle_request(req, res, next);
                }
                trim_prefix(layer, layerError, layerPath, path);
            });
        }
        function trim_prefix(layer, layerError, layerPath, path) {
            if (layerPath.length !== 0) {
                // Validate path breaks on a path separator
                var c = path[layerPath.length];
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
    };
    /**
     * Process any parameters for the layer.
     */
    Router.prototype.process_params = function (layer, called, req, res, done) {
        var params = this.params;
        // captured parameters from the layer, keys and values
        var keys = layer.keys;
        // fast track
        if (!keys || keys.length === 0) {
            return done();
        }
        var i = 0;
        var name;
        var paramIndex = 0;
        var key;
        var paramVal;
        var paramCallbacks;
        var paramCalled;
        // process params in order
        // param callbacks can be async
        function param(err) {
            if (err) {
                return done(err);
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
            if (paramCalled && (paramCalled.match === paramVal || paramCalled.error && paramCalled.error !== "route")) {
                // restore value
                req.params[name] = paramCalled.value;
                // next param
                return param(paramCalled.error);
            }
            called[name] = paramCalled = {
                error: null,
                match: paramVal,
                value: paramVal
            };
            paramCallback();
        }
        // single param callbacks
        function paramCallback(err) {
            var fn = paramCallbacks[paramIndex++];
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
    };
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
    Router.prototype.route = function (path) {
        var route = new Route(path);
        var layer = new Layer(path, {
            sensitive: this.caseSensitive,
            strict: this.strict,
            end: true
        }, route.dispatch.bind(route));
        layer.route = route;
        this.stack.push(layer);
        return route;
    };
    return Router;
}();
export default Router;
Router.prototype.use = function (fn) {
    var offset = 0;
    var path = "/";
    // default path to '/'
    // disambiguate router.use([fn])
    if (typeof fn !== "function") {
        var arg0 = fn;
        while (Array.isArray(arg0) && arg0.length !== 0) {
            arg0 = arg0[0];
        }
        // first arg is the path
        if (typeof arg0 !== "function") {
            offset = 1;
            path = fn;
        }
    }
    var callbacks = flatten(slice.call(arguments, offset));
    if (callbacks.length === 0) {
        throw new TypeError("Router.use() requires a middleware function");
    }
    for (var i = 0; i < callbacks.length; i++) {
        var cb = callbacks[i];
        if (typeof cb !== "function") {
            throw new TypeError("Router.use() requires a middleware function but got a " + getType(cb));
        }
        // add the middleware
        debug("use %o %s", path, cb.name || "<anonymous>");
        var layer = new Layer(path, {
            sensitive: this.caseSensitive,
            strict: false,
            end: false
        }, cb);
        layer.route = undefined;
        this.stack.push(layer);
    }
    return this;
};
// create Router#VERB functions
methods.concat("all").forEach(function (method) {
    Router.prototype[method] = function (path) {
        var route = this.route(path);
        route[method].apply(route, slice.call(arguments, 1));
        return this;
    };
});
// append methods to a list of methods
function appendMethods(list, addition) {
    for (var i = 0; i < addition.length; i++) {
        var method = addition[i];
        if (list.indexOf(method) === -1) {
            list.push(method);
        }
    }
}
// get pathname of request
function getPathname(req) {
    try {
        return parseUrl(req).pathname;
    } catch (err) {
        return undefined;
    }
}
// Get get protocol + host for a URL
function getProtohost(url) {
    if (typeof url !== "string" || url.length === 0 || url[0] === "/") {
        return undefined;
    }
    var searchIndex = url.indexOf("?");
    var pathLength = searchIndex !== -1 ? searchIndex : url.length;
    var fqdnIndex = url.substr(0, pathLength).indexOf("://");
    return fqdnIndex !== -1 ? url.substr(0, url.indexOf("/", 3 + fqdnIndex)) : undefined;
}
// get type for error message
function getType(obj) {
    var type = typeof obj;
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
function matchLayer(layer, path) {
    try {
        return layer.match(path);
    } catch (err) {
        return err;
    }
}
// merge params with parent params
function mergeParams(params, parent) {
    if (typeof parent !== "object" || !parent) {
        return params;
    }
    // make copy of parent for base
    var obj = mixin({}, parent);
    // simple non-numeric merging
    if (!(0 in params) || !(0 in parent)) {
        return mixin(obj, params);
    }
    var i = 0;
    var o = 0;
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
function restore(fn, obj) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    var props = new Array(args.length);
    var vals = new Array(args.length);
    for (var i = 0; i < props.length; i++) {
        props[i] = args[i];
        vals[i] = obj[props[i]];
    }
    return function () {
        // restore vals
        for (var i = 0; i < props.length; i++) {
            obj[props[i]] = vals[i];
        }
        return fn.apply(this, arguments);
    };
}
// send an OPTIONS response
function sendOptionsResponse(res, options, next) {
    try {
        var body = options.join(",");
        res.set("Allow", body);
        res.send(body);
    } catch (err) {
        next(err);
    }
}
// wrap a function
function wrap(old, fn) {
    return function proxy() {
        fn.apply(this, __spreadArray([old], Array.from(arguments)));
    };
}
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map