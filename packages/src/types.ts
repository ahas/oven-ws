import Application from "./application";
import { HttpError } from "http-errors";
import Router from "./router";

export interface RouterOptions {
    /**
     * Enable case sensitivity.
     */
    caseSensitive?: boolean;

    /**
     * Preserve the req.params values from the parent router.
     * If the parent and the child have conflicting param names, the child’s value take precedence.
     *
     * @default false
     * @since 4.5.0
     */
    mergeParams?: boolean;

    /**
     * Enable strict routing.
     */
    strict?: boolean;
}

export interface Routable {
    (req: oven.ws.Request, res: oven.ws.Response, next?: oven.ws.Next): this;
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
export interface QueryDictionary {
    [key: string]: string;
}
export interface BodyDictionary {
    [key: string]: string;
}
export interface ParamsDictionary {
    [key: string]: string;
}
export type ParamsArray = string[];
export type Params = ParamsDictionary | ParamsArray;

type GetRouteParameter<RouteAfterColon extends string> = RouteAfterColon extends `${infer Char}${infer Rest}`
    ? Char extends "/" | "-" | "."
        ? ""
        : `${Char}${GetRouteParameter<Rest>}`
    : RouteAfterColon;

export type RouteParameters<Route extends string> = string extends Route
    ? ParamsDictionary
    : Route extends `${string}(${string}`
    ? ParamsDictionary //TODO: handling for regex parameters
    : Route extends `${string}:${infer Rest}`
    ? (GetRouteParameter<Rest> extends `${infer ParamName}?` ? { [P in ParamName]?: string } : { [P in GetRouteParameter<Rest>]: string }) &
          (Rest extends `${GetRouteParameter<Rest>}${infer Next}` ? RouteParameters<Next> : unknown)
    : {};

export type RequestHandlerParams = Router | oven.ws.RequestHandler | oven.ws.ErrorHandler | Array<oven.ws.ErrorHandler>;

export type PathParams = string | RegExp | Array<string | RegExp>;

export type RenderOptions = Record<string, any>;

export interface ErrorCallback {
    (err?: Error): void;
}

export interface TemplateEngine {
    (path: string, options: RenderOptions, callback: oven.ws.Next): void;
}

export interface ViewOptions {
    defaultEngine: string;
    root: string[];
    engines: { [key: string]: TemplateEngine };
}

export interface ServeStaticOptions {
    fallthrough: boolean;
    setHeaders: (...args: any[]) => void;
    redirect: boolean;
}

export type RouterMethod = "all" | "get" | "head" | "post" | "put" | "delete" | "connect" | "options" | "trace" | "patch";

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

    namespace oven.ws {
        interface Next {
            (err?: Error): void;
            (deferToNext?: "router"): void;
            (deferToNext?: "route"): void;
        }

        interface RequestHandler {
            (req: Request, res: Response, next: oven.ws.Next): void;
        }

        interface ErrorHandler {
            (err: Error, req: Request, res: Response, next: oven.ws.Next): void;
        }

        interface RenderCallback {
            (err: Error, html?: string): void;
        }

        interface RouterHandler<T = void> {
            (...handlers: oven.ws.RequestHandler[]): T;
            (...handlers: RequestHandlerParams[]): T;
        }

        interface RouterMatcher<T> {
            (path: PathParams, ...handlers: oven.ws.RequestHandler[]): T;
            (path: PathParams, ...handlers: RequestHandlerParams[]): T;
            (path: PathParams, ...subApplication: Application[]): T;
        }

        interface ParamHandler {
            (req: oven.ws.Request, res: oven.ws.Response, next: oven.ws.Next, value: any, name: string): any;
        }

        type ApplicationHandler<T> = RouterHandler<T> & RouterMatcher<T> & ((...handlers: RequestHandlerParams[]) => T);
    }
}
