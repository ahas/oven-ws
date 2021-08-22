import bytes from "bytes";
import contentType from "content-type";
import dbg from "debug";
import read from "../read";
import typeis from "type-is";
import { typeChecker } from "src/utils";
var debug = dbg("body-parser:text");
/**
 * Create a middleware to parse text bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @api public
 */
export default function text(options) {
    var opts = options || {};
    var defaultCharset = opts.defaultCharset || "utf-8";
    var inflate = opts.inflate !== false;
    var limit = typeof opts.limit !== "number" ? bytes.parse(opts.limit || "100kb") : opts.limit;
    var type = opts.type || "text/plain";
    var verify = opts.verify || false;
    if (verify !== false && typeof verify !== "function") {
        throw new TypeError("option verify must be function");
    }
    // create the appropriate type checking function
    var shouldParse = typeof type !== "function" ? typeChecker(type) : type;
    function parse(buf) {
        return buf;
    }
    return function textParser(req, res, next) {
        if (req.bodyParsed) {
            debug("body already parsed");
            next();
            return;
        }
        req.body = req.body || {};
        // skip requests without bodies
        if (!typeis.hasBody(req)) {
            debug("skip empty body");
            next();
            return;
        }
        debug("content-type %j", req.headers["content-type"]);
        // determine if request should be parsed
        if (!shouldParse(req)) {
            debug("skip parsing");
            next();
            return;
        }
        // get charset
        var charset = getCharset(req) || defaultCharset;
        // read
        read(req, res, next, parse, debug, {
            encoding: charset,
            inflate: inflate,
            limit: limit,
            verify: verify
        });
    };
}
/**
 * Get the charset of a request.
 *
 * @param {object} req
 * @api private
 */
function getCharset(req) {
    try {
        return (contentType.parse(req).parameters.charset || "").toLowerCase();
    } catch (e) {
        return undefined;
    }
}
//# sourceMappingURL=text.js.map
//# sourceMappingURL=text.js.map