/**
 * One log line per event, as JSON.
 *
 * Not a logging library: the whole need is that a hosted log viewer can filter
 * by tenant and follow one request, which plain text cannot do. Always goes to
 * the console (that is what Render's own log viewer reads); when `AXIOM_TOKEN`
 * and `AXIOM_DATASET` are set it also ships the same line to Axiom, so it can
 * be searched after Render's own short retention window is gone.
 *
 * Never log a table token, a password, or an Authorization header — a log
 * viewer is read by more people than a database is.
 */

import { trimmedEnv } from './config';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  readonly [key: string]: string | number | boolean | null | undefined;
}

const axiomToken = trimmedEnv('AXIOM_TOKEN');
const axiomDataset = trimmedEnv('AXIOM_DATASET');

/** Para el log de arranque — confirma si las dos variables llegaron al proceso, sin imprimir el token. */
export const axiomEnabled = axiomToken !== undefined && axiomDataset !== undefined;

/**
 * Fire-and-forget: shipping a log can never be why a request is slow, and a
 * network hiccup here can never be why the process crashes. Un fallo se avisa
 * por `console.warn` directo, nunca por `log.warn` — eso volvería a pasar por
 * `write()` y a reintentar contra el mismo Axiom que acaba de fallar.
 */
const shipToAxiom = (line: Record<string, unknown>): void => {
  if (axiomToken === undefined || axiomDataset === undefined) return;

  fetch(`https://api.axiom.co/v1/datasets/${axiomDataset}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${axiomToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ ...line, _time: line['at'] }]),
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`axiom ingest rejected: ${response.status} ${response.statusText}`);
      }
    })
    .catch((error: unknown) => {
      console.warn(`axiom ingest failed: ${error instanceof Error ? error.message : String(error)}`);
    });
};

const write = (level: LogLevel, message: string, fields: LogFields): void => {
  const entry = {
    level,
    message,
    at: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  shipToAxiom(entry);
};

export const log = {
  info: (message: string, fields: LogFields = {}) => write('info', message, fields),
  warn: (message: string, fields: LogFields = {}) => write('warn', message, fields),
  error: (message: string, fields: LogFields = {}) => write('error', message, fields),
};

/**
 * Short id printed with a 500 and logged beside the stack trace.
 *
 * Lets someone reading the error on their phone say "dice fallo abc123" and
 * have that land on one exact line in the log.
 */
export function incidentId(): string {
  return Math.random().toString(36).slice(2, 8);
}
