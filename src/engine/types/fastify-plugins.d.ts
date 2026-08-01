/**
 * Type stubs for @fastify/* modules
 * 
 * The NovaDL engine's standalone API server uses these Fastify plugins,
 * but TikDL doesn't need them. These stubs allow the TypeScript compiler
 * to pass without requiring the packages.
 */
declare module '@fastify/cors' {
  const plugin: (instance: unknown, opts: unknown) => void;
  export default plugin;
}
declare module '@fastify/rate-limit' {
  const plugin: (instance: unknown, opts: unknown) => void;
  export default plugin;
}
declare module '@fastify/helmet' {
  const plugin: (instance: unknown, opts: unknown) => void;
  export default plugin;
}
declare module '@fastify/swagger' {
  const plugin: (instance: unknown, opts: unknown) => void;
  export default plugin;
}
declare module '@fastify/swagger-ui' {
  const plugin: (instance: unknown, opts: unknown) => void;
  export default plugin;
}
