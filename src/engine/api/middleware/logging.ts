/**
 * NovaDL Engine — Request Logger Middleware
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';

import { setRequestStart } from '../request-timers';

export function requestLogger(engine: NovaDLEngine) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    setRequestStart(request.id);

    const logger = engine.getLogger();
    if (logger) {
      logger.info('Incoming request', {
        method: request.method,
        url: request.url,
        requestId: request.id,
        ip: request.ip,
      });
    }
  };
}
