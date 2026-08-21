import * as Sentry from '@sentry/node';
import { trimmedEnv } from './config';

const dsn = trimmedEnv('SENTRY_DSN');

/** Para el log de arranque — confirma si la variable llegó al proceso, sin imprimir el DSN. */
export const sentryEnabled = dsn !== undefined;

/**
 * Opcional a propósito: sin `SENTRY_DSN` la API tiene que arrancar y andar
 * exactamente igual que hoy — no es un secreto de seguridad como
 * `AUTH_SECRET`, así que no vale la pena bloquear el arranque por él.
 */
if (dsn !== undefined) {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    // Sólo errores: el tracing de performance es una decisión aparte, que
    // agrega ruido y no la pidieron.
    tracesSampleRate: 0,
  });
}

/**
 * Reporta un error no controlado a Sentry, con el mismo `incidentId` que ya
 * queda en el log — así "dice fallo abc123" también encuentra el issue.
 *
 * No hace nada si no hay DSN configurado.
 */
export function captureError(exception: unknown, tags: Record<string, string | undefined>): void {
  if (dsn === undefined) return;

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      if (value !== undefined) scope.setTag(key, value);
    }
    Sentry.captureException(exception);
  });
}
