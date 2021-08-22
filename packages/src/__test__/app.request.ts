import ws from "../";
import request from "supertest";

declare global {
    namespace oven.ws {
        interface Request {
            querystring: () => any;
        }
    }
}

describe("app", function () {
    describe(".request", function () {
        it("should extend the request prototype", (done) => {
            const app = ws();

            app.request.querystring = function () {
                return require("url").parse(this.url).query;
            };

            app.use((req, res) => {
                res.end(req.querystring());
            });

            request(app).get("/foo?name=ahas").expect("name=ahas", done);
        });
    });
});
