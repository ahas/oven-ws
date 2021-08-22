import Application from "../application";
import { RequestHandler } from "../types";
/**
 * Initialization middleware, exposing the
 * request and response to each other, as well
 * as defaulting the X-Powered-By header field.
 *
 * @param {Application} app
 * @return {Function}
 * @api private
 */
export declare function init(app: Application): RequestHandler;
