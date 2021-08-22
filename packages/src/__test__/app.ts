import assert from "assert";
import ws from "../";
import request from "supertest";

describe("app", () => {
    it("should inherit from event emitter", (done) => {
        const app = ws();
        app.on("foo", done);
        app.emit("foo");
    });

    it("should be callable", () => {
        const app = ws();
        assert.strictEqual(typeof app, "function");
    });

    it("should 404 without routes", (done) => {
        request(ws()).get("/").expect(404, done);
    });
});

describe("app.parent", function () {
    it("should return the parent when mounted", function () {
        const app = ws(),
            blog = ws(),
            blogAdmin = ws();

        app.use("/blog", blog);
        blog.use("/admin", blogAdmin);

        assert(!app.parent, "app.parent");
        expect(blog.parent).toEqual(app);
        expect(blogAdmin.parent).toEqual(blog);
    });
});

describe("app.mountPath", function () {
    it("should return the mounted path", function () {
        const admin = ws();
        const app = ws();
        const blog = ws();
        const fallback = ws();

        app.use("/blog", blog);
        app.use(fallback);
        blog.use("/admin", admin);

        expect(admin.mountPath).toEqual("/admin");
        expect(app.mountPath).toEqual("/");
        expect(blog.mountPath).toEqual("/blog");
        expect(fallback.mountPath).toEqual("/");
    });
});

describe("app.path()", function () {
    it("should return the canonical", function () {
        const app = ws(),
            blog = ws(),
            blogAdmin = ws();

        app.use("/blog", blog);
        blog.use("/admin", blogAdmin);

        expect(app.path()).toEqual("");
        expect(blog.path()).toEqual("/blog");
        expect(blogAdmin.path()).toEqual("/blog/admin");
    });
});

describe("in development", function () {
    it('should disable "view cache"', function () {
        process.env.NODE_ENV = "development";
        const app = ws();
        expect(app.enabled("view cache")).toBeFalsy();
        process.env.NODE_ENV = "test";
    });
});

describe("in production", function () {
    it('should enable "view cache"', function () {
        process.env.NODE_ENV = "production";
        const app = ws();
        expect(app.enabled("view cache")).toBeTruthy();
        process.env.NODE_ENV = "test";
    });
});

describe("without NODE_ENV", function () {
    it("should default to development", function () {
        process.env.NODE_ENV = "";
        const app = ws();
        expect(app.$("env")).toEqual("development");
        process.env.NODE_ENV = "test";
    });
});
