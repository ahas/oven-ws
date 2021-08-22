/// <reference types="node" />
import Application from "./application";
import http from "http";
import { Options as RangeParserOptions, Result as RangeParserResult, Ranges as RangeParserRanges } from "range-parser";
import { HttpError } from "http-errors";
import Router from "./router";
export interface Request extends http.IncomingMessage {
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
    body: BodyDictionary;
    bodyParsed: boolean;
    cookies: any;
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
    res?: Response;
    next?: NextHandler;
}
export interface CookieOptions {
    maxAge?: number;
    signed?: boolean;
    expires?: Date;
    httpOnly?: boolean;
    path?: string;
    domain?: string;
    secure?: boolean;
    encode?: (val: string) => string;
    sameSite?: boolean | "lax" | "strict" | "none";
}
export interface RenderCallback {
    (err: Error, html?: string): void;
}
export interface Response extends http.ServerResponse {
    status(code: number): Response;
    links(links: object): Response;
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
    req: Request;
    app: Application;
}
export interface NextHandler {
    (err?: Error): void;
    (deferToNext?: "router"): void;
    (deferToNext?: "route"): void;
}
export interface QueryDictionary {
    [key: string]: string;
}
export interface BodyDictionary {
    [key: string]: string;
}
export interface ParamsDictionary {
    [key: string]: string;
}
export declare type ParamsArray = string[];
export declare type Params = ParamsDictionary | ParamsArray;
declare type GetRouteParameter<RouteAfterColon extends string> = RouteAfterColon extends `${infer Char}${infer Rest}` ? Char extends "/" | "-" | "." ? "" : `${Char}${GetRouteParameter<Rest>}` : RouteAfterColon;
export declare type RouteParameters<Route extends string> = string extends Route ? ParamsDictionary : Route extends `${string}(${string}` ? ParamsDictionary : Route extends `${string}:${infer Rest}` ? (GetRouteParameter<Rest> extends `${infer ParamName}?` ? {
    [P in ParamName]?: string;
} : {
    [P in GetRouteParameter<Rest>]: string;
}) & (Rest extends `${GetRouteParameter<Rest>}${infer Next}` ? RouteParameters<Next> : unknown) : {};
export interface RequestHandler {
    (req: Request, res: Response, next?: NextHandler): void;
}
export interface ErrorHandler {
    (err: Error, req: Request, res: Response, next: NextHandler): void;
}
export declare type HandlerParam = Router | RequestHandler | ErrorHandler;
export declare type PathParams = string | RegExp | Array<string | RegExp>;
export interface RouterHandler<T = void> {
    (...handlers: HandlerParam[]): T;
}
export interface RouterMatcher<T> {
    (path: PathParams, ...handlers: HandlerParam[]): T;
    (path: PathParams, ...subApplication: Application[]): T;
}
export interface ParamHandler {
    (req: Request, res: Response, next: NextHandler, value: any, name: string): any;
}
export declare type ApplicationHandler<T> = RouterHandler<T> & RouterMatcher<T>;
export declare type RenderOptions = Record<string, any>;
export interface ErrorCallback {
    (err?: Error): void;
}
export interface TemplateEngine {
    (path: string, options: RenderOptions, callback: NextHandler): void;
}
export interface ViewOptions {
    defaultEngine: string;
    root: string[];
    engines: {
        [key: string]: TemplateEngine;
    };
}
declare global {
    interface FileError extends Error {
        code: string;
        syscall: string;
    }
    interface ViewError extends Error {
        view: any;
    }
    interface FormatError extends HttpError {
        types: string[];
    }
}
export interface ServeStaticOptions {
    fallthrough: boolean;
    setHeaders: (...args: any[]) => void;
    redirect: boolean;
}
export {};
