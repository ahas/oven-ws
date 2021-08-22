import ws from "../";
import request from "supertest";

describe("app.all()", () => {
    it("should add a router per method", (done) => {
        const app = ws();

        app.all("/test", (req, res) => {
            res.end(req.method);
        });

        request(app)
            .put("/test")
            .expect("PUT", () => {
                request(app).get("/test").expect("GET", done);
            });
    });

    it("should run the callback for a method just once", (done) => {
        const app = ws();
        let n = 0;

        app.all("/(.*)", (req, res, next) => {
            if (n++) {
                return done(new Error("DELETE called several times"));
            }
            next();
        });

        request(app)
            .del("/test")
            .expect(404, (err, res) => {
                done(err, res);
            });
    });
});
