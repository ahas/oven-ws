/// <reference types="node" />
import { Key, TokensToRegexpOptions } from "path-to-regexp";
import { ParseOptions } from "querystring";
import Route from "./route";
import { Request, Response, NextHandler, ParamsDictionary, PathParams, ErrorHandler, RequestHandler } from "../types";
interface RegExpFast extends RegExp {
    fast_star: boolean;
    fast_slash: boolean;
}
export default class Layer {
    method: string;
    name: string;
    path: string;
    params: ParamsDictionary;
    regexp: RegExpFast;
    keys: Key[];
    route: Route;
    handle: RequestHandler | ErrorHandler;
    constructor(path: PathParams, options: TokensToRegexpOptions & ParseOptions, fn: RequestHandler | ErrorHandler);
    handle_error(error: Error, req: Request, res: Response, next: NextHandler): void;
    handle_request(req: Request, res: Response, next: NextHandler): void;
    /**
     * Check if this route matches `path`, if so
     * populate `.params`.
     *
     * @param {String} path
     * @return {Boolean}
     */
    match(path: string): boolean;
}
export {};
