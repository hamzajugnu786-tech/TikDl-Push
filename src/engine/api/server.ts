/**
 * NovaDL Engine — Fastify API Server
 * 
 * Production-grade HTTP API that exposes the engine's extraction
 * capabilities. This is the interface the frontend (TikDL SaaS)
 * will communicate with.
 * 
 * The server is completely separate from the engine core — it's
 * a thin HTTP wrapper that delegates all logic to NovaDLEngine.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { NovaDLEngine } from '../core/engine';
import type { NovaDLConfig } from '../types/index';

import { registerExtractRoutes } from './routes/extract';
import { registerHealthRoutes } from './routes/health';
import { registerProviderRoutes } from './routes/providers';
import { registerMetricsRoutes } from './routes/metrics';
import { registerConfigRoutes } from './routes/config';

import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/logging';
import { requestValidator } from './middleware/validation';
import { startTimerCleanup, stopTimerCleanup } from './request-timers';

export interface NovaDLServerOptions {
  config?: Partial<NovaDLConfig>;
  engine?: NovaDLEngine;
}

export async function createServer(options: NovaDLServerOptions = {}): Promise<{
  fastify: ReturnType<typeof Fastify>;
  engine: NovaDLEngine;
}> {
  // Initialize engine
  const engine = options.engine ?? new NovaDLEngine(options.config);
  await engine.initialize();

  const config = engine.getConfig();

  // Create Fastify server
  const fastify = Fastify({
    logger: false, // We use our own NovaLogger
    requestIdHeader: 'x-request-id',
    genReqId: () => `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  });

  // ─── Register Plugins ────────────────────────────────────────────────
  await fastify.register(helmet, { contentSecurityPolicy: false });

  await fastify.register(cors, {
    origin: config.server?.cors?.enabled ? config.server?.cors?.origins ?? true : false,
  });

  await fastify.register(rateLimit, {
    max: config.security?.rateLimit?.max ?? 100,
    timeWindow: config.security?.rateLimit?.windowMs ?? 60000,
  });

  // Swagger/OpenAPI documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'NovaDL Engine API',
        description: 'Production-grade media extraction engine API. Extract video, audio, metadata, and more from 18+ platforms.',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Local development' },
      ],
      tags: [
        { name: 'extraction', description: 'Media extraction endpoints' },
        { name: 'health', description: 'Health check and diagnostics' },
        { name: 'providers', description: 'Provider management' },
        { name: 'metrics', description: 'Performance metrics' },
        { name: 'config', description: 'Configuration management' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ─── Register Middleware ──────────────────────────────────────────────
  fastify.addHook('onRequest', requestLogger(engine));
  fastify.addHook('preValidation', requestValidator(engine));

  // Start periodic cleanup of request timers to prevent memory leaks
  startTimerCleanup();

  // ─── Register Routes ──────────────────────────────────────────────────
  registerExtractRoutes(fastify, engine);
  registerHealthRoutes(fastify, engine);
  registerProviderRoutes(fastify, engine);
  registerMetricsRoutes(fastify, engine);
  registerConfigRoutes(fastify, engine);

  // ─── Error Handler ────────────────────────────────────────────────────
  fastify.setErrorHandler(errorHandler(engine));

  return { fastify, engine };
}

/**
 * Start the NovaDL Engine HTTP server.
 * 
 * This is the entry point for standalone server mode.
 * Call from a CLI entry file or tsx/node directly.
 */
export async function startServer(options: NovaDLServerOptions = {}): Promise<void> {
  const { fastify, engine } = await createServer(options);

  const config = engine.getConfig();
  const port = config.server.port;
  const host = config.server.host;

  try {
    await fastify.listen({ port, host });
    console.log(`NovaDL Engine server running on http://${host}:${port}`);
    console.log(`API docs available at http://${host}:${port}/docs`);
  } catch (error) {
    console.error('Failed to start server:', error);
    await engine.shutdown();
    process.exit(1);
  }

  // Graceful shutdown handlers
  const shutdown = async () => {
    console.log('Shutting down...');
    stopTimerCleanup();
    await fastify.close();
    await engine.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
