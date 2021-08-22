import { RequestHandler } from "src/types";
import { UrlencodedBodyParserOptions } from "../types";
/**
 * Create a middleware to parse urlencoded bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @public
 */
export default function urlencoded(options?: UrlencodedBodyParserOptions): RequestHandler;
