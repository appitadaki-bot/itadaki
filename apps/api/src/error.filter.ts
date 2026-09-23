import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type Response } from 'express';
import { incidentId, log } from './logger';
import { captureError } from './sentry';

/**
 * Turns anything unhandled into a plain 500.
 *
 * Nest's default renders the exception, which leaks file paths, SQL and table
 * names to whoever triggered it. The detail still reaches the server log,
 * where it is useful and not public.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      auth?: { tenantId?: string };
    }>();

    // Deliberate errors already carry a safe, chosen shape... salvo los 5xx.
    //
    // Un STORAGE_FAILURE se lanza como 502 con `detail: String(error)`, y ese
    // texto es el mensaje de Postgres: nombra tablas, columnas y constraints a
    // quien haya provocado el fallo. Los 4xx los elige el código y son seguros;
    // los 5xx son "algo se rompió del lado del servidor", así que se contestan
    // con el `kind` y un incidente, y el detalle queda en el log como el resto.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500) {
        response.status(status).json(exception.getResponse());
        return;
      }

      const incidente = incidentId();
      const cuerpo = exception.getResponse();
      const kind =
        typeof cuerpo === 'object' && cuerpo !== null && 'kind' in cuerpo
          ? (cuerpo as { kind: unknown }).kind
          : 'INTERNAL_ERROR';

      log.error('error del servidor', {
        incident: incidente,
        method: request.method,
        path: request.url?.split('?')[0],
        tenantId: request.auth?.tenantId,
        status,
        detail: JSON.stringify(cuerpo),
      });

      response.status(status).json({ kind, incident: incidente });
      return;
    }

    // Returned to the caller and logged here, so someone reading the error on
    // their phone can name the exact line that caused it.
    const incident = incidentId();

    // The path only; a query string can carry a table token.
    const path = request.url?.split('?')[0];

    log.error('unhandled error', {
      incident,
      method: request.method,
      path,
      tenantId: request.auth?.tenantId,
      detail: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    captureError(exception, { incident, method: request.method, path, tenantId: request.auth?.tenantId });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ kind: 'INTERNAL_ERROR', incident });
  }
}
