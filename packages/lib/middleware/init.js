import setPrototypeOf from "setprototypeof";
/**
 * Initialization middleware, exposing the
 * request and response to each other, as well
 * as defaulting the X-Powered-By header field.
 *
 * @param {Application} app
 * @return {Function}
 * @api private
 */
export function init(app) {
    return function wsInit(req, res, next) {
        if (app.enabled("x-powered-by")) {
            res.setHeader("X-Powered-By", "Oven WS");
        }
        req.res = res;
        res.req = req;
        req.next = next;
        setPrototypeOf(req, app.request);
        setPrototypeOf(res, app.response);
        res.locals = res.locals || Object.create(null);
        next();
    };
}
//# sourceMappingURL=init.js.map
//# sourceMappingURL=init.js.map