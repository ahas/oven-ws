import merge from "utils-merge";
import parseUrl from "parseurl";
import qs from "qs";
/**
 * @param {Object} options
 * @return {Function}
 */
export default function query(options) {
    var opts = merge({}, options);
    var queryparse = qs.parse;
    if (typeof options === "function") {
        queryparse = options;
        opts = undefined;
    }
    if (opts !== undefined && opts.allowPrototypes === undefined) {
        // back-compat for qs module
        opts.allowPrototypes = true;
    }
    return function query(req, _res, next) {
        if (!req.query) {
            var val = parseUrl(req).query;
            req.query = queryparse(val, opts);
        }
        next();
    };
}
//# sourceMappingURL=query.js.map
//# sourceMappingURL=query.js.map