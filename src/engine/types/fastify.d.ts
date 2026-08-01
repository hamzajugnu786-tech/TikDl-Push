/**
 * Type stub for fastify module
 * 
 * The NovaDL engine's standalone API server uses Fastify, but TikDL
 * doesn't need it. This stub allows the TypeScript compiler to pass
 * without requiring the fastify package.
 */
declare module 'fastify' {
  export interface FastifyRequest<RouteGeneric extends Record<string, unknown> = Record<string, unknown>> {
    params: RouteGeneric['Params'] extends Record<string, string> ? RouteGeneric['Params'] : Record<string, string>;
    query: RouteGeneric['Querystring'] extends Record<string, string> ? RouteGeneric['Querystring'] : Record<string, string>;
    body: RouteGeneric['Body'] extends unknown ? RouteGeneric['Body'] : unknown;
    headers: Record<string, string>;
    id: string;
    method: string;
    url: string;
    ip: string;
    protocol: string;
    hostname: string;
    log: { info(msg: string, ...args: unknown[]): void; error(msg: string, ...args: unknown[]): void; warn(msg: string, ...args: unknown[]): void; debug(msg: string, ...args: unknown[]): void };
  }
  export interface FastifyReply {
    status(code: number): FastifyReply;
    send(data: unknown): FastifyReply;
    header(name: string, value: string): FastifyReply;
    code(code: number): FastifyReply;
    headers(name: string, value: string): FastifyReply;
    type(contentType: string): FastifyReply;
    serialize(data: unknown): unknown;
  }
  export interface FastifyError extends Error {
    statusCode: number;
  }
  export interface RouteOptions {
    method: string;
    url: string;
    schema?: unknown;
    handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;
  }
  export interface FastifyInstance {
    get<RouteGeneric extends Record<string, unknown> = Record<string, unknown>>(path: string, optsOrHandler: unknown, handler?: (req: FastifyRequest<RouteGeneric>, reply: FastifyReply) => Promise<void> | void): void;
    post<RouteGeneric extends Record<string, unknown> = Record<string, unknown>>(path: string, optsOrHandler: unknown, handler?: (req: FastifyRequest<RouteGeneric>, reply: FastifyReply) => Promise<void> | void): void;
    put<RouteGeneric extends Record<string, unknown> = Record<string, unknown>>(path: string, optsOrHandler: unknown, handler?: (req: FastifyRequest<RouteGeneric>, reply: FastifyReply) => Promise<void> | void): void;
    delete<RouteGeneric extends Record<string, unknown> = Record<string, unknown>>(path: string, optsOrHandler: unknown, handler?: (req: FastifyRequest<RouteGeneric>, reply: FastifyReply) => Promise<void> | void): void;
    route(options: RouteOptions): void;
    register(plugin: unknown, opts?: unknown): FastifyInstance;
    listen(port: number | { port: number; host: string }, host?: string): Promise<string>;
    close(): Promise<void>;
    ready(): Promise<void>;
    addHook(name: string, handler: (...args: any[]) => any): void;
    addContentTypeParser(contentType: string, opts: unknown, parser: unknown): void;
    decorate(name: string, value: unknown): void;
    decorateRequest(name: string, value: unknown): void;
    decorateReply(name: string, value: unknown): void;
    setNotFoundHandler(handler: (req: FastifyRequest, reply: FastifyReply) => void): void;
    setErrorHandler(handler: (error: FastifyError, req: FastifyRequest, reply: FastifyReply) => void): void;
    log: { info(msg: string, ...args: unknown[]): void; error(msg: string, ...args: unknown[]): void; warn(msg: string, ...args: unknown[]): void; debug(msg: string, ...args: unknown[]): void; fatal(msg: string, ...args: unknown[]): void };
  }
  export default function fastify(opts?: unknown): FastifyInstance;
}
