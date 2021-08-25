import Route from "./router/route";
import Router from "./router";
import req from "./request";
import res from "./response";
import Application from "./application";
import { RequestListener } from "http";
import { ServeStaticOptions, RouterOptions } from "./types";
import setPrototypeOf from "setprototypeof";

// Middlewares
import bodyParser from "./middleware/body-parser";
import query from "./middleware/query";
import serveStatic from "./serve-static";
import { IParseOptions } from "qs";
import { JsonBodyParserOptions } from "./middleware/body-parser/types";

export interface WS {
    (): Application & RequestListener;
    Route: typeof Route;
    Router: (options?: RouterOptions) => Router;
    application: typeof Application;
    request: oven.ws.Request;
    response: oven.ws.Response;
    json: (options: JsonBodyParserOptions) => oven.ws.RequestHandler;
    raw: (options: JsonBodyParserOptions) => oven.ws.RequestHandler;
    test: (options: JsonBodyParserOptions) => oven.ws.RequestHandler;
    urlencoded: (options: JsonBodyParserOptions) => oven.ws.RequestHandler;
    query: (options: IParseOptions) => oven.ws.RequestHandler;
    static: (root: string, options: ServeStaticOptions) => oven.ws.RequestHandler;
}

/**
 * Create an WS application.
 * @api private
 */

function createApplication(): Application & RequestListener {
    function request(req: oven.ws.Request, res: oven.ws.Response, next: oven.ws.Next) {
        return app.handle(req, res, next);
    }

    const app = setPrototypeOf(request, new Application()) as Application & RequestListener;

    // expose the prototype that will get set on requests
    app.request = Object.create(req, {
        app: { configurable: true, enumerable: true, writable: true, value: app },
    });

    // expose the prototype that will get set on responses
    app.response = Object.create(res, {
        app: { configurable: true, enumerable: true, writable: true, value: app },
    });

    app.init();

    return app;
}

const ws = createApplication as WS;
ws.application = Application;
ws.request = req;
ws.response = res;
ws.Route = Route;
ws.Router = (options?: RouterOptions) => new Router(options);

ws.json = bodyParser.json;
ws.raw = bodyParser.raw;
ws.test = bodyParser.text;
ws.urlencoded = bodyParser.urlencoded;
ws.query = query;
ws.static = serveStatic;

export default ws;
