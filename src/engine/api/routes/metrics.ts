/**
 * NovaDL Engine — Metrics Routes
 */

import type { FastifyInstance } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';

export function registerMetricsRoutes(fastify: FastifyInstance, engine: NovaDLEngine): void {
  fastify.get('/api/v1/metrics', {
    schema: {
      tags: ['metrics'],
      summary: 'Get engine performance metrics',
      description: 'Returns extraction statistics, provider performance data, and system resource usage.',
    },
  }, async (_request, reply) => {
    const metrics = engine.getMetrics();
    reply.send({ metrics });
  });

  fastify.post('/api/v1/metrics/reset', {
    schema: {
      tags: ['metrics'],
      summary: 'Reset all metrics counters',
    },
  }, async (_request, reply) => {
    engine.resetMetrics();
    reply.send({ success: true, message: 'Metrics reset' });
  });
}
