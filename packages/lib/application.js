var __extends = this && this.__extends || function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function (d, b) {
            d.__proto__ = b;
        } || function (d, b) {
            for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
        };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null) throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() {
            this.constructor = d;
        }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
}();
import finalhandler from "finalhandler";
import Router from "./router";
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
var debug = dbg("oven/ws:application");
var slice = Array.prototype.slice;
var Application = /** @class */function (_super) {
    __extends(Application, _super);
    function Application() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Application.prototype.init = function () {
        this.cache = {};
        this.engines = {};
        this.settings = {};
        this.defaultConfiguration();
    };
    Application.prototype.defaultConfiguration = function () {
        var env = process.env.NODE_ENV || "development";
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
            value: true
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
    };
    Application.prototype.lazyRouter = function () {
        if (!this.router) {
            this.router = new Router({
                caseSensitive: this.enabled("case sensitive routing"),
                strict: this.enabled("strict routing")
            });
            this.router.use(query(this.$("query parser fn")));
            this.router.use(middleware.init(this));
        }
    };
    Application.prototype.handle = function (req, res, callback) {
        var router = this.router;
        // final handler
        var done = callback || finalhandler(req, res, {
            env: this.$("env"),
            onerror: logError.bind(this)
        });
        // no routes
        if (!router) {
            debug("no routes defined on app");
            done();
            return;
        }
        router.handle(req, res, done);
    };
    Application.prototype.route = function (path) {
        this.lazyRouter();
        return this.router.route(path);
    };
    Application.prototype.engine = function (ext, fn) {
        if (typeof fn !== "function") {
            throw new Error("callback function required");
        }
        // get file extension
        var extension = ext[0] !== "." ? "." + ext : ext;
        // store engine
        this.engines[extension] = fn;
        return this;
    };
    Application.prototype.param = function (arg0, arg1) {
        this.lazyRouter();
        if (Array.isArray(arg0)) {
            for (var i = 0; i < arg0.length; i++) {
                this.param(arg0[i], arg1);
            }
            return this;
        }
        this.router.param(arg0, arg1);
        return this;
    };
    Application.prototype.$ = function (setting, value) {
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
                        value: false
                    });
                    break;
            }
            return this;
        }
        return this.settings[setting];
    };
    Application.prototype.path = function () {
        return this.parent ? this.parent.path() + this.mountPath : "";
    };
    Application.prototype.enabled = function (setting) {
        return Boolean(this.$(setting));
    };
    Application.prototype.disabled = function (setting) {
        return !this.$(setting);
    };
    Application.prototype.enable = function (setting) {
        return this.$(setting, true);
    };
    Application.prototype.disable = function (setting) {
        return this.$(setting, false);
    };
    Application.prototype.all = function (path) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        this.lazyRouter();
        var route = this.router.route(path);
        for (var i = 0; i < methods.length; i++) {
            route[methods[i]].apply(route, args);
        }
        return this;
    };
    Application.prototype.render = function (name, options, callback) {
        var cache = this.cache;
        var engines = this.engines;
        var renderOptions = {};
        var opts;
        var done;
        var view;
        // support callback function as second arg
        if (typeof options === "function") {
            done = options;
            opts = {};
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
            var View_1 = this.$("view");
            view = new View_1(name, {
                defaultEngine: this.$("view engine"),
                root: this.$("views"),
                engines: engines
            });
            if (!view.path) {
                var dirs = Array.isArray(view.root) && view.root.length > 1 ? 'directories "' + view.root.slice(0, -1).join('", "') + '" or "' + view.root[view.root.length - 1] + '"' : 'directory "' + view.root + '"';
                var err = new Error('Failed to lookup view "' + name + '" in views ' + dirs);
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
    };
    Application.prototype.listen = function () {
        var server = http.createServer(this.handle);
        return server.listen.apply(server, arguments);
    };
    return Application;
}(EventEmitter);
export default Application;
Application.prototype.use = function (fn) {
    var offset = 0;
    var path = "/";
    // default path to '/'
    // disambiguate app.use([fn])
    if (typeof fn !== "function") {
        var arg = fn;
        while (Array.isArray(arg) && arg.length !== 0) {
            arg = arg[0];
        }
        // first arg is the path
        if (typeof arg !== "function") {
            offset = 1;
            path = fn;
        }
    }
    var fns = flatten(slice.call(arguments, offset));
    if (fns.length === 0) {
        throw new TypeError("app.use() requires a middleware function");
    }
    // setup router
    this.lazyRouter();
    var router = this.router;
    fns.forEach(function (fn) {
        // non-ws app
        if (!fn || !fn.handle || !fn.$) {
            return router.use(path, fn);
        }
        debug(".use app under %s", path);
        fn.mountPath = path;
        fn.parent = this;
        // restore .app property on req and res
        router.use(path, function mounted_app(req, res, next) {
            var orig = req.app;
            fn.handle(req, res, function (err) {
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
var trustProxyDefaultSymbol = "@@symbol:trust_proxy_default";
methods.forEach(function (method) {
    Application.prototype[method] = function (path) {
        this.lazyRouter();
        var route = this.router.route(path);
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
function logError(err) {
    /* istanbul ignore next */
    if (this.$("env") !== "test") {
        console.error(err.stack || err.toString());
    }
}
/**
 * Try rendering a view.
 * @private
 */
function tryRender(view, options, callback) {
    try {
        view.render(options, callback);
    } catch (err) {
        callback(err);
    }
}
//# sourceMappingURL=application.js.map
//# sourceMappingURL=application.js.map