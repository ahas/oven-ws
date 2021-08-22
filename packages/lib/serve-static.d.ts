import { mime } from "./send";
import { ServeStaticOptions, RequestHandler } from "./types";
export { mime };
/**
 * @param {string} root
 * @param {object} [options]
 * @public
 */
export default function serveStatic(root: string, options: ServeStaticOptions): RequestHandler;
