import { RawBodyParserOptions } from "../types";
import { RequestHandler } from "../../../types";
/**
 * Create a middleware to parse raw bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @api public
 */
export default function raw(options?: RawBodyParserOptions): RequestHandler;
