import dbg from "debug";
import { flatten } from "array-flatten";
import Layer from "./layer";
import methods from "../methods";
var debug = dbg("oven/ws:router:route");
var toString = Object.prototype.toString;
var Route = /** @class */function () {
    /**
     * Initialize `Route` with the given `path`,
     *
     * @param {String} path
     * @public
     */
    function Route(path) {
        this.path = path;
        this.stack = [];
        debug("new %o", path);
        // route handlers for various http methods
        this.methods = {};
    }
    /**
     * Determine if the route handles a given method.
     */
    Route.prototype._handles_method = function (method) {
        if (this.methods._all) {
            return true;
        }
        var name = method.toLowerCase();
        if (name === "head" && !this.methods["head"]) {
            name = "get";
        }
        return Boolean(this.methods[name]);
    };
    /**
     * @return {Array} supported HTTP methods
     */
    Route.prototype._options = function () {
        var methods = Object.keys(this.methods);
        // append automatic head
        if (this.methods.get && !this.methods.head) {
            methods.push("head");
        }
        for (var i = 0; i < methods.length; i++) {
            // make upper case
            methods[i] = methods[i].toUpperCase();
        }
        return methods;
    };
    Route.prototype.all = function () {
        var handlers = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            handlers[_i] = arguments[_i];
        }
        handlers = flatten(handlers);
        for (var i = 0; i < handlers.length; i++) {
            var handle = handlers[i];
            if (typeof handle !== "function") {
                var type = toString.call(handle);
                var msg = "Route.all() requires a callback function but got a " + type;
                throw new TypeError(msg);
            }
            var layer = new Layer("/", {}, handle);
            layer.method = undefined;
            this.methods._all = true;
            this.stack.push(layer);
        }
        return this;
    };
    return Route;
}();
export default Route;
/**
 * dispatch req, res into this route
 */
Route.prototype.dispatch = function dispatch(req, res, done) {
    var idx = 0;
    var stack = this.stack;
    if (stack.length === 0) {
        return done();
    }
    var method = req.method.toLowerCase();
    if (method === "head" && !this.methods["head"]) {
        method = "get";
    }
    req.route = this;
    next();
    function next(err) {
        // signal to exit route
        if (err && err === "route") {
            return done();
        }
        // signal to exit router
        if (err && err === "router") {
            return done(err);
        }
        var layer = stack[idx++];
        if (!layer) {
            return done(err);
        }
        if (layer.method && layer.method !== method) {
            return next(err);
        }
        if (err) {
            layer.handle_error(err, req, res, next);
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
methods.forEach(function (method) {
    Route.prototype[method] = function () {
        var handles = flatten(Array.from(arguments));
        for (var i = 0; i < handles.length; i++) {
            var handle = handles[i];
            if (typeof handle !== "function") {
                var type = toString.call(handle);
                var msg = "Route." + method + "() requires a callback function but got a " + type;
                throw new TypeError(msg);
            }
            var layer = new Layer("/", {}, handle);
            layer.method = method;
            this.methods[method] = true;
            this.stack.push(layer);
        }
        return this;
    };
});
//# sourceMappingURL=route.js.map
//# sourceMappingURL=route.js.map