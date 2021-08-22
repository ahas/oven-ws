import { BodyParserOptions, JsonBodyParserOptions } from "./types";

function requireParser(type: string, options: BodyParserOptions): oven.ws.RequestHandler {
    return require("./parsers" + type)(options) as oven.ws.RequestHandler;
}

export default {
    text: (options: JsonBodyParserOptions) => requireParser("json", options),
    raw: (options: JsonBodyParserOptions) => requireParser("json", options),
    json: (options: JsonBodyParserOptions) => requireParser("json", options),
    urlencoded: (options: JsonBodyParserOptions) => requireParser("json", options),
};
