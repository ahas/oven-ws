/**
 * Module dependencies.
 * @private
 */
/// <reference types="node" />
import getRawBody from "raw-body";
import dbg from "debug";
import { BodyDictionary, NextHandler, Request, Response } from "src/types";
import { BodyParserOptions } from "./types";
declare type ParseBody = (body: string | Buffer) => BodyDictionary;
declare type ReadOptions = BodyParserOptions & getRawBody.Options;
/**
 * Read a request into a buffer and parse.
 *
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @param {function} parse
 * @param {function} debug
 * @param {object} options
 * @private
 */
export default function read(req: Request, res: Response, next: NextHandler, parse: ParseBody, debug: dbg.Debugger, options: ReadOptions): void;
export {};
