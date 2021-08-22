import Layer from "./layer";
import { RouterHandler, RequestHandler, PathParams } from "../types";
export default class Route {
    path: PathParams;
    stack: Layer[];
    methods: Record<string, boolean>;
    /**
     * Initialize `Route` with the given `path`,
     *
     * @param {String} path
     * @public
     */
    constructor(path: PathParams);
    /**
     * Determine if the route handles a given method.
     */
    _handles_method(method: string): boolean;
    /**
     * @return {Array} supported HTTP methods
     */
    _options(): string[];
    all(...handlers: RequestHandler[]): this;
    dispatch: RequestHandler;
    get: RouterHandler<this>;
    head: RouterHandler<this>;
    post: RouterHandler<this>;
    put: RouterHandler<this>;
    delete: RouterHandler<this>;
    connect: RouterHandler<this>;
    options: RouterHandler<this>;
    trace: RouterHandler<this>;
    patch: RouterHandler<this>;
}
