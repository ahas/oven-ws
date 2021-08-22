/// <reference types="node" />
import fs from "fs";
/**
 * Module dependency types.
 * @private
 */
import { ViewOptions, TemplateEngine, RenderOptions, NextHandler } from "./types";
/**
 * Initialize a new `View` with the given `name`.
 *
 * Options:
 *
 *   - `defaultEngine` the default template engine name
 *   - `engines` template engine require() cache
 *   - `root` root path for view lookup
 *
 * @param {string} name
 * @param {object} options
 * @public
 */
export default class View {
    defaultEngine: string;
    ext: string;
    name: string;
    root: string[];
    engine: TemplateEngine;
    path: string;
    constructor(name: string, options: ViewOptions);
    /**
     * Lookup view by the given `name`
     *
     * @param {string} name
     */
    lookup(name: string): string;
    /**
     * Render with the given options.
     *
     * @param {object} options
     * @param {function} callback
     */
    render(options: RenderOptions, callback: NextHandler): void;
    /**
     * Resolve the file within the given directory.
     *
     * @param {string} dir
     * @param {string} file
     */
    resolve(dir: string, file: string): string;
    /**
     * Return a stat, maybe.
     *
     * @param {string} path
     * @return {fs.Stats}
     */
    tryStat(path: string): fs.Stats;
}
