import { RequestHandler } from "src/types";
import { JsonBodyParserOptions } from "./types";
declare const _default: {
    text: (options: JsonBodyParserOptions) => RequestHandler;
    raw: (options: JsonBodyParserOptions) => RequestHandler;
    json: (options: JsonBodyParserOptions) => RequestHandler;
    urlencoded: (options: JsonBodyParserOptions) => RequestHandler;
};
export default _default;
