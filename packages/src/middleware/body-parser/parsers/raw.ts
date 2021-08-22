import bytes from "bytes";
import dbg from "debug";
import read from "../read";
import typeis from "type-is";

// Types
import { RawBodyParserOptions } from "../types";
import { RequestHandler } from "../../../types";
import { typeChecker } from "src/utils";

const debug = dbg("body-parser:raw");

/**
 * Create a middleware to parse raw bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @api public
 */

export default function raw(options?: RawBodyParserOptions): RequestHandler {
    const opts = options || {};

    const inflate = opts.inflate !== false;
    const limit = typeof opts.limit !== "number" ? bytes.parse(opts.limit || "100kb") : opts.limit;
    const type = opts.type || "application/octet-stream";
    const verify = opts.verify || false;

    if (verify !== false && typeof verify !== "function") {
        throw new TypeError("option verify must be function");
    }

    // create the appropriate type checking function
    const shouldParse = typeof type !== "function" ? typeChecker(type) : type;

    function parse(buf: Buffer): any {
        return buf;
    }

    return function rawParser(req, res, next) {
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

        // read
        read(req, res, next, parse, debug, {
            encoding: null,
            inflate: inflate,
            limit: limit,
            verify: verify,
        });
    };
}
