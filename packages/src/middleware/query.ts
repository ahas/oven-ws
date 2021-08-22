import merge from "utils-merge";
import parseUrl from "parseurl";
import qs, { IParseOptions } from "qs";

/**
 * @param {Object} options
 * @return {Function}
 */

export default function query(options: IParseOptions): oven.ws.RequestHandler {
    let opts = merge({}, options) as IParseOptions;
    let queryparse = qs.parse;

    if (typeof options === "function") {
        queryparse = options;
        opts = undefined;
    }

    if (opts !== undefined && opts.allowPrototypes === undefined) {
        // back-compat for qs module
        opts.allowPrototypes = true;
    }

    return function query(req: oven.ws.Request, _res: oven.ws.Response, next: oven.ws.Next) {
        if (!req.query) {
            const val = parseUrl(req).query as string | Record<string, string>;
            req.query = queryparse(val, opts) as any;
        }

        next();
    };
}
