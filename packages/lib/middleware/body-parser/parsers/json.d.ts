import { JsonBodyParserOptions } from "../types";
import { RequestHandler } from "src/types";
/**
 * Create a middleware to parse JSON bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @public
 */
export default function json(options: JsonBodyParserOptions): RequestHandler;
