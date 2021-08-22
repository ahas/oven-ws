import ws from "../";
import fs from "fs";
import path from "path";
import { RenderCallback, RenderOptions } from "../types";

function render(path: string, options: RenderOptions, fn: RenderCallback) {
    fs.readFile(path, "utf8", (err, str) => {
        if (err) {
            return fn(err);
        }
        str = str.replace("{{user.name}}", options.user.name);
        fn(null, str);
    });
}

describe("app", () => {
    describe(".engine(ext, fn)", () => {
        it("should map a template engine", (done) => {
            const app = ws();

            app.$("views", path.join(__dirname, "fixtures"));
            app.engine(".html", render);
            app.locals.user = { name: "ahas" };

            app.render("user.html", (err, str) => {
                if (err) {
                    return done(err);
                }
                expect(str).toEqual("<p>ahas</p>");
                done();
            });
        });

        it("should throw when the callback is missing", () => {
            const app = ws();
            expect(() => app.engine(".html", null)).toThrow("callback function required");
        });

        it('should work without leading "."', (done) => {
            const app = ws();

            app.$("views", path.join(__dirname, "fixtures"));
            app.engine("html", render);
            app.locals.user = { name: "ahas" };

            app.render("user.html", (err, str) => {
                if (err) return done(err);
                expect(str).toEqual("<p>ahas</p>");
                done();
            });
        });

        it('should work "view engine" setting', (done) => {
            const app = ws();

            app.$("views", path.join(__dirname, "fixtures"));
            app.$("view engine", "html");
            app.engine("html", render);
            app.locals.user = { name: "ahas" };

            app.render("user", (err, str) => {
                if (err) return done(err);
                expect(str).toEqual("<p>ahas</p>");
                done();
            });
        });

        it('should work "view engine" with leading "."', (done) => {
            const app = ws();

            app.$("views", path.join(__dirname, "fixtures"));
            app.$("view engine", ".html");
            app.engine(".html", render);
            app.locals.user = { name: "ahas" };

            app.render("user", (err, str) => {
                if (err) return done(err);
                expect(str).toEqual("<p>ahas</p>");
                done();
            });
        });
    });
});
