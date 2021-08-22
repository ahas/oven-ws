import ws from "..";
import request from "supertest";

declare global {
    namespace oven.ws {
        interface Response {
            shout(str: string): void;
        }
    }
}

describe("app", () => {
    describe(".response", () => {
        it("should extend the response prototype", (done) => {
            const app = ws();

            app.response.shout = function (str) {
                this.send(str.toUpperCase());
            };

            app.use((req, res) => {
                res.shout("hey");
            });

            request(app).get("/").expect("HEY", done);
        });

        it("should not be influenced by other app protos", (done) => {
            const app = ws(),
                app2 = ws();

            app.response.shout = function (str) {
                this.send(str.toUpperCase());
            };

            app2.response.shout = function (str) {
                this.send(str);
            };

            app.use((req, res) => {
                res.shout("hey");
            });

            request(app).get("/").expect("HEY", done);
        });
    });
});
