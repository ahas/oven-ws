import { Buffer } from "safe-buffer";
import contentType from "content-type";
import { mime } from "./send";
import etag from "etag";
import proxyaddr from "proxy-addr";
import qs from "qs";
import querystring from "querystring";
import typeIs from "type-is";

// Interfaces
interface ContentParam {
    value: string;
    params: any;
    quality?: number;
    originalIndex?: number;
}

// Function Types
type ParseQuery = (str: string, sep?: string, eq?: string, options?: querystring.ParseOptions) => Record<string, any>;
type GenerateETag = (body: Buffer, encoding: string) => string;

/**
 * Create an ETag generator function, generating ETags with
 * the given options.
 *
 * @param {object} options
 * @return {function}
 * @private
 */

function createETagGenerator(options: etag.Options) {
    return function generateETag(body: Buffer, encoding: string) {
        const buf = !Buffer.isBuffer(body) ? Buffer.from(body, encoding) : body;

        return etag(buf as any, options);
    };
}

const etagGenerator = createETagGenerator({ weak: false });
const wetagGenerator = createETagGenerator({ weak: true });

/**
 * Return strong ETag for `body`.
 *
 * @param {String|Buffer} body
 * @param {String} [encoding]
 * @return {String}
 * @api private
 */
export { etagGenerator as etag };

/**
 * Return weak ETag for `body`.
 *
 * @param {String|Buffer} body
 * @param {String} [encoding]
 * @return {String}
 * @api private
 */
export { wetagGenerator as wetag };

/**
 * Check if `path` looks absolute.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */
export function isAbsolute(path: string): boolean {
    if ("/" === path[0]) return true;
    if (":" === path[1] && ("\\" === path[2] || "/" === path[2])) return true; // Windows device path
    if ("\\\\" === path.substring(0, 2)) return true; // Microsoft Azure absolute path
}

/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */
export function normalizeType(type: string): ContentParam {
    return ~type.indexOf("/") ? acceptParams(type) : ({ value: mime.lookup(type), params: {} } as ContentParam);
}

/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */
export function normalizeTypes(types: string[]): ContentParam[] {
    const ret = [];

    for (let i = 0; i < types.length; ++i) {
        ret.push(normalizeType(types[i]));
    }

    return ret;
}

/**
 * Parse accept params `str` returning an
 * object with `.value`, `.quality` and `.params`.
 * also includes `.originalIndex` for stable sorting
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function acceptParams(str: string, index?: number): ContentParam {
    const parts = str.split(/ *; */);
    const ret = { value: parts[0], quality: 1, params: {} as any, originalIndex: index };

    for (let i = 1; i < parts.length; ++i) {
        const pms = parts[i].split(/ *= */);
        if ("q" === pms[0]) {
            ret.quality = parseFloat(pms[1]);
        } else {
            ret.params[pms[0]] = pms[1];
        }
    }

    return ret;
}

/**
 * Compile "etag" value to function.
 *
 * @param  {Boolean|String|Function} val
 */

export function compileETag(val: string | boolean): GenerateETag {
    let fn;

    if (typeof val === "function") {
        return val;
    }

    switch (val) {
        case true:
            fn = wetagGenerator;
            break;
        case false:
            break;
        case "strong":
            fn = etagGenerator;
            break;
        case "weak":
            fn = wetagGenerator;
            break;
        default:
            throw new TypeError("unknown value for etag function: " + val);
    }

    return fn;
}

/**
 * Compile "query parser" value to function.
 */
export function compileQueryParser(val: string | boolean): ParseQuery {
    let fn;

    if (typeof val === "function") {
        return val;
    }

    switch (val) {
        case true:
            fn = querystring.parse;
            break;
        case false:
            fn = newObject;
            break;
        case "extended":
            fn = parseExtendedQueryString;
            break;
        case "simple":
            fn = querystring.parse;
            break;
        default:
            throw new TypeError("unknown value for query parser function: " + val);
    }

    return fn;
}

/**
 * Compile "proxy trust" value to function.
 */
export function compileTrust(val: string | boolean | number): ReturnType<typeof proxyaddr.compile> {
    if (typeof val === "function") {
        return val;
    }

    if (val === true) {
        // Support plain true/false
        return () => true;
    }

    if (typeof val === "number") {
        // Support trusting hop count
        return (_: string, i: number) => i < val;
    }

    // Support comma-separated values
    const addrs = typeof val === "string" ? val.split(/ *, */) : [];

    return proxyaddr.compile(addrs);
}

/**
 * Set the charset in a given Content-Type string.
 */
export function setCharset(type: string, charset: string): string {
    if (!type || !charset) {
        return type;
    }

    // parse type
    const parsed = contentType.parse(type);

    // set charset
    parsed.parameters.charset = charset;

    // format type
    return contentType.format(parsed);
}

/**
 * Parse an extended query string with qs.
 *
 * @return {Object}
 * @private
 */

function parseExtendedQueryString(str: string) {
    return qs.parse(str, {
        allowPrototypes: true,
    });
}

/**
 * Return new empty object.
 *
 * @return {Object}
 * @api private
 */

function newObject() {
    return {};
}

/**
 * Get the simple type checker.
 *
 * @param {string} type
 * @return {function}
 * @api public
 */
export function typeChecker(type: string): (req: oven.ws.Request) => boolean {
    return function checkType(req: oven.ws.Request): boolean {
        return Boolean(typeIs(req, type));
    };
}
