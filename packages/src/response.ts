import { Buffer } from "safe-buffer";
import contentDisposition from "content-disposition";
import encodeUrl from "encodeurl";
import escapeHtml from "escape-html";
import http from "http";
import onFinished from "on-finished";
import { extname, resolve } from "path";
import statuses from "statuses";
import merge from "utils-merge";
import { sign } from "cookie-signature";
import { isAbsolute, normalizeType, normalizeTypes, setCharset } from "./utils";
import cookie from "cookie";
import send, { mime, SendStream } from "./send";
import vary from "vary";

// types
import { CookieOptions, ErrorCallback } from "./types";
import Application from "./application";

declare global {
    namespace oven.ws {
        interface Response extends http.ServerResponse {
            status(code: number): oven.ws.Response;
            links(links: object): oven.ws.Response;
            send(body: string | number | boolean | object | Buffer): void;
            sendFile(path: string, cb?: ErrorCallback): void;
            sendFile(path: string, options: any, cb?: ErrorCallback): void;
            download(path: string, cb?: ErrorCallback): void;
            download(path: string, filename: string, cb?: ErrorCallback): void;
            download(path: string, filename: string, options: any, cb?: ErrorCallback): void;
            type(type: String): this;
            format(obj: any): this;
            attachment(filename: string): this;
            append(field: string, value?: string[] | string): this;
            get<T = any>(field: string): T;
            set(field: any): this;
            set(field: string, value?: any): this;
            clearCookie(name: string, options?: any): this;
            cookie(name: string, val: string, options: CookieOptions): this;
            cookie(name: string, val: any, options: CookieOptions): this;
            cookie(name: string, val: any): this;
            location(url: string): this;
            redirect(url: string): void;
            vary(field: string): this;
            render(view: string, options?: object, callback?: RenderCallback): void;
            render(view: string, callback?: RenderCallback): void;

            locals: Record<string, string>;
            charset: string;
            headerSent: boolean;
            req: oven.ws.Request;
            app: Application;
        }
    }
}

/**
 * Response prototype.
 * @public
 */
const res = Object.create(http.ServerResponse.prototype) as oven.ws.Response;

/**
 * Module exports.
 * @public
 */
export default res;

/**
 * Module variables.
 * @private
 */

const charsetRegExp = /;\s*charset\s*=/;

/**
 * Set status `code`.
 *
 * @param {Number} statusCode
 * @return {ServerResponse}
 * @public
 */

res.status = function status(this: oven.ws.Response, statusCode: number): oven.ws.Response {
    this.statusCode = statusCode;
    return this;
};

/**
 * Set Link header field with the given `links`.
 *
 * Examples:
 *
 *    res.links({
 *      next: 'http://api.example.com/users?page=2',
 *      last: 'http://api.example.com/users?page=5'
 *    });
 *
 * @param {Object} links
 * @return {ServerResponse}
 * @public
 */

res.links = function (this: oven.ws.Response, links: Record<string, string>): oven.ws.Response {
    let link = this.get("Link") || "";
    if (link) {
        link += ", ";
    }
    return this.set(
        "Link",
        link +
            Object.keys(links)
                .map(function (rel) {
                    return "<" + links[rel] + '>; rel="' + rel + '"';
                })
                .join(", "),
    );
};

/**
 * Send a response.
 *
 * Examples:
 *
 *     res.send(Buffer.from('wahoo'));
 *     res.send({ some: 'json' });
 *     res.send('<p>some html</p>');
 *
 * @param {string|number|boolean|object|Buffer} body
 * @public
 */

res.send = function send(this: oven.ws.Response, body: string | number | boolean | object | Buffer) {
    const req = this.req;
    let chunk = body;
    let encoding: BufferEncoding;
    let type;

    // settings
    const app = this.app;

    switch (typeof chunk) {
        // string defaulting to html
        case "string":
            if (!this.get("Content-Type")) {
                this.type("html");
            }
            break;
        case "boolean":
        case "number":
        case "object":
            if (chunk === null) {
                chunk = "";
            } else if (Buffer.isBuffer(chunk)) {
                if (!this.get("Content-Type")) {
                    this.type("bin");
                }
            } else {
                // settings
                const app = this.app;
                const escape = app.$("json escape");
                const replacer = app.$("json replacer");
                const spaces = app.$("json spaces");
                const body = stringify(chunk, replacer, spaces, escape);

                // content-type
                if (!this.get("Content-Type")) {
                    this.set("Content-Type", "application/json");
                }

                return this.send(body);
            }
            break;
    }

    // write strings in utf-8
    if (typeof chunk === "string") {
        encoding = "utf8";
        type = this.get("Content-Type");

        // reflect this in content-type
        if (typeof type === "string") {
            this.set("Content-Type", setCharset(type, "utf-8"));
        }
    }

    // determine if ETag should be generated
    const etagFn = app.$("etag fn");
    const generateETag = !this.get("ETag") && typeof etagFn === "function";

    // populate Content-Length
    let len;
    if (chunk !== undefined) {
        if (Buffer.isBuffer(chunk)) {
            // get length of Buffer
            len = chunk.length;
        } else if (!generateETag && chunk.length < 1000) {
            // just calculate length when no ETag + small chunk
            len = Buffer.byteLength(chunk, encoding);
        } else {
            // convert chunk to Buffer and calculate
            chunk = Buffer.from(chunk, encoding);
            encoding = undefined;
            len = (chunk as Buffer).length;
        }

        this.set("Content-Length", len);
    }

    // populate ETag
    let etag;
    if (generateETag && len !== undefined) {
        if ((etag = etagFn(chunk, encoding))) {
            this.set("ETag", etag);
        }
    }

    // freshness
    if (req.fresh) {
        this.statusCode = 304;
    }

    // strip irrelevant headers
    if (204 === this.statusCode || 304 === this.statusCode) {
        this.removeHeader("Content-Type");
        this.removeHeader("Content-Length");
        this.removeHeader("Transfer-Encoding");
        chunk = "";
    }

    if (req.method === "HEAD") {
        // skip body for HEAD
        this.end();
    } else {
        // respond
        this.end(chunk, encoding);
    }

    return this;
};

/**
 * Transfer the file at the given `path`.
 *
 * Automatically sets the _Content-Type_ response header field.
 * The callback `callback(err)` is invoked when the transfer is complete
 * or when an error occurs. Be sure to check `res.sentHeader`
 * if you wish to attempt responding, as the header and some data
 * may have already been transferred.
 *
 * Options:
 *
 *   - `maxAge`   defaulting to 0 (can be string converted by `ms`)
 *   - `root`     root directory for relative filenames
 *   - `headers`  object of headers to serve with file
 *   - `dotfiles` serve dotfiles, defaulting to false; can be `"allow"` to send them
 *
 * Other options are passed along to `send`.
 *
 * Examples:
 *
 *  The following example illustrates how `res.sendFile()` may
 *  be used as an alternative for the `static()` middleware for
 *  dynamic situations. The code backing `res.sendFile()` is actually
 *  the same code, so HTTP cache support etc is identical.
 *
 *     app.get('/user/:uid/photos/:file', function(req, res){
 *       let uid = req.params.uid
 *         , file = req.params.file;
 *
 *       req.user.mayViewFilesFrom(uid, function(yes){
 *         if (yes) {
 *           res.sendFile('/uploads/' + uid + '/' + file);
 *         } else {
 *           res.send(403, 'Sorry! you cant see that.');
 *         }
 *       });
 *     });
 *
 * @public
 */

res.sendFile = function sendFile(this: oven.ws.Response, path: string, options?: any | ErrorCallback, callback?: ErrorCallback) {
    const req = this.req;
    const next = req.next;
    let done = callback;
    let opts = options || {};

    if (!path) {
        throw new TypeError("path argument is required to res.sendFile");
    }

    if (typeof path !== "string") {
        throw new TypeError("path must be a string to res.sendFile");
    }

    // support function as second arg
    if (typeof options === "function") {
        done = options;
        opts = {};
    }

    if (!opts.root && !isAbsolute(path)) {
        throw new TypeError("path must be absolute or specify root to res.sendFile");
    }

    // create file stream
    const pathname = encodeURI(path);
    const file = send(req, pathname, opts);

    // transfer
    pipeFile(this, file, opts, function (err: FileError) {
        if (done) {
            return done(err);
        } else if (err) {
            if (err.code === "EISDIR") {
                next();
            } else if (err.code !== "ECONNABORTED" && err.syscall !== "write") {
                next(err);
            }
        }
    });
};

/**
 * Transfer the file at the given `path` as an attachment.
 *
 * Optionally providing an alternate attachment `filename`,
 * and optional callback `callback(err)`. The callback is invoked
 * when the data transfer is complete, or when an error has
 * ocurred. Be sure to check `res.headersSent` if you plan to respond.
 *
 * Optionally providing an `options` object to use with `res.sendFile()`.
 * This function will set the `Content-Disposition` header, overriding
 * any `Content-Disposition` header passed as header options in order
 * to set the attachment and filename.
 *
 * This method uses `res.sendFile()`.
 *
 * @public
 */

res.download = function download(
    this: oven.ws.Response,
    path: string,
    filename?: string | ErrorCallback,
    options?: any | ErrorCallback,
    callback?: ErrorCallback,
) {
    let name = filename;
    let done = callback;
    let opts = options || null;

    // support function as second or third arg
    if (typeof filename === "function") {
        done = filename;
        name = null;
        opts = null;
    } else if (typeof options === "function") {
        done = options;
        opts = null;
    }

    // set Content-Disposition when file is sent
    const headers: Record<string, string> = {
        "Content-Disposition": contentDisposition((name || path) as string),
    };

    // merge user-provided headers
    if (opts && opts.headers) {
        const keys = Object.keys(opts.headers);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key.toLowerCase() !== "content-disposition") {
                headers[key] = opts.headers[key];
            }
        }
    }

    // merge user-provided options
    opts = Object.create(opts);
    opts.headers = headers;

    // Resolve the full path for sendFile
    const fullPath = resolve(path);

    // send file
    return this.sendFile(fullPath, opts, done);
};

/**
 * Set _Content-Type_ response header with `type` through `mime.lookup()`
 * when it does not contain "/", or set the Content-Type to `type` otherwise.
 *
 * Examples:
 *
 *     res.type('.html');
 *     res.type('html');
 *     res.type('json');
 *     res.type('application/json');
 *     res.type('png');
 *
 * @param {String} type
 * @return {ServerResponse} for chaining
 * @public
 */

res.type = function contentType(this: oven.ws.Response, type: string) {
    const ct = type.indexOf("/") === -1 ? mime.lookup(type) : type;
    return this.set("Content-Type", ct);
};

/**
 * Respond to the Acceptable formats using an `obj`
 * of mime-type callbacks.
 *
 * This method uses `req.accepted`, an array of
 * acceptable types ordered by their quality values.
 * When "Accept" is not present the _first_ callback
 * is invoked, otherwise the first match is used. When
 * no match is performed the server responds with
 * 406 "Not Acceptable".
 *
 * Content-Type is set for you, however if you choose
 * you may alter this within the callback using `res.type()`
 * or `res.set('Content-Type', ...)`.
 *
 *    res.format({
 *      'text/plain': function(){
 *        res.send('hey');
 *      },
 *
 *      'text/html': function(){
 *        res.send('<p>hey</p>');
 *      },
 *
 *      'appliation/json': function(){
 *        res.send({ message: 'hey' });
 *      }
 *    });
 *
 * In addition to canonicalized MIME types you may
 * also use extnames mapped to these types:
 *
 *    res.format({
 *      text: function(){
 *        res.send('hey');
 *      },
 *
 *      html: function(){
 *        res.send('<p>hey</p>');
 *      },
 *
 *      json: function(){
 *        res.send({ message: 'hey' });
 *      }
 *    });
 *
 * By default WS passes an `Error`
 * with a `.status` of 406 to `next(err)`
 * if a match is not made. If you provide
 * a `.default` callback it will be invoked
 * instead.
 *
 * @param {Object} obj
 * @return {ServerResponse} for chaining
 * @public
 */

res.format = function (this: oven.ws.Response, obj) {
    const req = this.req;
    const next = req.next;

    const fn = obj.default;
    if (fn) {
        delete obj.default;
    }
    const keys = Object.keys(obj);
    const key = keys.length > 0 ? req.accepts(keys) : false;

    this.vary("Accept");

    if (key) {
        this.set("Content-Type", normalizeType(key).value);
        obj[key](req, this, next);
    } else if (fn) {
        fn();
    } else {
        const err = new Error("Not Acceptable") as FormatError;
        err.status = err.status = 406;
        err.types = normalizeTypes(keys).map(function (o) {
            return o.value;
        });
        next(err);
    }

    return this;
};

/**
 * Set _Content-Disposition_ header to _attachment_ with optional `filename`.
 *
 * @param {String} filename
 * @return {ServerResponse}
 * @public
 */

res.attachment = function attachment(this: oven.ws.Response, filename: string) {
    if (filename) {
        this.type(extname(filename));
    }

    this.set("Content-Disposition", contentDisposition(filename));

    return this;
};

/**
 * Append additional header `field` with value `val`.
 *
 * Example:
 *
 *    res.append('Link', ['<http://localhost/>', '<http://localhost:3000/>']);
 *    res.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly');
 *    res.append('Warning', '199 Miscellaneous warning');
 *
 * @param {String} field
 * @param {String|Array} val
 * @return {ServerResponse} for chaining
 * @public
 */

res.append = function append(this: oven.ws.Response, field: string, val?: string[] | string) {
    const prev = this.get(field);
    let value = val;

    if (prev) {
        // concat the new and prev vals
        value = Array.isArray(prev) ? prev.concat(val) : Array.isArray(val) ? [prev].concat(val) : [prev, val];
    }

    return this.set(field, value);
};

/**
 * Get value for header `field`.
 *
 * @param {String} field
 * @return {String}
 * @public
 */

res.get = function (this: oven.ws.Response, field: string): any {
    return this.getHeader(field);
};

/**
 * Set header `field` to `val`, or pass
 * an object of header fields.
 *
 * Examples:
 *
 *    res.set('Foo', ['bar', 'baz']);
 *    res.set('Accept', 'application/json');
 *    res.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
 *
 * Aliased as `res.header()`.
 *
 * @param {String|Object} field
 * @param {String|Array} val
 * @return {ServerResponse} for chaining
 * @public
 */

res.set = function header(this: oven.ws.Response, field: any, val?: string | string[]) {
    if (arguments.length === 2) {
        let value = Array.isArray(val) ? val.map(String) : String(val);

        // add charset to content-type
        if (field.toLowerCase() === "content-type") {
            if (Array.isArray(value)) {
                throw new TypeError("Content-Type cannot be set to an Array");
            }
            if (!charsetRegExp.test(value)) {
                const charset = mime.charset(value.split(";")[0]);
                if (charset) {
                    value += "; charset=" + charset.toLowerCase();
                }
            }
        }

        this.setHeader(field, value);
    } else {
        for (const key in field as Record<string, any>) {
            this.set(key, field[key]);
        }
    }
    return this;
};

/**
 * Clear cookie `name`.
 *
 * @param {String} name
 * @param {Object} [options]
 * @return {ServerResponse} for chaining
 * @public
 */

res.clearCookie = function clearCookie(this: oven.ws.Response, name: string, options?: any) {
    const opts = merge({ expires: new Date(1), path: "/" }, options);
    return this.cookie(name, "", opts);
};

/**
 * Set cookie `name` to `value`, with the given `options`.
 *
 * Options:
 *
 *    - `maxAge`   max-age in milliseconds, converted to `expires`
 *    - `signed`   sign the cookie
 *    - `path`     defaults to "/"
 *
 * Examples:
 *
 *    // "Remember Me" for 15 minutes
 *    res.cookie('rememberme', '1', { expires: new Date(Date.now() + 900000), httpOnly: true });
 *
 *    // same as above
 *    res.cookie('rememberme', '1', { maxAge: 900000, httpOnly: true })
 *
 * @param {String} name
 * @param {String|Object} value
 * @param {Object} [options]
 * @return {ServerResponse} for chaining
 * @public
 */

res.cookie = function (this: oven.ws.Response, name: string, value?: string | any, options?: CookieOptions) {
    const opts = merge({}, options) as CookieOptions;
    const secret = this.req.secret;
    const signed = opts.signed;

    if (signed && !secret) {
        throw new Error('cookieParser("secret") required for signed cookies');
    }

    let val = typeof value === "object" ? "j:" + JSON.stringify(value) : String(value);

    if (signed) {
        val = "s:" + sign(val, secret);
    }

    if ("maxAge" in opts) {
        opts.expires = new Date(Date.now() + opts.maxAge);
        opts.maxAge /= 1000;
    }

    if (opts.path == null) {
        opts.path = "/";
    }

    this.append("Set-Cookie", cookie.serialize(name, String(val), opts));

    return this;
};

/**
 * Set the location header to `url`.
 *
 * The given `url` can also be "back", which redirects
 * to the _Referrer_ or _Referer_ headers or "/".
 *
 * Examples:
 *
 *    res.location('/foo/bar').;
 *    res.location('http://example.com');
 *    res.location('../login');
 *
 * @param {String} url
 * @return {ServerResponse} for chaining
 * @public
 */

res.location = function location(this: oven.ws.Response, url: string) {
    let loc = url;

    // "back" is an alias for the referrer
    if (url === "back") {
        loc = this.req.get("Referrer") || "/";
    }

    // set location
    return this.set("Location", encodeUrl(loc));
};

/**
 * Redirect to the given `url` with optional response `status`
 * defaulting to 302.
 *
 * The resulting `url` is determined by `res.location()`, so
 * it will play nicely with mounted apps, relative paths,
 * `"back"` etc.
 *
 * Examples:
 *
 *    res.redirect('/foo/bar');
 *    res.redirect('http://example.com');
 *    res.redirect(301, 'http://example.com');
 *    res.redirect('../login'); // /blog/post/1 -> /blog/login
 *
 * @public
 */

res.redirect = function redirect(this: oven.ws.Response, url) {
    const status = 302;
    let address = url;
    let body;

    // Set location header
    address = this.location(address).get("Location");

    // Support text/{plain,html} by default
    this.format({
        text: function () {
            body = statuses.message[status] + ". Redirecting to " + address;
        },

        html: function () {
            const u = escapeHtml(address);
            body = "<p>" + statuses.message[status] + '. Redirecting to <a href="' + u + '">' + u + "</a></p>";
        },

        default: function () {
            body = "";
        },
    });

    // Respond
    this.statusCode = status;
    this.set("Content-Length", Buffer.byteLength(body));

    if (this.req.method === "HEAD") {
        this.end();
    } else {
        this.end(body);
    }
};

/**
 * Add `field` to Vary. If already present in the Vary set, then
 * this call is simply ignored.
 *
 * @param {Array|String} field
 * @return {ServerResponse} for chaining
 * @public
 */

res.vary = function (this: oven.ws.Response, field) {
    // checks for back-compat
    if (!field || (Array.isArray(field) && !field.length)) {
        throw new Error("res.vary(): Provide a field name");
    }

    vary(this, field);

    return this;
};

/**
 * Render `view` with the given `options` and optional callback `fn`.
 * When a callback function is given a response will _not_ be made
 * automatically, otherwise a response of _200_ and _text/html_ is given.
 *
 * Options:
 *
 *  - `cache`     boolean hinting to the engine it should cache
 *  - `filename`  filename of the view being rendered
 *
 * @public
 */

res.render = function render(this: oven.ws.Response, view: string, options?: oven.ws.RenderCallback | object, callback?: oven.ws.RenderCallback) {
    const app = this.req.app;
    const req = this.req;
    const self = this;
    let done = callback;
    let opts = options || ({} as any);

    // support callback function as second arg
    if (typeof options === "function") {
        done = options as oven.ws.RenderCallback;
        opts = {};
    }

    // merge res.locals
    opts._locals = self.locals;

    // default callback to respond
    done = done || (((err, str) => (err ? req.next(err) : self.send(str))) as oven.ws.RenderCallback);

    // render
    app.render(view, opts, done);
};

// pipe the send file stream
function pipeFile(res: http.ServerResponse, file: SendStream, options: any, callback: ErrorCallback) {
    let isDone = false;
    let isStreaming = false;

    // request aborted
    function onaborted() {
        if (isDone) {
            return;
        }
        isDone = true;

        const err = new Error("Request aborted") as FileError;
        err.code = "ECONNABORTED";
        callback(err);
    }

    // directory
    function ondirectory() {
        if (isDone) {
            return;
        }
        isDone = true;

        const err = new Error("EISDIR, read") as FileError;
        err.code = "EISDIR";
        callback(err);
    }

    // errors
    function onerror(err: Error) {
        if (isDone) {
            return;
        }
        isDone = true;
        callback(err);
    }

    // ended
    function onend() {
        if (isDone) {
            return;
        }
        isDone = true;
        callback();
    }

    // file
    function onfile() {
        isStreaming = false;
    }

    // finished
    function onfinish(err: FileError) {
        if (err && err.code === "ECONNRESET") return onaborted();
        if (err) return onerror(err);
        if (isDone) return;

        setImmediate(function () {
            if (isStreaming !== false && !isDone) {
                onaborted();
                return;
            }

            if (isDone) return;
            isDone = true;
            callback();
        });
    }

    // streaming
    function onstream() {
        isStreaming = true;
    }

    file.on("directory", ondirectory);
    file.on("end", onend);
    file.on("error", onerror);
    file.on("file", onfile);
    file.on("stream", onstream);
    onFinished(res, onfinish);

    if (options.headers) {
        // set headers on successful transfer
        file.on("headers", function headers(res: http.ServerResponse) {
            const obj = options.headers;
            const keys = Object.keys(obj);

            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                res.setHeader(k, obj[k]);
            }
        });
    }

    // pipe
    file.pipe(res);
}

/**
 * Stringify JSON, like JSON.stringify, but v8 optimized, with the
 * ability to escape characters that can trigger HTML sniffing.
 *
 * @param {*} value
 * @param {function} replaces
 * @param {number} spaces
 * @param {boolean} escape
 * @returns {string}
 * @private
 */

function stringify(value: any, replacer?: (this: any, key: string, value: any) => any, space?: string | number, escape?: string) {
    // v8 checks arguments.length for optimizing simple call
    // https://bugs.chromium.org/p/v8/issues/detail?id=4730
    let json = replacer || space ? JSON.stringify(value, replacer, space) : JSON.stringify(value);

    if (escape) {
        json = json.replace(/[<>&]/g, function (c) {
            switch (c.charCodeAt(0)) {
                case 0x3c:
                    return "\\u003c";
                case 0x3e:
                    return "\\u003e";
                case 0x26:
                    return "\\u0026";
                /* istanbul ignore next: unreachable default */
                default:
                    return c;
            }
        });
    }

    return json;
}
