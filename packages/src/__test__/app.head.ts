import ws from "../";
import request from "supertest";
import assert from "assert";

describe("HEAD", () => {
    it("should default to GET", (done) => {
        const app = ws();

        app.get("/test", (req, res) => {
            // send() detects HEAD
            res.send("test");
        });

        request(app).head("/test").expect(200, done);
    });

    it("should output the same headers as GET requests", (done) => {
        const app = ws();

        app.get("/test", (req, res) => {
            // send() detects HEAD
            res.send("test");
        });

        request(app)
            .get("/test")
            .expect(200, (err, res) => {
                if (err) {
                    return done(err);
                }
                const headers = res.headers;
                request(app)
                    .get("/test")
                    .expect(200, (err, res) => {
                        if (err) {
                            return done(err);
                        }
                        delete headers.date;
                        delete res.headers.date;
                        assert.deepStrictEqual(res.headers, headers);
                        done();
                    });
            });
    });
});

describe("app.head()", () => {
    it("should overload", (done) => {
        const app = ws();
        let called: boolean;

        app.head("/test", (req, res) => {
            called = true;
            res.end("");
        });

        app.get("/test", (req, res) => {
            assert(0, "should not call GET");
            res.send("test");
        });

        request(app)
            .head("/test")
            .expect(200, () => {
                assert(called);
                done();
            });
    });
});
