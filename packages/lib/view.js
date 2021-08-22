import dbg from "debug";
import path from "path";
import fs from "fs";
var debug = dbg("oven/ws:view");
/**
 * Module variables.
 * @private
 */
var dirname = path.dirname;
var basename = path.basename;
var extname = path.extname;
var join = path.join;
var resolve = path.resolve;
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
var View = /** @class */function () {
    function View(name, options) {
        var opts = options || {};
        var fileName = name;
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
            var moduleName = this.ext.substr(1);
            debug('require "%s"', moduleName);
            // default engine export
            var module_1 = require(moduleName);
            var fn = module_1.__express || module_1.__oven_ws;
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
    View.prototype.lookup = function (name) {
        var roots = [].concat(this.root);
        var path;
        debug('lookup "%s"', name);
        for (var i = 0; i < roots.length && !path; i++) {
            var root = roots[i];
            // resolve the path
            var loc = resolve(root, name);
            var dir = dirname(loc);
            var file = basename(loc);
            // resolve the file
            path = this.resolve(dir, file);
        }
        return path;
    };
    /**
     * Render with the given options.
     *
     * @param {object} options
     * @param {function} callback
     */
    View.prototype.render = function (options, callback) {
        debug('render "%s"', this.path);
        this.engine(this.path, options, callback);
    };
    /**
     * Resolve the file within the given directory.
     *
     * @param {string} dir
     * @param {string} file
     */
    View.prototype.resolve = function (dir, file) {
        var ext = this.ext;
        // <path>.<ext>
        var path = join(dir, file);
        var stat = this.tryStat(path);
        if (stat && stat.isFile()) {
            return path;
        }
        // <path>/index.<ext>
        path = join(dir, basename(file, ext), "index" + ext);
        stat = this.tryStat(path);
        if (stat && stat.isFile()) {
            return path;
        }
    };
    /**
     * Return a stat, maybe.
     *
     * @param {string} path
     * @return {fs.Stats}
     */
    View.prototype.tryStat = function (path) {
        debug('stat "%s"', path);
        try {
            return fs.statSync(path);
        } catch (e) {
            return undefined;
        }
    };
    return View;
}();
export default View;
//# sourceMappingURL=view.js.map
//# sourceMappingURL=view.js.map