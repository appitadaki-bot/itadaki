import { ConsoleMailer, type Mailer } from '@itadaki/identity/application';
import { ResendMailer } from '@itadaki/identity/infra';
import { log } from './logger';

/**
 * De dónde sale el proveedor de correo, para todo lo que manda mails.
 *
 * Usa el de verdad cuando hay uno configurado y cae al de consola si no, así
 * una instalación local sigue andando sin credenciales. En un servidor esa
 * caída se rechaza: un flujo que imprime el mail en el log parece funcionar, y
 * nadie recibe nada.
 */
let elegido: Mailer | null = null;

export function elCorreo(): Mailer {
  elegido ??= resolver();
  return elegido;
}

function resolver(): Mailer {
  const configurado = ResendMailer.fromEnvironment();
  if (configurado !== null) {
    log.info('correo configurado — los mensajes se envían');
    return configurado;
  }

  /*
   * En un servidor con base administrada, aunque NODE_ENV no esté puesta.
   *
   * El guard miraba sólo NODE_ENV, y esa variable no estaba declarada en el
   * blueprint: la API arrancaba en Render con el mailer de consola, así que
   * el link salía por el log del servidor y quien se quedaba afuera de su
   * restaurante no recibía nada. Todo parecía funcionar.
   */
  const url = process.env['DATABASE_URL'] ?? '';
  const enUnServidor =
    process.env['NODE_ENV'] === 'production' || (url.includes('://') && !url.includes('localhost'));

  if (enUnServidor) {
    throw new Error(
      'RESEND_API_KEY y MAIL_FROM son obligatorios en producción: sin ellos nadie recibe el link para recuperar su contraseña',
    );
  }

  log.warn('sin proveedor de correo — los mensajes salen por el log');
  return new ConsoleMailer();
}
