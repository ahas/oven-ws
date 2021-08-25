export type Verify = ((req: oven.ws.Request, res: oven.ws.Response, body: Buffer, encoding: string) => boolean) | false;

export interface BodyParserOptions {
    type?: string;
    inflate?: boolean;
    limit?: number;
    verify?: Verify;
}

export interface JsonBodyParserOptions extends BodyParserOptions {
    reviver?: any;
    strict?: boolean;
}

export interface RawBodyParserOptions extends BodyParserOptions {
    defaultCharset?: string;
}

export interface TextBodyParserOptions extends RawBodyParserOptions {}

export interface UrlencodedBodyParserOptions extends BodyParserOptions {
    parameterLimit?: number;
}

export interface BodyParser {
    (options: BodyParserOptions): oven.ws.RequestHandler;
}
