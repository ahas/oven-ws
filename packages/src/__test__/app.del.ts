import ws from "..";
import request from "supertest";

describe("app.del()", () => {
    it("should alias app.delete()", (done) => {
        const app = ws();

        app.delete("/ahas", (req, res) => {
            res.end("deleted ahas!");
        });

        request(app).del("/ahas").expect("deleted ahas!", done);
    });
});
