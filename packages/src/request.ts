import accepts from "accepts";
import { isIP } from "net";
import typeis from "type-is";
import http from "http";
import fresh from "fresh";
import parseRange from "range-parser";
import parse from "parseurl";
import proxyaddr from "proxy-addr";
import { BodyDictionary, ParamsDictionary, QueryDictionary } from "./types";
import { Options as RangeParserOptions, Result as RangeParserResult, Ranges as RangeParserRanges } from "range-parser";
import { TLSSocket } from "tls";
import Application from "./application";

declare global {
    namespace oven.ws {
        interface Request extends http.IncomingMessage {
            get<T = any>(name: string): T;
            accepts(): string[];
            accepts(type: string): string | false;
            accepts(type: string[]): string | false;
            accepts(...type: string[]): string | false;
            acceptsEncodings(): string[];
            acceptsEncodings(encoding: string): string | false;
            acceptsEncodings(encoding: string[]): string | false;
            acceptsEncodings(...encoding: string[]): string | false;
            acceptsCharsets(): string[];
            acceptsCharsets(charset: string): string | false;
            acceptsCharsets(charset: string[]): string | false;
            acceptsCharsets(...charset: string[]): string | false;
            acceptsLanguages(): string[];
            acceptsLanguages(lang: string): string | false;
            acceptsLanguages(lang: string[]): string | false;
            acceptsLanguages(...lang: string[]): string | false;
            range(size: number, options?: RangeParserOptions): RangeParserRanges | RangeParserResult | undefined;
            /**
             * Check if the incoming request contains the "Content-Type"
             * header field, and it contains the give mime `type`.
             *
             * Examples:
             *
             *      // With Content-Type: text/html; charset=utf-8
             *      req.is('html');
             *      req.is('text/html');
             *      req.is('text/*');
             *      // => true
             *
             *      // When Content-Type is application/json
             *      req.is('json');
             *      req.is('application/json');
             *      req.is('application/*');
             *      // => true
             *
             *      req.is('html');
             *      // => false
             */
            is(type: string | string[]): string | false | null;

            /**
             * Return the protocol string "http" or "https"
             * when requested with TLS. When the "trust proxy"
             * setting is enabled the "X-Forwarded-Proto" header
             * field will be trusted. If you're running behind
             * a reverse proxy that supplies https for you this
             * may be enabled.
             */
            protocol: string;

            /**
             * Short-hand for:
             *
             *    req.protocol == 'https'
             */
            secure: boolean;

            /**
             * Return the remote address, or when
             * "trust proxy" is `true` return
             * the upstream addr.
             */
            ip: string;

            /**
             * When "trust proxy" is `true`, parse
             * the "X-Forwarded-For" ip address list.
             *
             * For example if the value were "client, proxy1, proxy2"
             * you would receive the array `["client", "proxy1", "proxy2"]`
             * where "proxy2" is the furthest down-stream.
             */
            ips: string[];

            /**
             * Return subdomains as an array.
             *
             * Subdomains are the dot-separated parts of the host before the main domain of
             * the app. By default, the domain of the app is assumed to be the last two
             * parts of the host. This can be changed by setting "subdomain offset".
             *
             * For example, if the domain is "tobi.ferrets.example.com":
             * If "subdomain offset" is not set, req.subdomains is `["ferrets", "tobi"]`.
             * If "subdomain offset" is 3, req.subdomains is `["tobi"]`.
             */
            subdomains: string[];

            /**
             * Short-hand for `url.parse(req.url).pathname`.
             */
            path: string;

            /**
             * Parse the "Host" header field hostname.
             */
            hostname: string;

            /**
             * @deprecated Use hostname instead.
             */
            host: string;

            /**
             * Check if the request is fresh, aka
             * Last-Modified and/or the ETag
             * still match.
             */
            fresh: boolean;

            /**
             * Check if the request is stale, aka
             * "Last-Modified" and / or the "ETag" for the
             * resource has changed.
             */
            stale: boolean;

            /**
             * Check if the request was an _XMLHttpRequest_.
             */
            xhr: boolean;

            // body: { username: string; password: string; remember: boolean; title: string; };
            body: BodyDictionary;
            bodyParsed: boolean;

            // cookies: { string; remember: boolean; };
            cookies: any;
            // The secret code for cookies
            secret: string;
            method: string;
            params: ParamsDictionary;
            query: QueryDictionary;
            route: any;
            signedCookies: any;
            originalUrl: string;
            url: string;
            baseUrl: string;
            app: Application;
            length: string;

            /**
             * After middleware.init executed, Request will contain res and next properties
             */
            res?: oven.ws.Response;
            next?: oven.ws.Next;
        }
    }
}

const req = Object.create(http.IncomingMessage.prototype) as oven.ws.Request;

/**
 * Module exports.
 * @public
 */

export default req;

/**
 * Return request header.
 *
 * The `Referrer` header field is special-cased,
 * both `Referrer` and `Referer` are interchangeable.
 *
 * Examples:
 *
 *     req.get('Content-Type');
 *     // => "text/plain"
 *
 *     req.get('content-type');
 *     // => "text/plain"
 *
 *     req.get('Something');
 *     // => undefined
 *
 * Aliased as `req.header()`.
 *
 * @param {String} name
 * @return {String}
 * @public
 */

req.get = function header(this: oven.ws.Request, name: string): any {
    if (!name) {
        throw new TypeError("name argument is required to req.get");
    }

    if (typeof name !== "string") {
        throw new TypeError("name must be a string to req.get");
    }

    const lc = name.toLowerCase();

    switch (lc) {
        case "referer":
        case "referrer": {
            return this.headers.referrer || this.headers.referer;
        }
        default: {
            return this.headers[lc];
        }
    }
};

/**
 * To do: update docs.
 *
 * Check if the given `type(s)` is acceptable, returning
 * the best match when true, otherwise `undefined`, in which
 * case you should respond with 406 "Not Acceptable".
 *
 * The `type` value may be a single MIME type string
 * such as "application/json", an extension name
 * such as "json", a comma-delimited list such as "json, html, text/plain",
 * an argument list such as `"json", "html", "text/plain"`,
 * or an array `["json", "html", "text/plain"]`. When a list
 * or array is given, the _best_ match, if any is returned.
 *
 * Examples:
 *
 *     // Accept: text/html
 *     req.accepts('html');
 *     // => "html"
 *
 *     // Accept: text/*, application/json
 *     req.accepts('html');
 *     // => "html"
 *     req.accepts('text/html');
 *     // => "text/html"
 *     req.accepts('json, text');
 *     // => "json"
 *     req.accepts('application/json');
 *     // => "application/json"
 *
 *     // Accept: text/*, application/json
 *     req.accepts('image/png');
 *     req.accepts('png');
 *     // => undefined
 *
 *     // Accept: text/*;q=.5, application/json
 *     req.accepts(['html', 'json']);
 *     req.accepts('html', 'json');
 *     req.accepts('html, json');
 *     // => "json"
 *
 * @param {String|Array} type(s)
 * @return {String|Array|Boolean}
 * @public
 */

req.accepts = function (this: oven.ws.Request) {
    const accept = accepts(this);
    return accept.types.apply(accept, arguments);
};

/**
 * Check if the given `encoding`s are accepted.
 *
 * @param {String} ...encoding
 * @return {String|Array}
 * @public
 */

req.acceptsEncodings = function (this: oven.ws.Request) {
    const accept = accepts(this);
    return accept.encodings.apply(accept, arguments);
};

/**
 * Check if the given `charset`s are acceptable,
 * otherwise you should respond with 406 "Not Acceptable".
 *
 * @param {String} ...charset
 * @return {String|Array}
 * @public
 */

req.acceptsCharsets = function (this: oven.ws.Request) {
    const accept = accepts(this);
    return accept.charsets.apply(accept, arguments);
};

/**
 * Check if the given `lang`s are acceptable,
 * otherwise you should respond with 406 "Not Acceptable".
 *
 * @param {String} ...lang
 * @return {String|Array}
 * @public
 */

req.acceptsLanguages = function (this: oven.ws.Request) {
    const accept = accepts(this);
    return accept.languages.apply(accept, arguments);
};

/**
 * Parse Range header field, capping to the given `size`.
 *
 * Unspecified ranges such as "0-" require knowledge of your resource length. In
 * the case of a byte range this is of course the total number of bytes. If the
 * Range header field is not given `undefined` is returned, `-1` when unsatisfiable,
 * and `-2` when syntactically invalid.
 *
 * When ranges are returned, the array has a "type" property which is the type of
 * range that is required (most commonly, "bytes"). Each array element is an object
 * with a "start" and "end" property for the portion of the range.
 *
 * The "combine" option can be set to `true` and overlapping & adjacent ranges
 * will be combined into a single range.
 *
 * NOTE: remember that ranges are inclusive, so for example "Range: users=0-3"
 * should respond with 4 users when available, not 3.
 *
 * @param {number} size
 * @param {object} [options]
 * @param {boolean} [options.combine=false]
 * @return {number|array}
 * @public
 */

req.range = function range(this: oven.ws.Request, size, options) {
    const range = this.get("Range");
    if (!range) {
        return;
    }
    return parseRange(size, range, options);
};

/**
 * Check if the incoming request contains the "Content-Type"
 * header field, and it contains the give mime `type`.
 *
 * Examples:
 *
 *      // With Content-Type: text/html; charset=utf-8
 *      req.is('html');
 *      req.is('text/html');
 *      req.is('text/*');
 *      // => true
 *
 *      // When Content-Type is application/json
 *      req.is('json');
 *      req.is('application/json');
 *      req.is('application/*');
 *      // => true
 *
 *      req.is('html');
 *      // => false
 *
 * @param {String|Array} types...
 * @return {String|false|null}
 * @public
 */

req.is = function is(this: oven.ws.Request, types) {
    let arr = types;

    // support flattened arguments
    if (!Array.isArray(types)) {
        arr = new Array(arguments.length);
        for (let i = 0; i < arr.length; i++) {
            arr[i] = arguments[i];
        }
    }

    return typeis(this, arr as string[]);
};

/**
 * Return the protocol string "http" or "https"
 * when requested with TLS. When the "trust proxy"
 * setting trusts the socket address, the
 * "X-Forwarded-Proto" header field will be trusted
 * and used if present.
 *
 * If you're running behind a reverse proxy that
 * supplies https for you this may be enabled.
 *
 * @return {String}
 * @public
 */

defineGetter(req, "protocol", function protocol(this: oven.ws.Request) {
    const proto = (this.socket as TLSSocket).encrypted ? "https" : "http";
    const trust = this.app.$("trust proxy fn");

    if (!trust(this.socket.remoteAddress, 0)) {
        return proto;
    }

    // Note: X-Forwarded-Proto is normally only ever a
    //       single value, but this is to be safe.
    const header = this.get("X-Forwarded-Proto") || proto;
    const index = header.indexOf(",");

    return index !== -1 ? header.substring(0, index).trim() : header.trim();
});

/**
 * Short-hand for:
 *
 *    req.protocol === 'https'
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "secure", function secure(this: oven.ws.Request) {
    return this.protocol === "https";
});

/**
 * Return the remote address from the trusted proxy.
 *
 * The is the remote address on the socket unless
 * "trust proxy" is set.
 *
 * @return {String}
 * @public
 */

defineGetter(req, "ip", function ip(this: oven.ws.Request) {
    const trust = this.app.$("trust proxy fn");
    return proxyaddr(this, trust);
});

/**
 * When "trust proxy" is set, trusted proxy addresses + client.
 *
 * For example if the value were "client, proxy1, proxy2"
 * you would receive the array `["client", "proxy1", "proxy2"]`
 * where "proxy2" is the furthest down-stream and "proxy1" and
 * "proxy2" were trusted.
 *
 * @return {Array}
 * @public
 */

defineGetter(req, "ips", function ips(this: oven.ws.Request) {
    const trust = this.app.$("trust proxy fn");
    const addrs = proxyaddr.all(this, trust);

    // reverse the order (to farthest -> closest)
    // and remove socket address
    addrs.reverse().pop();

    return addrs;
});

/**
 * Return subdomains as an array.
 *
 * Subdomains are the dot-separated parts of the host before the main domain of
 * the app. By default, the domain of the app is assumed to be the last two
 * parts of the host. This can be changed by setting "subdomain offset".
 *
 * For example, if the domain is "tobi.ferrets.example.com":
 * If "subdomain offset" is not set, req.subdomains is `["ferrets", "tobi"]`.
 * If "subdomain offset" is 3, req.subdomains is `["tobi"]`.
 *
 * @return {Array}
 * @public
 */

defineGetter(req, "subdomains", function subdomains(this: oven.ws.Request) {
    const hostname = this.hostname;

    if (!hostname) {
        return [];
    }

    const offset = this.app.$("subdomain offset");
    const subdomains = !isIP(hostname) ? hostname.split(".").reverse() : [hostname];

    return subdomains.slice(offset);
});

/**
 * Short-hand for `url.parse(req.url).pathname`.
 *
 * @return {String}
 * @public
 */

defineGetter(req, "path", function path(this: oven.ws.Request) {
    return parse(this).pathname;
});

/**
 * Parse the "Host" header field to a hostname.
 *
 * When the "trust proxy" setting trusts the socket
 * address, the "X-Forwarded-Host" header field will
 * be trusted.
 *
 * @return {String}
 * @public
 */

defineGetter(req, "hostname", function hostname(this: oven.ws.Request) {
    const trust = this.app.$("trust proxy fn");
    let host = this.get("X-Forwarded-Host");

    if (!host || !trust(this.socket.remoteAddress, 0)) {
        host = this.get("Host");
    } else if (host.indexOf(",") !== -1) {
        // Note: X-Forwarded-Host is normally only ever a
        //       single value, but this is to be safe.
        host = host.substring(0, host.indexOf(",")).trimRight();
    }

    if (!host) return;

    // IPv6 literal support
    const offset = host[0] === "[" ? host.indexOf("]") + 1 : 0;
    const index = host.indexOf(":", offset);

    return index !== -1 ? host.substring(0, index) : host;
});

/**
 * Check if the request is fresh, aka
 * Last-Modified and/or the ETag
 * still match.
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "fresh", function (this: oven.ws.Request) {
    const method = this.method;
    const res = this.res;
    const status = res.statusCode;

    // GET or HEAD for weak freshness validation only
    if ("GET" !== method && "HEAD" !== method) return false;

    // 2xx or 304 as per rfc2616 14.26
    if ((status >= 200 && status < 300) || 304 === status) {
        return fresh(this.headers, {
            etag: res.get("ETag"),
            "last-modified": res.get("Last-Modified"),
        });
    }

    return false;
});

/**
 * Check if the request is stale, aka
 * "Last-Modified" and / or the "ETag" for the
 * resource has changed.
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "stale", function stale(this: oven.ws.Request) {
    return !this.fresh;
});

/**
 * Check if the request was an _XMLHttpRequest_.
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "xhr", function xhr(this: oven.ws.Request) {
    const val = this.get("X-Requested-With") || "";
    return val.toLowerCase() === "xmlhttprequest";
});

/**
 * Helper function for creating a getter on an object.
 *
 * @param {Object} obj
 * @param {String} name
 * @param {Function} getter
 * @private
 */
function defineGetter(obj: object, name: string, getter: () => void) {
    Object.defineProperty(obj, name, {
        configurable: true,
        enumerable: true,
        get: getter,
    });
}
