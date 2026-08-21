import { Injectable } from '@nestjs/common';
import { ConsoleMailer, type Mailer } from '@itadaki/identity/application';
import { PostgresResetStore, ResendMailer } from '@itadaki/identity/infra';
import { database } from './database';
import { log } from './logger';

/**
 * Composition point for password resets.
 *
 * Uses the real provider when one is configured and falls back to the console
 * otherwise, so a local install keeps working without credentials. In
 * production the fallback is refused outright: a reset flow that silently
 * prints the link to a server log looks like it works, and the person
 * locked out of their own restaurant never receives anything.
 */
@Injectable()
export class ResetsService {
  readonly store = new PostgresResetStore(database);
  readonly mailer: Mailer = resolveMailer();
}

function resolveMailer(): Mailer {
  const configured = ResendMailer.fromEnvironment();
  if (configured !== null) {
    log.info('correo configurado — los links de recuperación se envían');
    return configured;
  }

  /*
   * En un servidor con base administrada, aunque NODE_ENV no esté puesta.
   *
   * El guard miraba sólo NODE_ENV, y esa variable no estaba declarada en el
   * blueprint: la API arrancaba en Render con el mailer de consola, así que
   * el link salía por el log del servidor y quien se quedaba afuera de su
   * restaurante no recibía nada. Todo parecía funcionar.
   */
  const enUnServidor =
    process.env['NODE_ENV'] === 'production' ||
    (process.env['DATABASE_URL'] ?? '').includes('://') &&
      !(process.env['DATABASE_URL'] ?? '').includes('localhost');

  if (enUnServidor) {
    throw new Error(
      'RESEND_API_KEY y MAIL_FROM son obligatorios en producción: sin ellos nadie recibe el link para recuperar su contraseña',
    );
  }

  log.warn('sin proveedor de correo — los links de recuperación salen por el log');
  return new ConsoleMailer();
}
