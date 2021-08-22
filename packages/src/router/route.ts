import dbg from "debug";
import { flatten } from "array-flatten";
import Layer from "./layer";
import methods from "../methods";
import { PathParams } from "../types";

const debug = dbg("oven/ws:router:route");

const toString = Object.prototype.toString;

export default class Route {
    public path: PathParams;
    public stack: Layer[];
    public methods: Record<string, boolean>;

    /**
     * Initialize `Route` with the given `path`,
     *
     * @param {String} path
     * @public
     */
    constructor(path: PathParams) {
        this.path = path;
        this.stack = [];

        debug("new %o", path);

        // route handlers for various http methods
        this.methods = {};
    }

    /**
     * Determine if the route handles a given method.
     */
    public _handles_method(method: string): boolean {
        if (this.methods._all) {
            return true;
        }

        let name = method.toLowerCase();

        if (name === "head" && !this.methods["head"]) {
            name = "get";
        }

        return Boolean(this.methods[name]);
    }

    /**
     * @return {Array} supported HTTP methods
     */
    public _options(): string[] {
        const methods = Object.keys(this.methods);

        // append automatic head
        if (this.methods.get && !this.methods.head) {
            methods.push("head");
        }

        for (let i = 0; i < methods.length; i++) {
            // make upper case
            methods[i] = methods[i].toUpperCase();
        }

        return methods;
    }

    public all(...handlers: oven.ws.RequestHandler[]): this {
        handlers = flatten(handlers);

        for (let i = 0; i < handlers.length; i++) {
            const handle = handlers[i];

            if (typeof handle !== "function") {
                const type = toString.call(handle);
                const msg = `Route.all() requires a callback function but got a ${type}`;
                throw new TypeError(msg);
            }

            const layer = new Layer("/", {}, handle);
            layer.method = undefined;

            this.methods._all = true;
            this.stack.push(layer);
        }
        return this;
    }

    public dispatch: oven.ws.RequestHandler;
    public get: oven.ws.RouterHandler<this>;
    public head: oven.ws.RouterHandler<this>;
    public post: oven.ws.RouterHandler<this>;
    public put: oven.ws.RouterHandler<this>;
    public delete: oven.ws.RouterHandler<this>;
    public connect: oven.ws.RouterHandler<this>;
    public options: oven.ws.RouterHandler<this>;
    public trace: oven.ws.RouterHandler<this>;
    public patch: oven.ws.RouterHandler<this>;
}
/**
 * dispatch req, res into this route
 */
Route.prototype.dispatch = function dispatch(req: oven.ws.Request, res: oven.ws.Response, done: oven.ws.Next): void {
    let idx = 0;
    const stack = this.stack;
    if (stack.length === 0) {
        return done();
    }

    let method = req.method.toLowerCase();
    if (method === "head" && !this.methods["head"]) {
        method = "get";
    }

    req.route = this;

    next();

    function next(err?: Error | "route" | "router"): void {
        // signal to exit route
        if (err && err === "route") {
            return done();
        }

        // signal to exit router
        if (err && err === "router") {
            return done(err);
        }

        const layer = stack[idx++];
        if (!layer) {
            return done(err as Error);
        }

        if (layer.method && layer.method !== method) {
            return next(err);
        }

        if (err) {
            layer.handle_error(err as Error, req, res, next);
        } else {
            layer.handle_request(req, res, next);
        }
    }
};

/**
 * Add a handler for all HTTP verbs to this route.
 *
 * Behaves just like middleware and can respond or call `next`
 * to continue processing.
 *
 * You can use multiple `.all` call to add multiple handlers.
 *
 *   function check_something(req, res, next){
 *     next();
 *   };
 *
 *   function validate_user(req, res, next){
 *     next();
 *   };
 *
 *   route
 *   .all(validate_user)
 *   .all(check_something)
 *   .get(function(req, res, next){
 *     res.send('hello world');
 *   });
 *
 * @param {function} handler
 * @return {Route} for chaining
 */

// Automatic generation for HTTP request methods.
methods.forEach((method) => {
    (Route.prototype as any)[method] = function () {
        const handles = flatten(Array.from(arguments));

        for (let i = 0; i < handles.length; i++) {
            const handle = handles[i];

            if (typeof handle !== "function") {
                const type = toString.call(handle);
                const msg = `Route.${method}() requires a callback function but got a ${type}`;
                throw new TypeError(msg);
            }

            const layer = new Layer("/", {}, handle);
            layer.method = method;
            this.methods[method] = true;
            this.stack.push(layer);
        }
        return this;
    };
});
