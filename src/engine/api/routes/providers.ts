/**
 * NovaDL Engine — Provider Management Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';
import type { ProviderInfo } from '../../types/index';

export function registerProviderRoutes(fastify: FastifyInstance, engine: NovaDLEngine): void {
  // ─── GET /api/v1/providers ───────────────────────────────────────────
  fastify.get('/api/v1/providers', {
    schema: {
      tags: ['providers'],
      summary: 'List all providers',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const providers = engine.getProviders();
    reply.send({ providers });
  });

  // ─── GET /api/v1/providers/:id ───────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/api/v1/providers/:id', {
    schema: {
      tags: ['providers'],
      summary: 'Get provider details',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const providers = engine.getProviders();
    const provider = providers.find((p: ProviderInfo) => p.id === id);

    if (!provider) {
      reply.status(404).send({ error: `Provider '${id}' not found` });
      return;
    }

    reply.send({ provider });
  });

  // ─── POST /api/v1/providers/:id/enable ───────────────────────────────
  fastify.post<{ Params: { id: string } }>('/api/v1/providers/:id/enable', {
    schema: {
      tags: ['providers'],
      summary: 'Enable a provider',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const success = engine.enableProvider(id);
    if (!success) {
      reply.status(404).send({ error: `Provider '${id}' not found` });
      return;
    }
    reply.send({ success: true, providerId: id, enabled: true });
  });

  // ─── POST /api/v1/providers/:id/disable ──────────────────────────────
  fastify.post<{ Params: { id: string } }>('/api/v1/providers/:id/disable', {
    schema: {
      tags: ['providers'],
      summary: 'Disable a provider',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const success = engine.disableProvider(id);
    if (!success) {
      reply.status(404).send({ error: `Provider '${id}' not found` });
      return;
    }
    reply.send({ success: true, providerId: id, enabled: false });
  });

  // ─── PUT /api/v1/providers/:id/priority ──────────────────────────────
  fastify.put<{ Params: { id: string }; Body: { priority: number } }>('/api/v1/providers/:id/priority', {
    schema: {
      tags: ['providers'],
      summary: 'Set provider priority',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['priority'], properties: { priority: { type: 'number', minimum: 0 } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { priority: number } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { priority } = request.body;
    const success = engine.setProviderPriority(id, priority);
    if (!success) {
      reply.status(404).send({ error: `Provider '${id}' not found` });
      return;
    }
    reply.send({ success: true, providerId: id, priority });
  });

  // ─── POST /api/v1/providers/:id/health-check ─────────────────────────
  fastify.post<{ Params: { id: string } }>('/api/v1/providers/:id/health-check', {
    schema: {
      tags: ['providers'],
      summary: 'Force a health check on a provider',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const providers = engine.getProviders();
    const provider = providers.find((p: ProviderInfo) => p.id === id);

    if (!provider) {
      reply.status(404).send({ error: `Provider '${id}' not found` });
      return;
    }

    reply.send({ providerId: id, health: provider.health });
  });
}
