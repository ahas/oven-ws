import ws from "../";

describe("app.listen()", function () {
    it("should wrap with an HTTP server", function (done) {
        const app = ws();

        app.delete("/rinha", function (req, res) {
            res.end("deleted rinha!");
        });

        const server = app.listen(9999, () => {
            server.close();
            done();
        });
    });
});
