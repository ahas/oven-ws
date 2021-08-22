/// <reference types="node" />
import Route from "./router/route";
import Router from "./router";
import Application from "./application";
import { RequestListener } from "http";
import { ServeStaticOptions, Request, Response, RequestHandler } from "./types";
import { JsonBodyParserOptions } from "./middleware/body-parser/types";
import { IParseOptions } from "qs";
interface WS {
    (): Application & RequestListener;
    Route: typeof Route;
    Router: typeof Router;
    application: typeof Application;
    request: Request;
    response: Response;
    json: (options: JsonBodyParserOptions) => RequestHandler;
    raw: (options: JsonBodyParserOptions) => RequestHandler;
    test: (options: JsonBodyParserOptions) => RequestHandler;
    urlencoded: (options: JsonBodyParserOptions) => RequestHandler;
    query: (options: IParseOptions) => RequestHandler;
    static: (root: string, options: ServeStaticOptions) => RequestHandler;
}
declare const ws: WS;
export default ws;
