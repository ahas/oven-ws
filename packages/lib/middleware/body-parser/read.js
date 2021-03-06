/**
 * Module dependencies.
 * @private
 */
import createError from "http-errors";
import getRawBody from "raw-body";
import iconv from "iconv-lite";
import onFinished from "on-finished";
import zlib from "zlib";
/**
 * Read a request into a buffer and parse.
 *
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @param {function} parse
 * @param {function} debug
 * @param {object} options
 * @private
 */
export default function read(req, res, next, parse, debug, options) {
    var opts = options;
    var length;
    var stream;
    // flag as parsed
    req.bodyParsed = true;
    // read options
    var encoding = opts.encoding !== null ? opts.encoding : null;
    var verify = opts.verify;
    try {
        // get the content stream
        stream = contentStream(req, debug, opts.inflate);
        length = stream.length;
        delete stream.length;
    } catch (err) {
        return next(err);
    }
    // set raw-body options
    opts.length = length;
    opts.encoding = verify ? null : encoding;
    // assert charset is supported
    if (opts.encoding === null && encoding !== null && !iconv.encodingExists(encoding)) {
        return next(createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
            charset: encoding.toLowerCase(),
            type: "charset.unsupported"
        }));
    }
    // read body
    debug("read body");
    getRawBody(stream, opts, function (error, body) {
        if (error) {
            var err_1;
            if (error.type === "encoding.unsupported") {
                // echo back charset
                err_1 = createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
                    charset: encoding.toLowerCase(),
                    type: "charset.unsupported"
                });
            } else {
                // set status code on error
                err_1 = createError(400, error);
            }
            // read off entire request
            stream.resume();
            onFinished(req, function onfinished() {
                next(createError(400, err_1));
            });
            return;
        }
        // verify
        if (verify) {
            try {
                debug("verify body");
                verify(req, res, body, encoding);
            } catch (err) {
                next(createError(403, err, {
                    body: body,
                    type: err.type || "entity.verify.failed"
                }));
                return;
            }
        }
        // parse
        var str = body;
        try {
            debug("parse body");
            str = typeof body !== "string" && encoding !== null ? iconv.decode(body, encoding) : body;
            req.body = parse(str);
        } catch (err) {
            next(createError(400, err, {
                body: str,
                type: err.type || "entity.parse.failed"
            }));
            return;
        }
        next();
    });
}
/**
 * Get the content stream of the request.
 * @api private
 */
function contentStream(req, debug, inflate) {
    if (inflate === void 0) {
        inflate = true;
    }
    var encoding = (req.headers["content-encoding"] || "identity").toLowerCase();
    var length = req.headers["content-length"];
    var stream;
    debug('content-encoding "%s"', encoding);
    if (inflate === false && encoding !== "identity") {
        throw createError(415, "content encoding unsupported", {
            encoding: encoding,
            type: "encoding.unsupported"
        });
    }
    switch (encoding) {
        case "deflate":
            stream = zlib.createInflate();
            debug("inflate body");
            req.pipe(stream);
            break;
        case "gzip":
            stream = zlib.createGunzip();
            debug("gunzip body");
            req.pipe(stream);
            break;
        case "identity":
            stream = req;
            stream.length = length;
            break;
        default:
            throw createError(415, 'unsupported content encoding "' + encoding + '"', {
                encoding: encoding,
                type: "encoding.unsupported"
            });
    }
    return stream;
}
//# sourceMappingURL=read.js.map
//# sourceMappingURL=read.js.map