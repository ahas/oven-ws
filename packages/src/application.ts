import finalhandler from "finalhandler";
import Router, { isRoutable } from "./router";
import methods from "./methods";
import * as middleware from "./middleware/init";
import query from "./middleware/query";
import dbg from "debug";
import View from "./view";
import http from "http";
import { compileETag } from "./utils";
import { compileQueryParser } from "./utils";
import { compileTrust } from "./utils";
import { flatten } from "array-flatten";
import merge from "utils-merge";
import { resolve } from "path";
import setPrototypeOf from "setprototypeof";
import { EventEmitter } from "stream";
import { PathParams, RenderOptions, RouterMethod } from "./types";
import Route from "./router/route";
import { ListenOptions } from "net";

const debug = dbg("oven/ws:application");
const slice = Array.prototype.slice;

export default class Application extends EventEmitter {
    public cache: any;
    public engines: any;
    public settings: any;
    public locals: Record<string, any>;
    public request: oven.ws.Request;
    public response: oven.ws.Response;
    public mountPath: string;
    public parent: Application;

    public router: Router;

    public init(): void {
        this.cache = {};
        this.engines = {};
        this.settings = {};

        this.defaultConfiguration();
    }

    public defaultConfiguration(): void {
        const env = process.env.NODE_ENV || "development";

        // default settings
        this.enable("x-powered-by");
        this.$("etag", "weak");
        this.$("env", env);
        this.$("query parser", "extended");
        this.$("subdomain offset", 2);
        this.$("trust proxy", false);

        // trust proxy inherit back-compat
        Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
            configurable: true,
            value: true,
        });

        debug("booting in %s mode", env);

        this.on("mount", function onmount(parent) {
            // inherit trust proxy
            if (this.settings[trustProxyDefaultSymbol] === true && typeof parent.settings["trust proxy fn"] === "function") {
                delete this.settings["trust proxy"];
                delete this.settings["trust proxy fn"];
            }

            // inherit protos
            setPrototypeOf(this.request, parent.request);
            setPrototypeOf(this.response, parent.response);
            setPrototypeOf(this.engines, parent.engines);
            setPrototypeOf(this.settings, parent.settings);
        });

        // setup locals
        this.locals = Object.create(null);

        // default locals
        this.locals.settings = this.settings;

        // top-most app is mounted at /
        this.mountPath = "/";

        // default configuration
        this.$("view", View);
        this.$("views", resolve("views"));
        this.$("jsonp callback name", "callback");

        if (env === "production") {
            this.enable("view cache");
        }
    }

    protected lazyRouter() {
        if (!this.router) {
            this.router = new Router({
                caseSensitive: this.enabled("case sensitive routing"),
                strict: this.enabled("strict routing"),
            });

            this.router.use(query(this.$("query parser fn")));
            this.router.use(middleware.init(this));
        }
        return this.router;
    }

    public handle(req: oven.ws.Request, res: oven.ws.Response, cb?: oven.ws.Next): void {
        const router = this.router;

        // final handler
        const done =
            cb ||
            finalhandler(req, res, {
                env: this.$("env"),
                onerror: logError.bind(this),
            });

        // no routes
        if (!router) {
            debug("no routes defined on app");
            done();
            return;
        }

        router.handle(req, res, done);
    }

    public use: oven.ws.ApplicationHandler<this>;

    public route(path: string): Route {
        this.lazyRouter();
        return this.router.route(path);
    }

    public engine(ext: string, fn: (path: string, options: object, callback: (e: any, rendered?: string) => void) => void): this {
        if (typeof fn !== "function") {
            throw new Error("callback function required");
        }

        // get file extension
        const extension = ext[0] !== "." ? "." + ext : ext;

        // store engine
        this.engines[extension] = fn;

        return this;
    }

    public param(name: string | string[], handler: oven.ws.ParamHandler): this;
    public param(name: string | string[], regexp: RegExp): this;
    public param(handler: (name: string, matcher: RegExp) => oven.ws.ParamHandler): this;
    public param(arg0: string | string[] | ((name: string, matcher: RegExp) => oven.ws.ParamHandler), arg1?: oven.ws.ParamHandler | RegExp): this {
        this.lazyRouter();

        if (Array.isArray(arg0)) {
            for (let i = 0; i < arg0.length; i++) {
                this.param(arg0[i] as string, arg1 as RegExp);
            }

            return this;
        }

        this.router.param(arg0 as string, arg1 as RegExp);

        return this;
    }

    public $(setting: string): any;
    public $(setting: string, value: any): this;
    public $(setting: any, value?: any): any {
        if (arguments.length == 2) {
            debug('set "%s" to %o', setting, value);

            // set value
            this.settings[setting] = value;

            // trigger matched settings
            switch (setting) {
                case "etag":
                    this.$("etag fn", compileETag(value));
                    break;
                case "query parser":
                    this.$("query parser fn", compileQueryParser(value));
                    break;
                case "trust proxy":
                    this.$("trust proxy fn", compileTrust(value));

                    // trust proxy inherit back-compat
                    Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
                        configurable: true,
                        value: false,
                    });

                    break;
            }

            return this;
        }
        return this.settings[setting];
    }

    public path(): string {
        return this.parent ? this.parent.path() + this.mountPath : "";
    }

    public enabled(setting: string): boolean {
        return Boolean(this.$(setting));
    }

    public disabled(setting: string): boolean {
        return !this.$(setting);
    }

    public enable(setting: string): this {
        return this.$(setting, true);
    }

    public disable(setting: string): this {
        return this.$(setting, false);
    }

    public all(path: PathParams, ...args: oven.ws.RequestHandler[]): this {
        this.lazyRouter();

        const route = this.router.route(path);

        for (let i = 0; i < methods.length; i++) {
            (route as any)[methods[i]].apply(route, args);
        }

        return this;
    }

    public render(name: string, options: RenderOptions | oven.ws.RenderCallback, callback?: oven.ws.RenderCallback): void {
        const cache = this.cache;
        const engines = this.engines;
        const renderOptions = {} as RenderOptions;
        let opts;
        let done;
        let view;

        // support callback function as second arg
        if (typeof options === "function") {
            done = options as oven.ws.RenderCallback;
            opts = {} as RenderOptions;
        } else {
            done = callback;
            opts = options;
        }

        // merge app.locals
        merge(renderOptions, this.locals);

        // merge options._locals
        if (opts._locals) {
            merge(renderOptions, opts._locals);
        }

        // merge options
        merge(renderOptions, opts);

        // set .cache unless explicitly provided
        if (renderOptions.cache == null) {
            renderOptions.cache = this.enabled("view cache");
        }

        // primed cache
        if (renderOptions.cache) {
            view = cache[name];
        }

        // view
        if (!view) {
            const View = this.$("view");

            view = new View(name, {
                defaultEngine: this.$("view engine"),
                root: this.$("views"),
                engines: engines,
            });

            if (!view.path) {
                const dirs =
                    Array.isArray(view.root) && view.root.length > 1
                        ? 'directories "' + view.root.slice(0, -1).join('", "') + '" or "' + view.root[view.root.length - 1] + '"'
                        : 'directory "' + view.root + '"';
                const err = new Error('Failed to lookup view "' + name + '" in views ' + dirs) as ViewError;
                err.view = view;

                return done(err);
            }

            // prime the cache
            if (renderOptions.cache) {
                cache[name] = view;
            }
        }

        // render
        tryRender(view, renderOptions, done);
    }

    public listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): http.Server;
    public listen(port?: number, hostname?: string, listeningListener?: () => void): http.Server;
    public listen(port?: number, backlog?: number, listeningListener?: () => void): http.Server;
    public listen(port?: number, listeningListener?: () => void): http.Server;
    public listen(path: string, backlog?: number, listeningListener?: () => void): http.Server;
    public listen(path: string, listeningListener?: () => void): http.Server;
    public listen(options: ListenOptions, listeningListener?: () => void): http.Server;
    public listen(handle: any, backlog?: number, listeningListener?: () => void): http.Server;
    public listen(handle: any, listeningListener?: () => void): http.Server;
    public listen(): http.Server {
        const server = http.createServer(this.handle);
        return server.listen.apply(server, arguments);
    }

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

function isNotApp(fn: any) {
    return !fn || !fn.handle || !fn.$;
}

Application.prototype.use = function (this: Application, fn: any): Application {
    let offset = 0;
    let path = "/";

    // default path to '/'
    // disambiguate app.use([fn])
    if (!isRoutable(fn)) {
        let arg: typeof fn = fn;

        while (Array.isArray(arg) && arg.length !== 0) {
            arg = arg[0];
        }

        // first arg is the path
        if (!isRoutable(arg)) {
            offset = 1;
            path = fn;
        }
    }

    const fns = flatten(slice.call(arguments, offset));

    if (fns.length === 0) {
        throw new TypeError("app.use() requires a middleware function");
    }

    const router = this.lazyRouter();

    fns.forEach(function (fn) {
        // non-ws app
        if (isNotApp(fn)) {
            return router.use(path, fn);
        }

        debug(".use app under %s", path);
        fn.mountPath = path;
        fn.parent = this;

        // restore .app property on req and res
        router.use(path, function mounted_app(req: oven.ws.Request, res: oven.ws.Response, next: oven.ws.Next) {
            const orig = req.app;
            fn.handle(req, res, function (err: Error) {
                setPrototypeOf(req, orig.request);
                setPrototypeOf(res, orig.response);
                next(err);
            });
        });

        // mounted an app
        fn.emit("mount", this);
    }, this);

    return this;
};

const trustProxyDefaultSymbol = "@@symbol:trust_proxy_default";

methods.forEach(function (method: RouterMethod) {
    Application.prototype[method] = function (path: string) {
        this.lazyRouter();

        const route = this.router.route(path);
        route[method].apply(route, slice.call(arguments, 1));
        return this;
    };
});

/**
 * Log error using console.error.
 *
 * @param {Error} err
 * @private
 */
function logError(err: Error) {
    /* istanbul ignore next */
    if (this.$("env") !== "test") {
        console.error(err.stack || err.toString());
    }
}

/**
 * Try rendering a view.
 * @private
 */
function tryRender(view: any, options: RenderOptions, callback: oven.ws.RenderCallback) {
    try {
        view.render(options, callback);
    } catch (err) {
        callback(err);
    }
}
