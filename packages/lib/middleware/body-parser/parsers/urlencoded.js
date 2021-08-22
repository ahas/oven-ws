import bytes from "bytes";
import contentType from "content-type";
import createError from "http-errors";
import dbg from "debug";
import read from "../read";
import typeis from "type-is";
import { typeChecker } from "src/utils";
var debug = dbg("body-parser:urlencoded");
/**
 * Module exports.
 */
module.exports = urlencoded;
/**
 * Cache of parser modules.
 */
var parsers = Object.create(null);
/**
 * Create a middleware to parse urlencoded bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @public
 */
export default function urlencoded(options) {
    var opts = options || {};
    var inflate = opts.inflate !== false;
    var limit = typeof opts.limit !== "number" ? bytes.parse(opts.limit || "100kb") : opts.limit;
    var type = opts.type || "application/x-www-form-urlencoded";
    var verify = opts.verify || false;
    if (verify !== false && typeof verify !== "function") {
        throw new TypeError("option verify must be function");
    }
    // create the appropriate query parser
    var parseQuery = getQueryParser(opts);
    // create the appropriate type checking function
    var shouldParse = typeof type !== "function" ? typeChecker(type) : type;
    function parse(body) {
        return body.length ? parseQuery(body) : {};
    }
    return function urlencodedParser(req, res, next) {
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
        // assert charset
        var charset = getCharset(req) || "utf-8";
        if (charset !== "utf-8") {
            debug("invalid charset");
            next(createError(415, 'unsupported charset "' + charset.toUpperCase() + '"', {
                charset: charset,
                type: "charset.unsupported"
            }));
            return;
        }
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
 * Get the extended query parser.
 *
 * @param {object} options
 */
function getQueryParser(options) {
    var parse = parser("qs");
    var parameterLimit = options.parameterLimit !== undefined ? options.parameterLimit : 1000;
    if (isNaN(parameterLimit) || parameterLimit < 1) {
        throw new TypeError("option parameterLimit must be a positive number");
    }
    if (isFinite(parameterLimit)) {
        parameterLimit = parameterLimit | 0;
    }
    return function queryparse(body) {
        var paramCount = parameterCount(body, parameterLimit);
        if (paramCount === undefined) {
            debug("too many parameters");
            throw createError(413, "too many parameters", {
                type: "parameters.too.many"
            });
        }
        var arrayLimit = Math.max(100, paramCount);
        debug("parse extended urlencoding");
        return parse(body, {
            allowPrototypes: true,
            arrayLimit: arrayLimit,
            depth: Infinity,
            parameterLimit: parameterLimit
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
/**
 * Count the number of parameters, stopping once limit reached
 *
 * @param {string} body
 * @param {number} limit
 * @api private
 */
function parameterCount(body, limit) {
    var count = 0;
    var index = 0;
    while ((index = body.indexOf("&", index)) !== -1) {
        count++;
        index++;
        if (count === limit) {
            return undefined;
        }
    }
    return count;
}
/**
 * Get parser for module name dynamically.
 *
 * @param {string} name
 * @return {function}
 * @api private
 */
function parser(name) {
    var mod = parsers[name];
    if (mod !== undefined) {
        return mod.parse;
    }
    // this uses a switch for static require analysis
    switch (name) {
        case "qs":
            mod = require("qs");
            break;
        case "querystring":
            mod = require("querystring");
            break;
    }
    // store to prevent invoking require()
    parsers[name] = mod;
    return mod.parse;
}
//# sourceMappingURL=urlencoded.js.map
//# sourceMappingURL=urlencoded.js.map