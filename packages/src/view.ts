import dbg from "debug";
import path from "path";
import fs from "fs";

const debug = dbg("oven/ws:view");

/**
 * Module dependency types.
 * @private
 */

import { ViewOptions, TemplateEngine, RenderOptions } from "./types";

/**
 * Module variables.
 * @private
 */

const dirname = path.dirname;
const basename = path.basename;
const extname = path.extname;
const join = path.join;
const resolve = path.resolve;

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
    public defaultEngine: string;
    public ext: string;
    public name: string;
    public root: string[];
    public engine: TemplateEngine;
    public path: string;

    constructor(name: string, options: ViewOptions) {
        const opts = options || ({} as ViewOptions);
        let fileName = name;

        this.defaultEngine = opts.defaultEngine;
        this.ext = extname(name);
        this.name = name;
        this.root = opts.root;

        if (!this.ext && !this.defaultEngine) {
            throw new Error("No default engine was specified and no extension was provided.");
        }

        if (!this.ext) {
            // get extension from default engine name
            this.ext = this.defaultEngine[0] !== "." ? "." + this.defaultEngine : this.defaultEngine;

            fileName += this.ext;
        }

        if (!opts.engines[this.ext]) {
            // load engine
            const moduleName = this.ext.substr(1);
            debug('require "%s"', moduleName);

            // default engine export
            const module = require(moduleName);
            const fn = module.__express || module.__oven_ws;

            if (typeof fn !== "function") {
                throw new Error('Module "' + moduleName + '" does not provide a view engine.');
            }

            opts.engines[this.ext] = fn;
        }

        // store loaded engine
        this.engine = opts.engines[this.ext];

        // lookup path
        this.path = this.lookup(fileName);
    }

    /**
     * Lookup view by the given `name`
     *
     * @param {string} name
     */
    lookup(name: string): string {
        const roots = [].concat(this.root);
        let path;

        debug('lookup "%s"', name);

        for (let i = 0; i < roots.length && !path; i++) {
            const root = roots[i];

            // resolve the path
            const loc = resolve(root, name);
            const dir = dirname(loc);
            const file = basename(loc);

            // resolve the file
            path = this.resolve(dir, file);
        }

        return path;
    }

    /**
     * Render with the given options.
     *
     * @param {object} options
     * @param {function} callback
     */
    render(options: RenderOptions, callback: oven.ws.Next): void {
        debug('render "%s"', this.path);
        this.engine(this.path, options, callback);
    }

    /**
     * Resolve the file within the given directory.
     *
     * @param {string} dir
     * @param {string} file
     */
    resolve(dir: string, file: string): string {
        const ext = this.ext;

        // <path>.<ext>
        let path = join(dir, file);
        let stat = this.tryStat(path);

        if (stat && stat.isFile()) {
            return path;
        }

        // <path>/index.<ext>
        path = join(dir, basename(file, ext), "index" + ext);
        stat = this.tryStat(path);

        if (stat && stat.isFile()) {
            return path;
        }
    }

    /**
     * Return a stat, maybe.
     *
     * @param {string} path
     * @return {fs.Stats}
     */
    tryStat(path: string): fs.Stats {
        debug('stat "%s"', path);

        try {
            return fs.statSync(path);
        } catch (e) {
            return undefined;
        }
    }
}
