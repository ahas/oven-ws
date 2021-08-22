import assert from "assert";
import ws from "..";
import path from "path";
import tmpl from "./support/tmpl";

describe("app", () => {
    describe(".render(name, fn)", () => {
        it("should support absolute paths", (done) => {
            const app = createApp();

            app.locals.user = { name: "ahas" };

            app.render(path.join(__dirname, "fixtures", "user.tmpl"), (err, str) => {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<p>ahas</p>");
                done();
            });
        });

        it('should support absolute paths with "view engine"', (done) => {
            const app = createApp();

            app.$("view engine", "tmpl");
            app.locals.user = { name: "ahas" };

            app.render(path.join(__dirname, "fixtures", "user"), (err, str) => {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<p>ahas</p>");
                done();
            });
        });

        it("should expose app.locals", (done) => {
            const app = createApp();

            app.$("views", path.join(__dirname, "fixtures"));
            app.locals.user = { name: "ahas" };

            app.render("user.tmpl", (err, str) => {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<p>ahas</p>");
                done();
            });
        });

        it("should support index.<engine>", (done) => {
            const app = createApp();

            app.$("views", path.join(__dirname, "fixtures"));
            app.$("view engine", "tmpl");

            app.render("blog/post", (err, str) => {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<h1>blog post</h1>");
                done();
            });
        });

        it("should handle render error throws", (done) => {
            const app = ws();

            class View {
                public name: string;
                public path: string;

                constructor(name: string, options: any) {
                    this.name = name;
                    this.path = "fake";
                }

                render(options: any, fn: any) {
                    throw new Error("err!");
                }
            }

            app.$("view", View);

            app.render("something", (err, str) => {
                expect(err).toBeTruthy();
                expect(err.message).toBe("err!");
                done();
            });
        });

        describe("when the file does not exist", () => {
            it("should provide a helpful error", (done) => {
                const app = createApp();

                app.$("views", path.join(__dirname, "fixtures"));
                app.render("rawr.tmpl", (err) => {
                    assert.ok(err);
                    assert.strictEqual(err.message, 'Failed to lookup view "rawr.tmpl" in views directory "' + path.join(__dirname, "fixtures") + '"');
                    done();
                });
            });
        });

        describe("when an error occurs", () => {
            it("should invoke the callback", (done) => {
                const app = createApp();

                app.$("views", path.join(__dirname, "fixtures"));

                app.render("user.tmpl", (err) => {
                    assert.ok(err);
                    assert.strictEqual(err.name, "RenderError");
                    done();
                });
            });
        });

        describe("when an extension is given", () => {
            it("should render the template", (done) => {
                const app = createApp();

                app.$("views", path.join(__dirname, "fixtures"));

                app.render("email.tmpl", (err, str) => {
                    if (err) {
                        return done(err);
                    }
                    expect(str).toBe("<p>This is an email</p>");
                    done();
                });
            });
        });

        describe('when "view engine" is given', () => {
            it("should render the template", (done) => {
                const app = createApp();

                app.$("view engine", "tmpl");
                app.$("views", path.join(__dirname, "fixtures"));

                app.render("email", (err, str) => {
                    if (err) {
                        return done(err);
                    }
                    expect(str).toBe("<p>This is an email</p>");
                    done();
                });
            });
        });

        describe('when "views" is given', () => {
            it("should lookup the file in the path", (done) => {
                const app = createApp();

                app.$("views", path.join(__dirname, "fixtures", "default_layout"));
                app.locals.user = { name: "ahas" };

                app.render("user.tmpl", (err, str) => {
                    if (err) {
                        return done(err);
                    }
                    expect(str).toBe("<p>ahas</p>");
                    done();
                });
            });

            describe("when array of paths", () => {
                it("should lookup the file in the path", (done) => {
                    const app = createApp();
                    const views = [path.join(__dirname, "fixtures", "local_layout"), path.join(__dirname, "fixtures", "default_layout")];

                    app.$("views", views);
                    app.locals.user = { name: "ahas" };

                    app.render("user.tmpl", (err, str) => {
                        if (err) {
                            return done(err);
                        }
                        expect(str).toBe("<p>ahas</p>");
                        done();
                    });
                });

                it("should lookup in later paths until found", (done) => {
                    const app = createApp();
                    const views = [path.join(__dirname, "fixtures", "local_layout"), path.join(__dirname, "fixtures", "default_layout")];

                    app.$("views", views);
                    app.locals.name = "ahas";

                    app.render("name.tmpl", (err, str) => {
                        if (err) {
                            return done(err);
                        }
                        expect(str).toBe("<p>ahas</p>");
                        done();
                    });
                });

                it("should error if file does not exist", (done) => {
                    const app = createApp();
                    const views = [path.join(__dirname, "fixtures", "local_layout"), path.join(__dirname, "fixtures", "default_layout")];

                    app.$("views", views);
                    app.locals.name = "ahas";

                    app.render("pet.tmpl", (err, str) => {
                        assert.ok(err);
                        assert.strictEqual(err.message, 'Failed to lookup view "pet.tmpl" in views directories "' + views[0] + '" or "' + views[1] + '"');
                        done();
                    });
                });
            });
        });

        describe('when a "view" constructor is given', () => {
            it("should create an instance of it", (done) => {
                const app = ws();

                class View {
                    public name: string;
                    public path: string;

                    constructor(name: string, options: any) {
                        this.name = name;
                        this.path = "path is required by application.js as a signal of success even though it is not used there.";
                    }

                    render(options: any, fn: any) {
                        fn(null, "abstract engine");
                    }
                }

                app.$("view", View);

                app.render("something", function (err, str) {
                    if (err) {
                        return done(err);
                    }
                    expect(str).toBe("abstract engine");
                    done();
                });
            });
        });

        describe("caching", function () {
            it("should always lookup view without cache", function (done) {
                const app = ws();
                let count = 0;

                class View {
                    public name: string;
                    public path: string;

                    constructor(name: string, options: any) {
                        this.name = name;
                        this.path = "fake";
                        count++;
                    }

                    render(options: any, fn: any) {
                        fn(null, "abstract engine");
                    }
                }

                app.$("view cache", false);
                app.$("view", View);

                app.render("something", function (err, str) {
                    if (err) {
                        return done(err);
                    }
                    expect(count).toBe(1);
                    expect(str).toBe("abstract engine");

                    app.render("something", function (err, str) {
                        if (err) {
                            return done(err);
                        }
                        expect(count).toBe(2);
                        expect(str).toBe("abstract engine");
                        done();
                    });
                });
            });

            it('should cache with "view cache" setting', function (done) {
                const app = ws();
                let count = 0;

                class View {
                    public name: string;
                    public path: string;

                    constructor(name: string, options: any) {
                        this.name = name;
                        this.path = "fake";
                        count++;
                    }

                    render(options: any, fn: any) {
                        fn(null, "abstract engine");
                    }
                }

                app.$("view cache", true);
                app.$("view", View);

                app.render("something", function (err, str) {
                    if (err) {
                        return done(err);
                    }

                    expect(count).toBe(1);
                    expect(str).toBe("abstract engine");
                    app.render("something", function (err, str) {
                        if (err) {
                            return done(err);
                        }
                        expect(count).toBe(1);
                        expect(str).toBe("abstract engine");
                        done();
                    });
                });
            });
        });
    });

    describe(".render(name, options, fn)", function () {
        it("should render the template", function (done) {
            const app = createApp();

            app.$("views", path.join(__dirname, "fixtures"));

            const user = { name: "ahas" };

            app.render("user.tmpl", { user: user }, function (err, str) {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<p>ahas</p>");
                done();
            });
        });

        it("should expose app.locals", function (done) {
            const app = createApp();

            app.$("views", path.join(__dirname, "fixtures"));
            app.locals.user = { name: "ahas" };

            app.render("user.tmpl", {}, function (err, str) {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<p>ahas</p>");
                done();
            });
        });

        it("should give precedence to app.render() locals", function (done) {
            const app = createApp();

            app.$("views", path.join(__dirname, "fixtures"));
            app.locals.user = { name: "ahas" };
            const jane = { name: "jane" };

            app.render("user.tmpl", { user: jane }, function (err, str) {
                if (err) {
                    return done(err);
                }
                expect(str).toBe("<p>jane</p>");
                done();
            });
        });

        describe("caching", function () {
            it("should cache with cache option", function (done) {
                const app = ws();
                let count = 0;

                class View {
                    public name: string;
                    public path: string;

                    constructor(name: string, options: any) {
                        this.name = name;
                        this.path = "fake";
                        count++;
                    }

                    render(options: any, fn: any) {
                        fn(null, "abstract engine");
                    }
                }

                app.$("view cache", false);
                app.$("view", View);

                app.render("something", { cache: true }, function (err, str) {
                    if (err) {
                        return done(err);
                    }
                    expect(count).toBe(1);
                    expect(str).toBe("abstract engine");
                    app.render("something", { cache: true }, function (err, str) {
                        if (err) {
                            return done(err);
                        }
                        expect(count).toBe(1);
                        expect(str).toBe("abstract engine");
                        done();
                    });
                });
            });
        });
    });
});

function createApp() {
    const app = ws();
    app.engine(".tmpl", tmpl);

    return app;
}
