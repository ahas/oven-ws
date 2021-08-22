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
import Stream, { EventEmitter } from "stream";
import ms from "ms";

const debug = dbg("oven/ws:send");

interface SendOptions {
    /**
     * Enable or disable accepting ranged requests, defaults to true.
     * Disabling this will not send Accept-Ranges and ignore the contents of the Range request header.
     */
    acceptRanges?: boolean | undefined;

    /**
     * Enable or disable setting Cache-Control response header, defaults to true.
     * Disabling this will ignore the maxAge option.
     */
    cacheControl?: boolean | undefined;

    /**
     * Set how "dotfiles" are treated when encountered.
     * A dotfile is a file or directory that begins with a dot (".").
     * Note this check is done on the path itself without checking if the path actually exists on the disk.
     * If root is specified, only the dotfiles above the root are checked (i.e. the root itself can be within a dotfile when when set to "deny").
     * 'allow' No special treatment for dotfiles.
     * 'deny' Send a 403 for any request for a dotfile.
     * 'ignore' Pretend like the dotfile does not exist and 404.
     * The default value is similar to 'ignore', with the exception that this default will not ignore the files within a directory that begins with a dot, for backward-compatibility.
     */
    dotfiles?: "allow" | "deny" | "ignore" | undefined;

    /**
     * Byte offset at which the stream ends, defaults to the length of the file minus 1.
     * The end is inclusive in the stream, meaning end: 3 will include the 4th byte in the stream.
     */
    end?: number | undefined;

    /**
     * Enable or disable etag generation, defaults to true.
     */
    etag?: boolean | undefined;

    /**
     * If a given file doesn't exist, try appending one of the given extensions, in the given order.
     * By default, this is disabled (set to false).
     * An example value that will serve extension-less HTML files: ['html', 'htm'].
     * This is skipped if the requested file already has an extension.
     */
    extensions?: string[] | string | boolean | undefined;

    /**
     * Enable or disable the immutable directive in the Cache-Control response header, defaults to false.
     * If set to true, the maxAge option should also be specified to enable caching.
     * The immutable directive will prevent supported clients from making conditional requests during the life of the maxAge option to check if the file has changed.
     * @default false
     */
    immutable?: boolean | undefined;

    /**
     * By default send supports "index.html" files, to disable this set false or to supply a new index pass a string or an array in preferred order.
     */
    index?: string[] | string | boolean | undefined;

    /**
     * Enable or disable Last-Modified header, defaults to true.
     * Uses the file system's last modified value.
     */
    lastModified?: boolean | undefined;

    /**
     * Provide a max-age in milliseconds for http caching, defaults to 0.
     * This can also be a string accepted by the ms module.
     */
    maxAge?: string | number | undefined;

    /**
     * Serve files relative to path.
     */
    root?: string | undefined;

    /**
     * Byte offset at which the stream starts, defaults to 0.
     * The start is inclusive, meaning start: 2 will include the 3rd byte in the stream.
     */
    start?: number | undefined;
}

interface SendError extends Error {
    headers?: object;
    code?: string;
}

export class SendStream extends Stream {
    public path: string;
    public req: oven.ws.Request;
    public res: oven.ws.Response;
    public options: SendOptions;

    private _root: string;
    private _dotfiles: string;
    private _acceptRanges: boolean;
    private _extensions: string[];
    private _cacheControl: boolean;
    private _maxAge: string | number;
    private _immutable: boolean;
    private _lastModified: boolean;
    private _etag: boolean;
    private _index: any[];

    constructor(req: oven.ws.Request, path: string, options: SendOptions) {
        super();

        const opts = options || ({} as SendOptions);

        this.options = opts;
        this.path = path;
        this.req = req;

        this._acceptRanges = opts.acceptRanges !== undefined ? Boolean(opts.acceptRanges) : true;
        this._cacheControl = opts.cacheControl !== undefined ? Boolean(opts.cacheControl) : true;
        this._etag = opts.etag !== undefined ? Boolean(opts.etag) : true;
        this._dotfiles = opts.dotfiles;

        if (this._dotfiles !== "ignore" && this._dotfiles !== "allow" && this._dotfiles !== "deny") {
            throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"');
        }

        this._extensions = opts.extensions !== undefined ? normalizeList(opts.extensions, "extensions option") : [];
        this._immutable = opts.immutable !== undefined ? Boolean(opts.immutable) : false;
        this._index = opts.index !== undefined ? normalizeList(opts.index, "index option") : ["index.html"];
        this._lastModified = opts.lastModified !== undefined ? Boolean(opts.lastModified) : true;

        this._maxAge = opts.maxAge;
        this._maxAge = typeof this._maxAge === "string" ? ms(this._maxAge) : Number(this._maxAge);
        this._maxAge = !isNaN(this._maxAge as number) ? Math.min(Math.max(0, this._maxAge as number), MAX_MAXAGE) : 0;

        this._root = opts.root ? resolve(opts.root) : null;
    }

    /**
     * Set root `path`
     * @param path a root path
     * @returns
     */
    public root(path: string): this {
        this._root = resolve(String(path));
        debug("root %s", this._root);
        return this;
    }

    /**
     * Emit error with `status`.
     */
    private error(status: number, error?: SendError): void {
        // emit if listeners instead of responding
        if (hasListeners(this, "error")) {
            this.emit(
                "error",
                createError(status, error, {
                    expose: false,
                }),
            );
            return;
        }

        const res = this.res;
        const msg = statuses.message[status] || String(status);
        const doc = createHtmlDocument("Error", escapeHtml(msg));

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
    }

    /**
     * Check if the pathname ends with "/".
     */
    private hasTrailingSlash(): boolean {
        return this.path[this.path.length - 1] === "/";
    }

    /**
     * Check if this is a conditional GET request.
     * @api
     */
    private isConditionalGET(): boolean {
        return !!(
            this.req.headers["if-match"] ||
            this.req.headers["if-unmodified-since"] ||
            this.req.headers["if-none-match"] ||
            this.req.headers["if-modified-since"]
        );
    }

    /**
     * Check if the request preconditions failed.
     */

    private isPreconditionFailure() {
        const req = this.req;
        const res = this.res;

        // if-match
        const match = req.headers["if-match"];
        if (match) {
            const etag = res.getHeader("ETag");
            return (
                !etag ||
                (match !== "*" &&
                    parseTokenList(match).every(function (match) {
                        return match !== etag && match !== "W/" + etag && "W/" + match !== etag;
                    }))
            );
        }

        // if-unmodified-since
        const unmodifiedSince = parseHttpDate(req.headers["if-unmodified-since"]);
        if (!isNaN(unmodifiedSince)) {
            const lastModified = parseHttpDate(res.getHeader("Last-Modified") as string);
            return isNaN(lastModified) || lastModified > unmodifiedSince;
        }

        return false;
    }

    /**
     * Strip content-* header fields.
     */
    private removeContentHeaderFields(): void {
        const res = this.res;
        const headers = getHeaderNames(res);

        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            if (header.substr(0, 8) === "content-" && header !== "content-location") {
                res.removeHeader(header);
            }
        }
    }

    /**
     * Respond with 304 not modified.
     * @api
     */
    private notModified(): void {
        const res = this.res;
        debug("not modified");
        this.removeContentHeaderFields();
        res.statusCode = 304;
        res.end();
    }

    /**
     * Raise error that headers already sent.
     * @api
     */
    private headersAlreadySent(): void {
        const err = new Error("Can't set headers after they are sent.");
        debug("headers already sent");
        this.error(500, err);
    }

    /**
     * Check if the request is cacheable, aka responded with 2xx or 304 (see RFC 2616 section 14.2{5,6}).
     * @api
     */
    private isCachable(): boolean {
        const statusCode = this.res.statusCode;
        return (statusCode >= 200 && statusCode < 300) || statusCode === 304;
    }

    /**
     * Handle stat() error.
     */
    private onStatError(error: SendError): void {
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
    }

    /**
     * Check if the cache is fresh.
     * @api
     */
    private isFresh(): boolean {
        return fresh(this.req.headers, {
            etag: this.res.getHeader("ETag"),
            "last-modified": this.res.getHeader("Last-Modified"),
        });
    }

    /**
     * Check if the range is fresh.
     * @api
     */
    private isRangeFresh(): boolean {
        const ifRange = this.req.headers["if-range"] as string;

        if (!ifRange) {
            return true;
        }

        // if-range as etag
        if (ifRange.indexOf('"') !== -1) {
            const etag = this.res.getHeader("ETag") as string;
            return Boolean(etag && ifRange.indexOf(etag) !== -1);
        }

        // if-range as modified date
        const lastModified = this.res.getHeader("Last-Modified") as string;
        return parseHttpDate(lastModified) <= parseHttpDate(ifRange);
    }

    /**
     * Redirect to path.
     */
    private redirect(path: string): void {
        const res = this.res;

        if (hasListeners(this, "directory")) {
            this.emit("directory", res, path);
            return;
        }

        if (this.hasTrailingSlash()) {
            this.error(403);
            return;
        }

        const loc = encodeUrl(collapseLeadingSlashes(this.path + "/"));
        const doc = createHtmlDocument("Redirecting", 'Redirecting to <a href="' + escapeHtml(loc) + '">' + escapeHtml(loc) + "</a>");

        // redirect
        res.statusCode = 301;
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        res.setHeader("Content-Length", Buffer.byteLength(doc));
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Location", loc);
        res.end(doc);
    }

    /**
     * Pipe to `res`.
     * @api
     */
    public pipe<T extends NodeJS.WritableStream>(res: T): T {
        // root path
        const root = this._root;

        // references
        this.res = res as unknown as oven.ws.Response;

        // decode the path
        const decodedPath = decode(this.path);
        if (decodedPath === -1) {
            this.error(400);
            return res;
        }
        let path = decodedPath;

        // null byte(s)
        if (~path.indexOf("\0")) {
            this.error(400);
            return res;
        }

        let parts;
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
            const access = this._dotfiles;

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
    }

    /**
     * Transfer `path`.
     * @api
     */
    public send(path: string, stat?: fs.Stats): void {
        const options = this.options as any;
        const opts = {} as any;
        const res = this.res;
        const req = this.req;
        const ranges = req.headers.range;

        let len = stat.size;
        let offset = options.start || 0;

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
            const bytes = options.end - offset + 1;
            if (len > bytes) {
                len = bytes;
            }
        }

        // Range support
        if (this._acceptRanges && BYTES_RANGE_REGEXP.test(ranges)) {
            // parse
            let parsedRanges = parseRange(len, ranges, {
                combine: true,
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
                    headers: { "Content-Range": res.getHeader("Content-Range") },
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
        for (const prop in options) {
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
    }

    /**
     * Transfer file for `path`.
     * @api
     */
    private sendFile(path: string): void {
        const self = this;

        let i = 0;

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

        function next(err?: Error) {
            if (self._extensions.length <= i) {
                return err ? self.onStatError(err) : self.error(404);
            }

            const p = path + "." + self._extensions[i++];

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
    }

    /**
     * Transfer index for `path`.
     * @api
     */
    private sendIndex(path: string): void {
        const self = this;
        let i = -1;

        function next(err?: Error) {
            if (++i >= self._index.length) {
                if (err) {
                    return self.onStatError(err);
                }
                return self.error(404);
            }

            const p = join(path, self._index[i]);

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
    }

    /**
     * Transfer index for `path`.
     * @api
     */
    private stream(path: string, options?: {}): void {
        // TODO: this is all lame, refactor meeee
        const self = this;
        const res = this.res;
        let finished = false;

        // pipe
        const stream = fs.createReadStream(path, options);
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
    }

    /**
     * Set content-type based on `path` if it hasn't been explicitly set.
     * @api
     */
    private type(path: string): void {
        const res = this.res;

        if (res.getHeader("Content-Type")) {
            return;
        }

        const type = mime.lookup(path);

        if (!type) {
            debug("no content-type");
            return;
        }

        const charset = mime.charset(type);

        debug("content-type %s", type);
        res.setHeader("Content-Type", type + (charset ? "; charset=" + charset : ""));
    }

    /**
     * Set response header fields, most fields may be pre-defined.
     * @api
     */
    private setHeader(path: string, stat: fs.Stats): void {
        const res = this.res;

        this.emit("headers", res, path, stat);

        if (this._acceptRanges && !res.getHeader("Accept-Ranges")) {
            debug("accept ranges");
            res.setHeader("Accept-Ranges", "bytes");
        }

        if (this._cacheControl && !res.getHeader("Cache-Control")) {
            let cacheControl = "public, max-age=" + Math.floor((this._maxAge as number) / 1000);

            if (this._immutable) {
                cacheControl += ", immutable";
            }

            debug("cache-control %s", cacheControl);
            res.setHeader("Cache-Control", cacheControl);
        }

        if (this._lastModified && !res.getHeader("Last-Modified")) {
            const modified = stat.mtime.toUTCString();
            debug("modified %s", modified);
            res.setHeader("Last-Modified", modified);
        }

        if (this._etag && !res.getHeader("ETag")) {
            const val = etag(stat);
            debug("etag %s", val);
            res.setHeader("ETag", val);
        }
    }
}

/**
 * Regular expression for identifying a bytes Range header.
 * @private
 */

const BYTES_RANGE_REGEXP = /^ *bytes=/;

/**
 * Maximum value allowed for the max age.
 * @private
 */

const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year

/**
 * Regular expression to match a path with a directory up component.
 * @private
 */

const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

/**
 * Clear all headers from a response.
 * @private
 */

function clearHeaders(res: oven.ws.Response): void {
    const headers = getHeaderNames(res);

    for (let i = 0; i < headers.length; i++) {
        res.removeHeader(headers[i]);
    }
}

/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes(str: string): string {
    let i;
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

function containsDotFile(parts: string[]): boolean {
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
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

function contentRange(type: string, size: number, range?: parseRange.Range): string {
    return type + " " + (range ? range.start + "-" + range.end : "*") + "/" + size;
}

/**
 * Create a minimal HTML document.
 *
 * @param {string} title
 * @param {string} body
 * @private
 */

function createHtmlDocument(title: string, body: string): string {
    return (
        "<!DOCTYPE html>\n" +
        '<html lang="en">\n' +
        "<head>\n" +
        '<meta charset="utf-8">\n' +
        "<title>" +
        title +
        "</title>\n" +
        "</head>\n" +
        "<body>\n" +
        "<pre>" +
        body +
        "</pre>\n" +
        "</body>\n" +
        "</html>\n"
    );
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

function decode(path: string): string | -1 {
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

function getHeaderNames(res: oven.ws.Response): string[] {
    return typeof res.getHeaderNames !== "function" ? [] : res.getHeaderNames();
}

/**
 * Determine if emitter has listeners of a given type.
 *
 * The way to do this check is done three different ways in Node.js >= 0.8
 * so this consolidates them into a minimal set using instance methods.
 * @private
 */

function hasListeners(emitter: EventEmitter, type: string | symbol): boolean {
    const count = typeof emitter.listenerCount !== "function" ? emitter.listeners(type).length : emitter.listenerCount(type);

    return count > 0;
}

/**
 * Determine if the response headers have been sent.
 * @private
 */

function headersSent(res: oven.ws.Response): boolean {
    return res.headersSent;
}

/**
 * Normalize the index option into an array.
 * @private
 */

function normalizeList(val: string | boolean | string[], name: string) {
    const list = [].concat(val || []);

    for (let i = 0; i < list.length; i++) {
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

function parseHttpDate(date: string) {
    const timestamp = date && Date.parse(date);

    return typeof timestamp === "number" ? timestamp : NaN;
}

/**
 * Parse a HTTP token list.
 * @private
 */

function parseTokenList(str: string): string[] {
    let start = 0;
    let end = 0;
    const list = [];

    // gather tokens
    for (let i = 0, len = str.length; i < len; i++) {
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

function setHeaders(res: oven.ws.Response, headers: any): void {
    const keys = Object.keys(headers);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        res.setHeader(key, headers[key]);
    }
}

/**
 * Return a `SendStream` for `req` and `path`.
 * @public
 */

export default function send(req: oven.ws.Request, path: string, options: SendOptions): SendStream {
    return new SendStream(req, path, options);
}

export { mime };
