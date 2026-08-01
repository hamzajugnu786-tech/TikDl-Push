/**
 * NovaDL Engine — Health Check Routes
 */

import type { FastifyInstance } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';

export function registerHealthRoutes(fastify: FastifyInstance, engine: NovaDLEngine): void {
  // ─── GET /api/v1/health ──────────────────────────────────────────────
  fastify.get('/api/v1/health', {
    schema: {
      tags: ['health'],
      summary: 'Engine health status',
      description: 'Returns the overall engine health, provider statuses, and system metrics.',
    },
  }, async (_request, reply) => {
    const health = engine.getHealth();
    const metrics = engine.getMetrics();

    reply.send({
      status: health.status,
      uptime: health.uptimeMs,
      version: '1.0.0',
      providers: health.providers,
      system: {
        memory: metrics.system.memoryUsageMb,
        cpu: 0,
        activeExtractions: health.activeExtractions,
        queueSize: metrics.system.queueSize,
      },
    });
  });

  // ─── GET /api/v1/health/live ─────────────────────────────────────────
  fastify.get('/api/v1/health/live', {
    schema: {
      tags: ['health'],
      summary: 'Liveness probe',
      description: 'Simple check that the server process is alive. Returns 200 if running.',
    },
  }, async (_request, reply) => {
    reply.send({ alive: true, timestamp: new Date().toISOString() });
  });

  // ─── GET /api/v1/health/ready ────────────────────────────────────────
  fastify.get('/api/v1/health/ready', {
    schema: {
      tags: ['health'],
      summary: 'Readiness probe',
      description: 'Check if the engine is ready to accept extraction requests.',
    },
  }, async (_request, reply) => {
    const health = engine.getHealth();
    if (health.status === 'unhealthy') {
      reply.status(503).send({
        ready: false,
        reason: 'No healthy providers available',
        status: health.status,
      });
    } else {
      reply.send({
        ready: true,
        status: health.status,
        activeExtractions: health.activeExtractions,
      });
    }
  });
}
