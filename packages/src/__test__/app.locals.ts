import ws from "../";

describe("app", function () {
    describe(".locals(obj)", function () {
        it("should merge locals", function () {
            const app = ws();
            expect(Object.keys(app.locals)).toEqual(expect.arrayContaining(["settings"]));
            app.locals.user = "rinha";
            app.locals.age = 2;

            expect(Object.keys(app.locals)).toEqual(expect.arrayContaining(["settings", "user", "age"]));
            expect(app.locals.user).toEqual("rinha");
            expect(app.locals.age).toEqual(2);
        });
    });

    describe(".locals.settings", function () {
        it("should expose app settings", function () {
            const app = ws();
            app.$("title", "House of Rinha");

            const obj = app.locals.settings;
            expect(obj).toHaveProperty("env", "test");
            expect(obj).toHaveProperty("title", "House of Rinha");
        });
    });
});
