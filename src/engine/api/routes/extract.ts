/**
 * NovaDL Engine — Extraction Routes
 * 
 * Core API endpoints for media extraction. These are the
 * primary endpoints that the TikDL SaaS frontend will call.
 */

import type { FastifyInstance } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';
import type { ApiExtractionRequest, ApiExtractionResponse, Platform, MediaFormat, ExtractionOptions, VideoQuality, AudioQuality } from '../../types/index';
import { ProviderError } from '../../providers/base';

import { getLatencyMs, setRequestStart, deleteRequestStart } from '../request-timers';

export function registerExtractRoutes(fastify: FastifyInstance, engine: NovaDLEngine): void {
  // ─── POST /api/v1/extract ────────────────────────────────────────────
  fastify.post('/api/v1/extract', {
    schema: {
      tags: ['extraction'],
      summary: 'Extract media from a URL',
      description: 'Extract video, audio, metadata, covers, thumbnails, and subtitles from any supported platform URL.',
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'The media URL to extract from' },
          platform: { type: 'string', description: 'Override platform detection' },
          extractVideo: { type: 'boolean', default: true },
          extractAudio: { type: 'boolean', default: false },
          extractCover: { type: 'boolean', default: true },
          extractThumbnail: { type: 'boolean', default: true },
          extractMetadata: { type: 'boolean', default: true },
          extractSubtitles: { type: 'boolean', default: false },
          extractAllQualities: { type: 'boolean', default: false },
          detectWatermark: { type: 'boolean', default: false },
          removeWatermark: { type: 'boolean', default: false },
          preferredProvider: { type: 'string' },
          preferredQuality: { type: 'string' },
          preferredFormat: { type: 'string' },
          noFallback: { type: 'boolean', default: false },
          noCache: { type: 'boolean', default: false },
          stream: { type: 'boolean', default: false },
          formats: { type: 'array', items: { type: 'string' } },
          qualities: { type: 'array', items: { type: 'string' } },
          languages: { type: 'array', items: { type: 'string' } },
          timeout: { type: 'number', minimum: 5000, maximum: 120000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { type: 'object' },
            meta: { type: 'object' },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'object' },
            meta: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    setRequestStart(request.id);
    const body = request.body as ApiExtractionRequest;

    try {
      const result = await engine.extract({
        url: body.url,
        platform: body.platform as Platform | undefined,
        options: {
          extractVideo: body.extractVideo ?? true,
          extractAudio: body.extractAudio ?? false,
          extractCover: body.extractCover ?? true,
          extractThumbnail: body.extractThumbnail ?? true,
          extractMetadata: body.extractMetadata ?? true,
          extractSubtitles: body.extractSubtitles ?? false,
          extractAllQualities: body.extractAllQualities ?? false,
          detectWatermark: body.detectWatermark ?? false,
          removeWatermark: body.removeWatermark ?? false,
          timeout: body.timeout,
          noFallback: body.noFallback ?? false,
          noCache: body.noCache ?? false,
          stream: body.stream ?? false,
          formats: body.formats as MediaFormat[] | undefined,
          qualities: body.qualities as (VideoQuality | AudioQuality)[] | undefined,
          languages: body.languages,
        },
        preferredProvider: body.preferredProvider,
        preferredQuality: body.preferredQuality as VideoQuality | AudioQuality | undefined,
        preferredFormat: body.preferredFormat as MediaFormat | undefined,
      });

      const latencyMs = getLatencyMs(request.id);

      const response: ApiExtractionResponse = {
        success: true,
        data: result,
        meta: {
          requestId: request.id,
          latencyMs,
          providerUsed: result.provider,
          cached: false,
          fallbackUsed: result.provider !== body.preferredProvider,
        },
      };

      // Clean up request timer after successful response
      deleteRequestStart(request.id);

      reply.send(response);
    } catch (error) {
      const latencyMs = getLatencyMs(request.id);
      const errorMessage = error instanceof Error ? error.message : String(error);

      const providerId = error instanceof ProviderError
        ? error.providerId
        : undefined;

      // Clean up request timer after error response
      deleteRequestStart(request.id);

      const response: ApiExtractionResponse = {
        success: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: errorMessage,
          provider: providerId,
          attempts: 1,
        },
        meta: {
          requestId: request.id,
          latencyMs,
          providerUsed: providerId ?? 'none',
          cached: false,
          fallbackUsed: false,
        },
      };

      reply.code(500).send(response);
    }
  });

  // ─── GET /api/v1/extract ─────────────────────────────────────────────
  fastify.get('/api/v1/extract', {
    schema: {
      tags: ['extraction'],
      summary: 'Extract media from a URL (query params)',
      querystring: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
          platform: { type: 'string' },
          extractVideo: { type: 'boolean' },
          extractAudio: { type: 'boolean' },
          extractMetadata: { type: 'boolean' },
          noCache: { type: 'boolean' },
          preferredProvider: { type: 'string' },
          preferredQuality: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    setRequestStart(request.id);
    const query = request.query as Record<string, string | undefined>;

    try {
      const result = await engine.extract({
        url: query.url ?? '',
        platform: query.platform as Platform | undefined,
        options: {
          extractVideo: query.extractVideo !== 'false',
          extractAudio: query.extractAudio === 'true',
          extractMetadata: query.extractMetadata !== 'false',
          noCache: query.noCache === 'true',
        },
        preferredProvider: query.preferredProvider,
        preferredQuality: query.preferredQuality as VideoQuality | AudioQuality | undefined,
      });

      reply.send({
        success: true,
        data: result,
        meta: {
          requestId: request.id,
          latencyMs: getLatencyMs(request.id),
          providerUsed: result.provider,
          cached: false,
          fallbackUsed: false,
        },
      });
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
        meta: {
          requestId: request.id,
          latencyMs: getLatencyMs(request.id),
          providerUsed: 'none',
          cached: false,
          fallbackUsed: false,
        },
      });
    }
  });

  // ─── POST /api/v1/extract/batch ──────────────────────────────────────
  fastify.post('/api/v1/extract/batch', {
    schema: {
      tags: ['extraction'],
      summary: 'Batch extraction for multiple URLs',
      body: {
        type: 'object',
        required: ['urls'],
        properties: {
          urls: { type: 'array', items: { type: 'string' }, maxItems: 50 },
          options: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    setRequestStart(request.id);
    const body = request.body as { urls: string[]; options?: ExtractionOptions };
    const results: ApiExtractionResponse[] = [];

    for (const url of body.urls) {
      try {
        const result = await engine.extract({ url, options: body.options });
        results.push({
          success: true,
          data: result,
          meta: {
            requestId: request.id,
            latencyMs: getLatencyMs(request.id),
            providerUsed: result.provider,
            cached: false,
            fallbackUsed: false,
          },
        });
      } catch (error) {
        results.push({
          success: false,
          error: {
            code: 'EXTRACTION_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
          meta: {
            requestId: request.id,
            latencyMs: getLatencyMs(request.id),
            providerUsed: 'none',
            cached: false,
            fallbackUsed: false,
          },
        });
      }
    }

    reply.send({ results });
  });
}
