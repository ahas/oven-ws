var __extends = this && this.__extends || function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function (d, b) {
            d.__proto__ = b;
        } || function (d, b) {
            for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
        };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null) throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() {
            this.constructor = d;
        }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
}();
import createError from "http-errors";
import dbg from "debug";
import destroy from "destroy";
import encodeUrl from "encodeurl";
import escapeHtml from "escape-html";
import etag from "etag";
import fresh from "fresh";
import fs from "fs";
import mime from "mime-types";
import onFinished from "on-finished";
import parseRange from "range-parser";
import { extname, join, normalize, resolve, sep } from "path";
import statuses from "statuses";
import Stream from "stream";
import ms from "ms";
var debug = dbg("oven/ws:send");
var SendStream = /** @class */function (_super) {
    __extends(SendStream, _super);
    function SendStream(req, path, options) {
        var _this = _super.call(this) || this;
        var opts = options || {};
        _this.options = opts;
        _this.path = path;
        _this.req = req;
        _this._acceptRanges = opts.acceptRanges !== undefined ? Boolean(opts.acceptRanges) : true;
        _this._cacheControl = opts.cacheControl !== undefined ? Boolean(opts.cacheControl) : true;
        _this._etag = opts.etag !== undefined ? Boolean(opts.etag) : true;
        _this._dotfiles = opts.dotfiles;
        if (_this._dotfiles !== "ignore" && _this._dotfiles !== "allow" && _this._dotfiles !== "deny") {
            throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"');
        }
        _this._extensions = opts.extensions !== undefined ? normalizeList(opts.extensions, "extensions option") : [];
        _this._immutable = opts.immutable !== undefined ? Boolean(opts.immutable) : false;
        _this._index = opts.index !== undefined ? normalizeList(opts.index, "index option") : ["index.html"];
        _this._lastModified = opts.lastModified !== undefined ? Boolean(opts.lastModified) : true;
        _this._maxAge = opts.maxAge;
        _this._maxAge = typeof _this._maxAge === "string" ? ms(_this._maxAge) : Number(_this._maxAge);
        _this._maxAge = !isNaN(_this._maxAge) ? Math.min(Math.max(0, _this._maxAge), MAX_MAXAGE) : 0;
        _this._root = opts.root ? resolve(opts.root) : null;
        return _this;
    }
    /**
     * Set root `path`
     * @param path a root path
     * @returns
     */
    SendStream.prototype.root = function (path) {
        this._root = resolve(String(path));
        debug("root %s", this._root);
        return this;
    };
    /**
     * Emit error with `status`.
     */
    SendStream.prototype.error = function (status, error) {
        // emit if listeners instead of responding
        if (hasListeners(this, "error")) {
            this.emit("error", createError(status, error, {
                expose: false
            }));
            return;
        }
        var res = this.res;
        var msg = statuses.message[status] || String(status);
        var doc = createHtmlDocument("Error", escapeHtml(msg));
        // clear existing headers
        clearHeaders(res);
        // add error headers
        if (error && error.headers) {
            setHeaders(res, error.headers);
        }
        // send basic response
        res.statusCode = status;
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        res.setHeader("Content-Length", Buffer.byteLength(doc));
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(doc);
    };
    /**
     * Check if the pathname ends with "/".
     */
    SendStream.prototype.hasTrailingSlash = function () {
        return this.path[this.path.length - 1] === "/";
    };
    /**
     * Check if this is a conditional GET request.
     * @api
     */
    SendStream.prototype.isConditionalGET = function () {
        return !!(this.req.headers["if-match"] || this.req.headers["if-unmodified-since"] || this.req.headers["if-none-match"] || this.req.headers["if-modified-since"]);
    };
    /**
     * Check if the request preconditions failed.
     */
    SendStream.prototype.isPreconditionFailure = function () {
        var req = this.req;
        var res = this.res;
        // if-match
        var match = req.headers["if-match"];
        if (match) {
            var etag_1 = res.getHeader("ETag");
            return !etag_1 || match !== "*" && parseTokenList(match).every(function (match) {
                return match !== etag_1 && match !== "W/" + etag_1 && "W/" + match !== etag_1;
            });
        }
        // if-unmodified-since
        var unmodifiedSince = parseHttpDate(req.headers["if-unmodified-since"]);
        if (!isNaN(unmodifiedSince)) {
            var lastModified = parseHttpDate(res.getHeader("Last-Modified"));
            return isNaN(lastModified) || lastModified > unmodifiedSince;
        }
        return false;
    };
    /**
     * Strip content-* header fields.
     */
    SendStream.prototype.removeContentHeaderFields = function () {
        var res = this.res;
        var headers = getHeaderNames(res);
        for (var i = 0; i < headers.length; i++) {
            var header = headers[i];
            if (header.substr(0, 8) === "content-" && header !== "content-location") {
                res.removeHeader(header);
            }
        }
    };
    /**
     * Respond with 304 not modified.
     * @api
     */
    SendStream.prototype.notModified = function () {
        var res = this.res;
        debug("not modified");
        this.removeContentHeaderFields();
        res.statusCode = 304;
        res.end();
    };
    /**
     * Raise error that headers already sent.
     * @api
     */
    SendStream.prototype.headersAlreadySent = function () {
        var err = new Error("Can't set headers after they are sent.");
        debug("headers already sent");
        this.error(500, err);
    };
    /**
     * Check if the request is cacheable, aka responded with 2xx or 304 (see RFC 2616 section 14.2{5,6}).
     * @api
     */
    SendStream.prototype.isCachable = function () {
        var statusCode = this.res.statusCode;
        return statusCode >= 200 && statusCode < 300 || statusCode === 304;
    };
    /**
     * Handle stat() error.
     */
    SendStream.prototype.onStatError = function (error) {
        switch (error.code) {
            case "ENAMETOOLONG":
            case "ENOENT":
            case "ENOTDIR":
                this.error(404, error);
                break;
            default:
                this.error(500, error);
                break;
        }
    };
    /**
     * Check if the cache is fresh.
     * @api
     */
    SendStream.prototype.isFresh = function () {
        return fresh(this.req.headers, {
            etag: this.res.getHeader("ETag"),
            "last-modified": this.res.getHeader("Last-Modified")
        });
    };
    /**
     * Check if the range is fresh.
     * @api
     */
    SendStream.prototype.isRangeFresh = function () {
        var ifRange = this.req.headers["if-range"];
        if (!ifRange) {
            return true;
        }
        // if-range as etag
        if (ifRange.indexOf('"') !== -1) {
            var etag_2 = this.res.getHeader("ETag");
            return Boolean(etag_2 && ifRange.indexOf(etag_2) !== -1);
        }
        // if-range as modified date
        var lastModified = this.res.getHeader("Last-Modified");
        return parseHttpDate(lastModified) <= parseHttpDate(ifRange);
    };
    /**
     * Redirect to path.
     */
    SendStream.prototype.redirect = function (path) {
        var res = this.res;
        if (hasListeners(this, "directory")) {
            this.emit("directory", res, path);
            return;
        }
        if (this.hasTrailingSlash()) {
            this.error(403);
            return;
        }
        var loc = encodeUrl(collapseLeadingSlashes(this.path + "/"));
        var doc = createHtmlDocument("Redirecting", 'Redirecting to <a href="' + escapeHtml(loc) + '">' + escapeHtml(loc) + "</a>");
        // redirect
        res.statusCode = 301;
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        res.setHeader("Content-Length", Buffer.byteLength(doc));
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Location", loc);
        res.end(doc);
    };
    /**
     * Pipe to `res`.
     * @api
     */
    SendStream.prototype.pipe = function (res) {
        // root path
        var root = this._root;
        // references
        this.res = res;
        // decode the path
        var decodedPath = decode(this.path);
        if (decodedPath === -1) {
            this.error(400);
            return res;
        }
        var path = decodedPath;
        // null byte(s)
        if (~path.indexOf("\0")) {
            this.error(400);
            return res;
        }
        var parts;
        if (root !== null) {
            // normalize
            if (path) {
                path = normalize("." + sep + path);
            }
            // malicious path
            if (UP_PATH_REGEXP.test(path)) {
                debug('malicious path "%s"', path);
                this.error(403);
                return res;
            }
            // explode path parts
            parts = path.split(sep);
            // join / normalize from optional root dir
            path = normalize(join(root, path));
        } else {
            // ".." is malicious without "root"
            if (UP_PATH_REGEXP.test(path)) {
                debug('malicious path "%s"', path);
                this.error(403);
                return res;
            }
            // explode path parts
            parts = normalize(path).split(sep);
            // resolve the path
            path = resolve(path);
        }
        // dotfile handling
        if (containsDotFile(parts)) {
            var access = this._dotfiles;
            debug('%s dotfile "%s"', access, path);
            switch (access) {
                case "allow":
                    break;
                case "deny":
                    this.error(403);
                    return res;
                case "ignore":
                default:
                    this.error(404);
                    return res;
            }
        }
        // index file support
        if (this._index.length && this.hasTrailingSlash()) {
            this.sendIndex(path);
            return res;
        }
        this.sendFile(path);
        return res;
    };
    /**
     * Transfer `path`.
     * @api
     */
    SendStream.prototype.send = function (path, stat) {
        var options = this.options;
        var opts = {};
        var res = this.res;
        var req = this.req;
        var ranges = req.headers.range;
        var len = stat.size;
        var offset = options.start || 0;
        if (headersSent(res)) {
            // impossible to send now
            this.headersAlreadySent();
            return;
        }
        debug('pipe "%s"', path);
        // set header fields
        this.setHeader(path, stat);
        // set content-type
        this.type(path);
        // conditional GET support
        if (this.isConditionalGET()) {
            if (this.isPreconditionFailure()) {
                this.error(412);
                return;
            }
            if (this.isCachable() && this.isFresh()) {
                this.notModified();
                return;
            }
        }
        // adjust len to start/end options
        len = Math.max(0, len - offset);
        if (options.end !== undefined) {
            var bytes = options.end - offset + 1;
            if (len > bytes) {
                len = bytes;
            }
        }
        // Range support
        if (this._acceptRanges && BYTES_RANGE_REGEXP.test(ranges)) {
            // parse
            var parsedRanges = parseRange(len, ranges, {
                combine: true
            });
            // If-Range support
            if (!this.isRangeFresh()) {
                debug("range stale");
                parsedRanges = -2;
            }
            // unsatisfiable
            if (parsedRanges === -1) {
                debug("range unsatisfiable");
                // Content-Range
                res.setHeader("Content-Range", contentRange("bytes", len));
                // 416 Requested Range Not Satisfiable
                return this.error(416, {
                    name: null,
                    message: null,
                    headers: { "Content-Range": res.getHeader("Content-Range") }
                });
            }
            // valid (syntactically invalid/multiple ranges are treated as a regular response)
            if (parsedRanges !== -2 && parsedRanges.length === 1) {
                debug("range %j", parsedRanges);
                // Content-Range
                res.statusCode = 206;
                res.setHeader("Content-Range", contentRange("bytes", len, parsedRanges[0]));
                // adjust for requested range
                offset += parsedRanges[0].start;
                len = parsedRanges[0].end - parsedRanges[0].start + 1;
            }
        }
        // clone options
        for (var prop in options) {
            opts[prop] = options[prop];
        }
        // set read options
        opts.start = offset;
        opts.end = Math.max(offset, offset + len - 1);
        // content-length
        res.setHeader("Content-Length", len);
        // HEAD support
        if (req.method === "HEAD") {
            res.end();
            return;
        }
        this.stream(path, opts);
    };
    /**
     * Transfer file for `path`.
     * @api
     */
    SendStream.prototype.sendFile = function (path) {
        var self = this;
        var i = 0;
        debug('stat "%s"', path);
        fs.stat(path, function onstat(err, stat) {
            if (err && err.code === "ENOENT" && !extname(path) && path[path.length - 1] !== sep) {
                // not found, check extensions
                return next(err);
            }
            if (err) return self.onStatError(err);
            if (stat.isDirectory()) return self.redirect(path);
            self.emit("file", path, stat);
            self.send(path, stat);
        });
        function next(err) {
            if (self._extensions.length <= i) {
                return err ? self.onStatError(err) : self.error(404);
            }
            var p = path + "." + self._extensions[i++];
            debug('stat "%s"', p);
            fs.stat(p, function (err, stat) {
                if (err) {
                    return next(err);
                }
                if (stat.isDirectory()) {
                    return next();
                }
                self.emit("file", p, stat);
                self.send(p, stat);
            });
        }
    };
    /**
     * Transfer index for `path`.
     * @api
     */
    SendStream.prototype.sendIndex = function (path) {
        var self = this;
        var i = -1;
        function next(err) {
            if (++i >= self._index.length) {
                if (err) {
                    return self.onStatError(err);
                }
                return self.error(404);
            }
            var p = join(path, self._index[i]);
            debug('stat "%s"', p);
            fs.stat(p, function (err, stat) {
                if (err) {
                    return next(err);
                }
                if (stat.isDirectory()) {
                    return next();
                }
                self.emit("file", p, stat);
                self.send(p, stat);
            });
        }
        next();
    };
    /**
     * Transfer index for `path`.
     * @api
     */
    SendStream.prototype.stream = function (path, options) {
        // TODO: this is all lame, refactor meeee
        var self = this;
        var res = this.res;
        var finished = false;
        // pipe
        var stream = fs.createReadStream(path, options);
        this.emit("stream", stream);
        stream.pipe(res);
        // response finished, done with the fd
        onFinished(res, function onfinished() {
            finished = true;
            destroy(stream);
        });
        // error handling code-smell
        stream.on("error", function onerror(err) {
            // request already finished
            if (finished) return;
            // clean up stream
            finished = true;
            destroy(stream);
            // error
            self.onStatError(err);
        });
        // end
        stream.on("end", function onend() {
            self.emit("end");
        });
    };
    /**
     * Set content-type based on `path` if it hasn't been explicitly set.
     * @api
     */
    SendStream.prototype.type = function (path) {
        var res = this.res;
        if (res.getHeader("Content-Type")) {
            return;
        }
        var type = mime.lookup(path);
        if (!type) {
            debug("no content-type");
            return;
        }
        var charset = mime.charset(type);
        debug("content-type %s", type);
        res.setHeader("Content-Type", type + (charset ? "; charset=" + charset : ""));
    };
    /**
     * Set response header fields, most fields may be pre-defined.
     * @api
     */
    SendStream.prototype.setHeader = function (path, stat) {
        var res = this.res;
        this.emit("headers", res, path, stat);
        if (this._acceptRanges && !res.getHeader("Accept-Ranges")) {
            debug("accept ranges");
            res.setHeader("Accept-Ranges", "bytes");
        }
        if (this._cacheControl && !res.getHeader("Cache-Control")) {
            var cacheControl = "public, max-age=" + Math.floor(this._maxAge / 1000);
            if (this._immutable) {
                cacheControl += ", immutable";
            }
            debug("cache-control %s", cacheControl);
            res.setHeader("Cache-Control", cacheControl);
        }
        if (this._lastModified && !res.getHeader("Last-Modified")) {
            var modified = stat.mtime.toUTCString();
            debug("modified %s", modified);
            res.setHeader("Last-Modified", modified);
        }
        if (this._etag && !res.getHeader("ETag")) {
            var val = etag(stat);
            debug("etag %s", val);
            res.setHeader("ETag", val);
        }
    };
    return SendStream;
}(Stream);
export { SendStream };
/**
 * Regular expression for identifying a bytes Range header.
 * @private
 */
var BYTES_RANGE_REGEXP = /^ *bytes=/;
/**
 * Maximum value allowed for the max age.
 * @private
 */
var MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year
/**
 * Regular expression to match a path with a directory up component.
 * @private
 */
var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
/**
 * Clear all headers from a response.
 * @private
 */
function clearHeaders(res) {
    var headers = getHeaderNames(res);
    for (var i = 0; i < headers.length; i++) {
        res.removeHeader(headers[i]);
    }
}
/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes(str) {
    var i;
    for (i = 0; i < str.length; i++) {
        if (str[i] !== "/") {
            break;
        }
    }
    return i > 1 ? "/" + str.substr(i) : str;
}
/**
 * Determine if path parts contain a dotfile.
 *
 * @api private
 */
function containsDotFile(parts) {
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part.length > 1 && part[0] === ".") {
            return true;
        }
    }
    return false;
}
/**
 * Create a Content-Range header.
 *
 * @param {string} type
 * @param {number} size
 * @param {array} [range]
 */
function contentRange(type, size, range) {
    return type + " " + (range ? range.start + "-" + range.end : "*") + "/" + size;
}
/**
 * Create a minimal HTML document.
 *
 * @param {string} title
 * @param {string} body
 * @private
 */
function createHtmlDocument(title, body) {
    return "<!DOCTYPE html>\n" + '<html lang="en">\n' + "<head>\n" + '<meta charset="utf-8">\n' + "<title>" + title + "</title>\n" + "</head>\n" + "<body>\n" + "<pre>" + body + "</pre>\n" + "</body>\n" + "</html>\n";
}
/**
 * decodeURIComponent.
 *
 * Allows V8 to only deoptimize this fn instead of all
 * of send().
 *
 * @param {String} path
 * @api private
 */
function decode(path) {
    try {
        return decodeURIComponent(path);
    } catch (err) {
        return -1;
    }
}
/**
 * Get the header names on a respnse.
 * @private
 */
function getHeaderNames(res) {
    return typeof res.getHeaderNames !== "function" ? [] : res.getHeaderNames();
}
/**
 * Determine if emitter has listeners of a given type.
 *
 * The way to do this check is done three different ways in Node.js >= 0.8
 * so this consolidates them into a minimal set using instance methods.
 * @private
 */
function hasListeners(emitter, type) {
    var count = typeof emitter.listenerCount !== "function" ? emitter.listeners(type).length : emitter.listenerCount(type);
    return count > 0;
}
/**
 * Determine if the response headers have been sent.
 * @private
 */
function headersSent(res) {
    return res.headersSent;
}
/**
 * Normalize the index option into an array.
 * @private
 */
function normalizeList(val, name) {
    var list = [].concat(val || []);
    for (var i = 0; i < list.length; i++) {
        if (typeof list[i] !== "string") {
            throw new TypeError(name + " must be array of strings or false");
        }
    }
    return list;
}
/**
 * Parse an HTTP Date into a number.
 * @private
 */
function parseHttpDate(date) {
    var timestamp = date && Date.parse(date);
    return typeof timestamp === "number" ? timestamp : NaN;
}
/**
 * Parse a HTTP token list.
 * @private
 */
function parseTokenList(str) {
    var start = 0;
    var end = 0;
    var list = [];
    // gather tokens
    for (var i = 0, len = str.length; i < len; i++) {
        switch (str.charCodeAt(i)) {
            case 0x20 /*   */:
                if (start === end) {
                    start = end = i + 1;
                }
                break;
            case 0x2c /* , */:
                list.push(str.substring(start, end));
                start = end = i + 1;
                break;
            default:
                end = i + 1;
                break;
        }
    }
    // final token
    list.push(str.substring(start, end));
    return list;
}
/**
 * Set an object of headers on a response.
 * @private
 */
function setHeaders(res, headers) {
    var keys = Object.keys(headers);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        res.setHeader(key, headers[key]);
    }
}
/**
 * Return a `SendStream` for `req` and `path`.
 * @public
 */
export default function send(req, path, options) {
    return new SendStream(req, path, options);
}
export { mime };
//# sourceMappingURL=send.js.map
//# sourceMappingURL=send.js.map