import ws from "..";
import request from "supertest";

describe("app.route", () => {
    it("should return a new route", (done) => {
        const app = ws();

        app.route("/foo")
            .get((req, res) => {
                res.send("get");
            })
            .post((req, res) => {
                res.send("post");
            });

        request(app).post("/foo").expect("post", done);
    });

    it("should all .VERB after .all", (done) => {
        const app = ws();

        app.route("/foo")
            .all((req, res, next) => {
                next();
            })
            .get((req, res) => {
                res.send("get");
            })
            .post((req, res) => {
                res.send("post");
            });

        request(app).post("/foo").expect("post", done);
    });

    it("should support dynamic routes", (done) => {
        const app = ws();

        app.route("/:foo").get(function (req, res) {
            res.send(req.params.foo);
        });

        request(app).get("/test").expect("test", done);
    });

    it("should not error on empty routes", (done) => {
        const app = ws();

        app.route("/:foo");

        request(app).get("/test").expect(404, done);
    });
});
