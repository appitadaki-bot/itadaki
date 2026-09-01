import { digestOf, newResetToken } from './reset-token';

/**
 * Cuánto vale el link de verificación.
 *
 * Tres días y no una hora como el de recuperación: el de recuperación lo pide
 * alguien que está mirando la pantalla en ese momento, y éste llega cuando el
 * dueño se anotó y quizás abre el mail al día siguiente. Tampoco eterno — es
 * una credencial que queda en una casilla.
 */
export const VERIFY_TOKEN_HORAS = 72;

/**
 * Un token nuevo para verificar un mail, y lo que se guarda de él.
 *
 * Se apoya en el mismo par token/digest que la recuperación de contraseña:
 * son el mismo problema —una credencial que viaja por mail y que la base no
 * puede tener en claro— y tener dos implementaciones significa arreglar los
 * bugs dos veces.
 */
export function nuevoTokenDeVerificacion(): {
  token: string;
  digest: string;
  expiraEn: Date;
} {
  const { token, digest } = newResetToken();
  return {
    token,
    digest,
    expiraEn: new Date(Date.now() + VERIFY_TOKEN_HORAS * 3_600_000),
  };
}

/** El hash con el que buscar la fila, sin exponer el token. */
export function digestDeVerificacion(token: string): string {
  return digestOf(token);
}

/**
 * El texto del mail.
 *
 * Dice qué es, qué hacer y qué pasa si no fue él: alguien puede recibir esto
 * porque otro se equivocó de mail al anotarse, y esa persona tiene que
 * entender en dos líneas que no tiene que hacer nada.
 */
export function mailDeVerificacion(
  restaurante: string,
  link: string,
): { subject: string; body: string } {
  return {
    subject: `Confirmá tu mail para activar ${restaurante}`,
    body: [
      `Hola,`,
      ``,
      `Creaste la cuenta de ${restaurante} en Itadaki. Confirmá que este mail es tuyo:`,
      ``,
      link,
      ``,
      `El link vale ${VERIFY_TOKEN_HORAS} horas.`,
      ``,
      `Si no fuiste vos, ignorá este mensaje: sin confirmar, la cuenta no se activa`,
      `y el mail queda libre.`,
      ``,
      `— Itadaki`,
    ].join('\n'),
  };
}

/**
 * El aviso a quien ya tiene cuenta y alguien intentó anotarse con su mail.
 *
 * El alta no puede contestar "ese mail ya existe": con eso, quien quiera puede
 * recorrer una lista de direcciones y armar el padrón de qué restaurantes usan
 * Itadaki y con qué mail — que es exactamente lo que hace falta para un
 * phishing dirigido creíble.
 *
 * Pero tampoco puede callarse del todo. Si alguien está probando el mail de un
 * dueño, ese dueño tiene derecho a enterarse: puede ser un error honesto —dos
 * socios que se anotan por separado— o alguien tanteando.
 *
 * Así que la respuesta al que intenta es siempre la misma, y lo que cambia es
 * el mail que llega. Quien tiene cuenta recibe esto en vez del de bienvenida.
 *
 * No lleva ningún link de acción. Un mail que llega sin que uno lo haya pedido
 * y trae un botón es la forma de todo phishing, y acá no hay nada que hacer:
 * la cuenta sigue como estaba.
 */
export function mailDeIntentoDeAlta(link: string): { subject: string; body: string } {
  return {
    subject: 'Alguien intentó crear una cuenta con tu mail en Itadaki',
    body: [
      `Hola,`,
      ``,
      `Alguien quiso crear una cuenta en Itadaki con este mail, que ya tiene una.`,
      `No hicimos nada: tu cuenta y tu contraseña siguen igual.`,
      ``,
      `Si fuiste vos y no te acordás de la contraseña, podés recuperarla desde`,
      `la pantalla de entrada:`,
      ``,
      link,
      ``,
      `Si no fuiste vos, no hace falta que hagas nada. Te avisamos por si no`,
      `esperabas este intento.`,
      ``,
      `— Itadaki`,
    ].join('\n'),
  };
}
