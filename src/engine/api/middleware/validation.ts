/**
 * NovaDL Engine — Request Validation Middleware
 *
 * Validates extraction request URLs, checks SSRF protections,
 * verifies signed requests when enabled, and detects abuse patterns.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';

import { resolveAndValidateUrl } from '../../security/ssrf';
import { AbuseDetector } from '../../security/abuse';
import { RequestSigner } from '../../security/signing';

// Singleton abuse detector — initialized lazily from engine config
let abuseDetector: AbuseDetector | undefined;

function getAbuseDetector(engine: NovaDLEngine): AbuseDetector {
  if (!abuseDetector) {
    const config = engine.getConfig();
    abuseDetector = new AbuseDetector(config.security);
  }
  return abuseDetector;
}

export function requestValidator(engine: NovaDLEngine) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const config = engine.getConfig();

    // ── Verify signed requests (when enabled) ───────────────────────
    if (config.security?.requestSigning?.enabled) {
      const signatureHeader = request.headers['x-novadl-signature'] as string | undefined;
      const timestampHeader = request.headers['x-novadl-timestamp'] as string | undefined;

      if (signatureHeader && timestampHeader && config.security.requestSigning.secret) {
        const signer = new RequestSigner();

        // Build the payload from request body or query
        const payload: Record<string, unknown> = request.method === 'POST'
          ? (request.body as Record<string, unknown> ?? {})
          : (request.query as Record<string, unknown> ?? {});

        const isValid = signer.verifySignature(
          {
            payload,
            signature: signatureHeader,
            timestamp: timestampHeader,
          },
          config.security.requestSigning.secret,
        );

        if (!isValid) {
          reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid or expired request signature',
            requestId: request.id,
          });
          return;
        }
      }
    }

    // ── Validate extraction request URLs for POST ────────────────────
    if (request.url.includes('/api/v1/extract') && request.method === 'POST') {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body || !body.url || typeof body.url !== 'string') {
        reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request body must include a "url" field with a valid URL string',
          requestId: request.id,
        });
        return;
      }

      const url = body.url as string;

      // Check URL length
      const maxUrlLength = config.security?.maxUrlLength ?? 2048;
      if (url.length > maxUrlLength) {
        reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `URL exceeds maximum length of ${maxUrlLength} characters`,
          requestId: request.id,
        });
        return;
      }

      // SSRF protection — validate URL against private IPs and blocked hosts
      const ssrfResult = await resolveAndValidateUrl(url, config.security?.ssrfBlockedHosts ?? []);
      if (!ssrfResult.safe) {
        engine.getLogger().warn('SSRF blocked request', {
          url,
          reason: ssrfResult.reason,
          requestId: request.id,
        });
        reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: `URL blocked by SSRF protection: ${ssrfResult.reason}`,
          requestId: request.id,
        });
        return;
      }

      // Abuse detection — check client patterns
      if (config.security?.abuseDetection?.enabled) {
        const clientKey = request.ip;
        const detector = getAbuseDetector(engine);
        detector.recordRequest(clientKey, url);

        const abuseResult = detector.detect(clientKey);
        if (abuseResult.isAbusive) {
          engine.getLogger().warn('Abusive client detected', {
            clientKey,
            severity: abuseResult.severity,
            reason: abuseResult.reason,
            requestId: request.id,
          });

          if (abuseResult.recommendedAction === 'block' || abuseResult.recommendedAction === 'quarantine') {
            reply.status(429).send({
              statusCode: 429,
              error: 'Too Many Requests',
              message: `Request rejected: ${abuseResult.reason}`,
              requestId: request.id,
            });
            return;
          }
        }
      }
    }

    // ── Validate extraction request URLs for GET ──────────────────────
    if (request.url.includes('/api/v1/extract') && request.method === 'GET') {
      const query = request.query as Record<string, string | undefined>;
      if (!query.url) {
        reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Query parameter "url" is required',
          requestId: request.id,
        });
        return;
      }

      // SSRF protection for GET extraction requests
      const url = query.url;
      const ssrfResult = await resolveAndValidateUrl(url, config.security?.ssrfBlockedHosts ?? []);
      if (!ssrfResult.safe) {
        engine.getLogger().warn('SSRF blocked request', {
          url,
          reason: ssrfResult.reason,
          requestId: request.id,
        });
        reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: `URL blocked by SSRF protection: ${ssrfResult.reason}`,
          requestId: request.id,
        });
        return;
      }

      // Abuse detection for GET extraction requests
      if (config.security?.abuseDetection?.enabled) {
        const clientKey = request.ip;
        const detector = getAbuseDetector(engine);
        detector.recordRequest(clientKey, url);

        const abuseResult = detector.detect(clientKey);
        if (abuseResult.isAbusive && (abuseResult.recommendedAction === 'block' || abuseResult.recommendedAction === 'quarantine')) {
          reply.status(429).send({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Request rejected: ${abuseResult.reason}`,
            requestId: request.id,
          });
          return;
        }
      }
    }
  };
}
