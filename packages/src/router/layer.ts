import { pathToRegexp, Key, TokensToRegexpOptions } from "path-to-regexp";
import { ParseOptions } from "querystring";
import dbg from "debug";
import Route from "./route";

// types
import { ParamsDictionary, PathParams } from "../types";
import { HttpError } from "http-errors";

const debug = dbg("oven/ws:router:layer");
const hasOwnProperty = Object.prototype.hasOwnProperty;

function decode_param(val: string) {
    if (typeof val !== "string" || val.length === 0) {
        return val;
    }

    try {
        return decodeURIComponent(val);
    } catch (err) {
        if (err instanceof URIError) {
            err.message = "Failed to decode param '" + val + "'";
            (err as HttpError).status = 400;
        }

        throw err;
    }
}

interface RegExpFast extends RegExp {
    fast_star: boolean;
    fast_slash: boolean;
}

export default class Layer {
    public method: string;
    public name: string;
    public path: string;
    public params: ParamsDictionary;
    public regexp: RegExpFast;
    public keys: Key[];
    public route: Route;
    public handle: oven.ws.RequestHandler | oven.ws.ErrorHandler;

    constructor(path: PathParams, options: TokensToRegexpOptions & ParseOptions, fn: oven.ws.RequestHandler | oven.ws.ErrorHandler) {
        debug("new %o", path);
        const opts = options || {};

        this.handle = fn;
        this.name = fn.name || "<anonymous>";
        this.params = undefined;
        this.path = undefined;
        this.regexp = pathToRegexp(path, (this.keys = []), opts) as RegExpFast;

        // set fast path flags
        this.regexp.fast_star = path === "";
        this.regexp.fast_slash = path === "/" && opts.end === false;
    }

    public handle_error(error: Error, req: oven.ws.Request, res: oven.ws.Response, next: oven.ws.Next): void {
        const fn = this.handle as oven.ws.ErrorHandler;

        if (fn.length !== 4) {
            // not a standard error handler
            return next(error);
        }

        try {
            fn(error, req, res, next);
        } catch (err) {
            next(err);
        }
    }

    public handle_request(req: oven.ws.Request, res: oven.ws.Response, next: oven.ws.Next): void {
        const fn = this.handle as oven.ws.RequestHandler;

        if (fn.length > 3) {
            debug("not a standard request handler %s", fn.name);
            return next();
        }

        try {
            fn(req, res, next);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Check if this route matches `path`, if so
     * populate `.params`.
     *
     * @param {String} path
     * @return {Boolean}
     */
    public match(path: string): boolean {
        let match: RegExpExecArray;

        if (path != null) {
            // fast path non-ending match for / (any path matches)
            if (this.regexp.fast_slash) {
                this.params = {};
                this.path = "";
                return true;
            }

            // fast path for * (everything matched in a param)
            if (this.regexp.fast_star) {
                this.params = { 0: decode_param(path) };
                this.path = path;
                return true;
            }

            // match the path
            match = this.regexp.exec(path);
        }

        if (!match) {
            this.params = undefined;
            this.path = undefined;
            return false;
        }

        // store values
        this.params = {};
        this.path = match[0];

        const keys = this.keys;
        const params = this.params;

        for (let i = 1; i < match.length; i++) {
            const key = keys[i - 1];
            const prop = key.name;
            const val = decode_param(match[i]);

            if (val !== undefined || !hasOwnProperty.call(params, prop)) {
                params[prop] = val;
            }
        }

        return true;
    }
}
