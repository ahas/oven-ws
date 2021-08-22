import ws from "..";
import request from "supertest";

describe("app", () => {
    describe(".param(fn)", () => {
        it("should map app.param(name, ...) logic", (done) => {
            const app = ws();

            app.param((name, regexp) => {
                if (Object.prototype.toString.call(regexp) === "[object RegExp]") {
                    // See #1557
                    return (req, res, next, val) => {
                        let captures;
                        if ((captures = regexp.exec(String(val)))) {
                            req.params[name] = captures[1];
                            next();
                        } else {
                            next("route");
                        }
                    };
                }
            });

            app.param("name", /^([a-zA-Z]+)$/);

            app.get("/user/:name", function (req, res) {
                res.send(req.params.name);
            });

            request(app)
                .get("/user/ahas")
                .expect(200, "ahas", (err) => {
                    if (err) {
                        return done(err);
                    }
                    request(app).get("/user/123").expect(404, done);
                });
        });

        it("should fail if not given fn", () => {
            const app = ws();
            expect(app.param.bind(app, "name", "ahas")).toThrow();
        });
    });

    describe(".param(names, fn)", () => {
        it("should map the array", (done) => {
            const app = ws();

            app.param(["id", "uid"], (req, res, next, id) => {
                id = Number(id);
                if (isNaN(id)) return next("route");
                req.params.id = id;
                next();
            });

            app.get("/post/:id", (req, res) => {
                const id = req.params.id;
                expect(typeof id).toBe("number");
                res.send("" + id);
            });

            app.get("/user/:uid", (req, res) => {
                const id = req.params.id;
                expect(typeof id).toBe("number");
                res.send("" + id);
            });

            request(app)
                .get("/user/123")
                .expect(200, "123", (err) => {
                    if (err) return done(err);
                    request(app).get("/post/123").expect("123", done);
                });
        });
    });

    describe(".param(name, fn)", () => {
        it("should map logic for a single param", (done) => {
            const app = ws();

            app.param("id", (req, res, next, id) => {
                id = Number(id);
                if (isNaN(id)) return next("route");
                req.params.id = id;
                next();
            });

            app.get("/user/:id", (req, res) => {
                const id = req.params.id;
                expect(typeof id).toBe("number");
                res.send("" + id);
            });

            request(app).get("/user/123").expect("123", done);
        });

        it("should only call once per request", (done) => {
            const app = ws();
            let called = 0;
            let count = 0;

            app.param("user", (req, res, next, user) => {
                called++;
                (req as any).user = user;
                next();
            });

            app.get("/foo/:user", (req, res, next) => {
                count++;
                next();
            });
            app.get("/foo/:user", (req, res, next) => {
                count++;
                next();
            });
            app.use((req, res) => {
                res.end([count, called, (req as any).user].join(" "));
            });

            request(app).get("/foo/bob").expect("2 1 bob", done);
        });

        it("should call when values differ", (done) => {
            const app = ws();
            let called = 0;
            let count = 0;

            app.param("user", (req, res, next, user) => {
                called++;
                (req as any).users = ((req as any).users || []).concat(user);
                next();
            });

            app.get("/:user/bob", (req, res, next) => {
                count++;
                next();
            });
            app.get("/foo/:user", (req, res, next) => {
                count++;
                next();
            });
            app.use((req, res) => {
                res.end([count, called, (req as any).users.join(",")].join(" "));
            });

            request(app).get("/foo/bob").expect("2 2 foo,bob", done);
        });

        it("should support altering req.params across routes", (done) => {
            const app = ws();

            app.param("user", (req, res, next, user) => {
                req.params.user = "loki";
                next();
            });

            app.get("/:user", (req, res, next) => {
                next("route");
            });
            app.get("/:user", (req, res, next) => {
                res.send(req.params.user);
            });

            request(app).get("/bob").expect("loki", done);
        });

        it("should not invoke without route handler", (done) => {
            const app = ws();

            app.param("thing", (req, res, next, thing) => {
                (req as any).thing = thing;
                next();
            });

            app.param("user", (req, res, next, user) => {
                next(new Error("invalid invokation"));
            });

            app.post("/:user", (req, res, next) => {
                res.send(req.params.user);
            });

            app.get("/:thing", (req, res, next) => {
                res.send((req as any).thing);
            });

            request(app).get("/bob").expect(200, "bob", done);
        });

        it("should work with encoded values", (done) => {
            const app = ws();

            app.param("name", (req, res, next, name) => {
                req.params.name = name;
                next();
            });

            app.get("/user/:name", (req, res) => {
                const name = req.params.name;
                res.send("" + name);
            });

            request(app).get("/user/foo%25bar").expect("foo%bar", done);
        });

        it("should catch thrown error", (done) => {
            const app = ws();

            app.param("id", (req, res, next, id) => {
                throw new Error("err!");
            });

            app.get("/user/:id", (req, res) => {
                const id = req.params.id;
                res.send("" + id);
            });

            request(app).get("/user/123").expect(500, done);
        });

        it("should catch thrown secondary error", (done) => {
            const app = ws();

            app.param("id", (req, res, next, val) => {
                process.nextTick(next);
            });

            app.param("id", (req, res, next, id) => {
                throw new Error("err!");
            });

            app.get("/user/:id", (req, res) => {
                const id = req.params.id;
                res.send("" + id);
            });

            request(app).get("/user/123").expect(500, done);
        });

        it("should defer to next route", (done) => {
            const app = ws();

            app.param("id", (req, res, next, id) => {
                next("route");
            });

            app.get("/user/:id", (req, res) => {
                const id = req.params.id;
                res.send("" + id);
            });

            app.get("/:name/123", (req, res) => {
                res.send("name");
            });

            request(app).get("/user/123").expect("name", done);
        });

        it("should defer all the param routes", (done) => {
            const app = ws();

            app.param("id", (req, res, next, val) => {
                if (val === "new") return next("route");
                return next();
            });

            app.all("/user/:id", (req, res) => {
                res.send("all.id");
            });

            app.get("/user/:id", (req, res) => {
                res.send("get.id");
            });

            app.get("/user/new", (req, res) => {
                res.send("get.new");
            });

            request(app).get("/user/new").expect("get.new", done);
        });

        it("should not call when values differ on error", (done) => {
            const app = ws();
            let called = 0;
            let count = 0;

            app.param("user", (req, res, next, user) => {
                called++;
                if (user === "foo") throw new Error("err!");
                (req as any).user = user;
                next();
            });

            app.get("/:user/bob", (req, res, next) => {
                count++;
                next();
            });
            app.get("/foo/:user", (req, res, next) => {
                count++;
                next();
            });

            app.use(((err, req, res, next) => {
                res.status(500);
                res.send([count, called, err.message].join(" "));
            }) as oven.ws.ErrorHandler);

            request(app).get("/foo/bob").expect(500, "0 1 err!", done);
        });

        it('should call when values differ when using "next"', (done) => {
            const app = ws();
            let called = 0;
            let count = 0;

            app.param("user", (req, res, next, user) => {
                called++;
                if (user === "foo") return next("route");
                (req as any).user = user;
                next();
            });

            app.get("/:user/bob", (req, res, next) => {
                count++;
                next();
            });
            app.get("/foo/:user", (req, res, next) => {
                count++;
                next();
            });
            app.use((req, res) => {
                res.end([count, called, (req as any).user].join(" "));
            });

            request(app).get("/foo/bob").expect("1 2 bob", done);
        });
    });
});
