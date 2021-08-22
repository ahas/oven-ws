import Route from "./route";
import Layer from "./layer";
import { Request, Response, NextHandler, RouterMatcher, ParamHandler, ApplicationHandler, PathParams } from "../types";
/**
 * Initialize a new `Router` with the given `options`.
 *
 * @param {Object} [options]
 * @return {Router} which is an callable function
 * @public
 */
interface RouterOptions {
    /**
     * Enable case sensitivity.
     */
    caseSensitive?: boolean;
    /**
     * Preserve the req.params values from the parent router.
     * If the parent and the child have conflicting param names, the child’s value take precedence.
     *
     * @default false
     * @since 4.5.0
     */
    mergeParams?: boolean;
    /**
     * Enable strict routing.
     */
    strict?: boolean;
}
export default class Router {
    caseSensitive: boolean;
    mergeParams: boolean;
    strict: boolean;
    stack: Layer[];
    params: Record<string, any>;
    _params: any[];
    constructor(options?: RouterOptions);
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
    param(name: string, handler: ParamHandler): this;
    param(name: string, regexp: RegExp): this;
    param(handler: (name: string, matcher: RegExp) => ParamHandler): this;
    handle(req: Request, res: Response, out: NextHandler): void;
    /**
     * Process any parameters for the layer.
     */
    private process_params;
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
    use: ApplicationHandler<this>;
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
    route(path: PathParams): Route;
    /**
     * Special-cased "all" method, applying the given route `path`,
     * middleware, and callback to _every_ HTTP method.
     */
    all: RouterMatcher<this>;
    get: RouterMatcher<this>;
    head: RouterMatcher<this>;
    post: RouterMatcher<this>;
    put: RouterMatcher<this>;
    delete: RouterMatcher<this>;
    connect: RouterMatcher<this>;
    options: RouterMatcher<this>;
    trace: RouterMatcher<this>;
    patch: RouterMatcher<this>;
}
export {};
