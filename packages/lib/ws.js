import Route from "./router/route";
import Router from "./router";
import req from "./request";
import res from "./response";
import Application from "./application";
import setPrototypeOf from "setprototypeof";
// Middlewares
import bodyParser from "./middleware/body-parser";
import query from "./middleware/query";
import serveStatic from "./serve-static";
/**
 * Create an WS application.
 * @api private
 */
function createApplication() {
    function request(req, res) {
        return app.handle(req, res);
    }
    var app = setPrototypeOf(request, new Application());
    // expose the prototype that will get set on requests
    app.request = Object.create(req, {
        app: { configurable: true, enumerable: true, writable: true, value: app }
    });
    // expose the prototype that will get set on responses
    app.response = Object.create(res, {
        app: { configurable: true, enumerable: true, writable: true, value: app }
    });
    app.init();
    return app;
}
var ws = createApplication;
ws.application = Application;
ws.request = req;
ws.response = res;
ws.Route = Route;
ws.Router = Router;
ws.json = bodyParser.json;
ws.raw = bodyParser.raw;
ws.test = bodyParser.text;
ws.urlencoded = bodyParser.urlencoded;
ws.query = query;
ws.static = serveStatic;
export default ws;
//# sourceMappingURL=ws.js.map
//# sourceMappingURL=ws.js.map