import ws from "..";
import request from "supertest";

describe("app", function () {
    describe(".VERB()", function () {
        it("should not get invoked without error handler on error", function (done) {
            const app = ws();

            app.use((req, res, next) => {
                next(new Error("boom!"));
            });

            app.get("/bar", (req, res) => {
                res.send("hello, world!");
            });

            request(app)
                .post("/bar")
                .expect(500, /Error: boom!/, done);
        });

        it("should only call an error handling routing callback when an error is propagated", function (done) {
            const app = ws();

            let a = false;
            let b = false;
            let c = false;
            let d = false;

            app.get(
                "/",
                ((req, res, next) => {
                    next(new Error("fabricated error"));
                }) as oven.ws.RequestHandler,
                ((req, res, next) => {
                    a = true;
                    next();
                }) as oven.ws.RequestHandler,
                ((err, req, res, next) => {
                    b = true;
                    expect(err.message).toBe("fabricated error");
                    next(err);
                }) as oven.ws.ErrorHandler,
                ((err, req, res, next) => {
                    c = true;
                    expect(err.message).toBe("fabricated error");
                    next();
                }) as oven.ws.ErrorHandler,
                ((err, req, res, next) => {
                    d = true;
                    next();
                }) as oven.ws.ErrorHandler,
                ((req, res) => {
                    expect(a).toBe(false);
                    expect(b).toBe(true);
                    expect(c).toBe(true);
                    expect(d).toBe(false);
                    res.send(204);
                }) as oven.ws.RequestHandler,
            );

            request(app).get("/").expect(204, done);
        });
    });
});
