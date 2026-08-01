/**
 * NovaDL Engine — Config Routes
 */

import type { FastifyInstance } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';

export function registerConfigRoutes(fastify: FastifyInstance, engine: NovaDLEngine): void {
  fastify.get('/api/v1/config', {
    schema: {
      tags: ['config'],
      summary: 'Get current engine configuration',
      description: 'Returns the current configuration (secrets are masked).',
    },
  }, async (_request, reply) => {
    const safeConfig = engine.getSafeConfig();
    reply.send({ config: safeConfig });
  });
}
