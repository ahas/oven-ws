/// <reference types="node" />
import { Buffer } from "safe-buffer";
import proxyaddr from "proxy-addr";
import querystring from "querystring";
import { Request } from "./types";
interface IContentParam {
    value: string;
    params: any;
    quality?: number;
    originalIndex?: number;
}
declare type ParseQuery = (str: string, sep?: string, eq?: string, options?: querystring.ParseOptions) => Record<string, any>;
declare type GenerateETag = (body: Buffer, encoding: string) => string;
declare const etagGenerator: (body: Buffer, encoding: string) => string;
declare const wetagGenerator: (body: Buffer, encoding: string) => string;
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
export declare function isAbsolute(path: string): boolean;
/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */
export declare function normalizeType(type: string): IContentParam;
/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */
export declare function normalizeTypes(types: string[]): IContentParam[];
/**
 * Compile "etag" value to function.
 *
 * @param  {Boolean|String|Function} val
 */
export declare function compileETag(val: string | boolean): GenerateETag;
/**
 * Compile "query parser" value to function.
 */
export declare function compileQueryParser(val: string | boolean): ParseQuery;
/**
 * Compile "proxy trust" value to function.
 */
export declare function compileTrust(val: string | boolean | number): ReturnType<typeof proxyaddr.compile>;
/**
 * Set the charset in a given Content-Type string.
 */
export declare function setCharset(type: string, charset: string): string;
/**
 * Get the simple type checker.
 *
 * @param {string} type
 * @return {function}
 * @api public
 */
export declare function typeChecker(type: string): (req: Request) => boolean;
