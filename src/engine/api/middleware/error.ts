/**
 * NovaDL Engine — Error Handler Middleware
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import type { NovaDLEngine } from '../../core/engine';
import { deleteRequestStart } from '../request-timers';

export function errorHandler(engine: NovaDLEngine) {
  return (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = (error as FastifyError).statusCode ?? 500;
    const config = engine.getConfig();

    // Clean up request timer to prevent memory leak
    deleteRequestStart(request.id);

    // Structured error response
    const response = {
      statusCode,
      error: statusCode >= 500 ? 'Internal Server Error' : 'Client Error',
      message: statusCode >= 500 && !config.server.debug
        ? 'An unexpected error occurred'
        : error.message,
      requestId: request.id,
      details: statusCode >= 500 && config.server.debug
        ? { stack: error.stack, name: error.name }
        : undefined,
    };

    reply.status(statusCode).send(response);
  };
}
