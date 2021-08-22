import { IParseOptions } from "qs";
import { RequestHandler } from "../types";
/**
 * @param {Object} options
 * @return {Function}
 */
export default function query(options: IParseOptions): RequestHandler;
