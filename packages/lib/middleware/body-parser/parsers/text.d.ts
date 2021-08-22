import { TextBodyParserOptions } from "../types";
import { RequestHandler } from "src/types";
/**
 * Create a middleware to parse text bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @api public
 */
export default function text(options?: TextBodyParserOptions): RequestHandler;
