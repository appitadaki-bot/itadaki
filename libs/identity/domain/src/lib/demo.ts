/**
 * El restaurante de prueba que se crea solo, para quien quiere ver la app.
 *
 * No es un modo aparte: es un restaurante más, con su id, su carta y su
 * gente. Todo lo que separa a dos restaurantes de verdad —el aislamiento de
 * la base, los permisos, el token de la mesa— lo separa también de los demás
 * sin una línea de código especial. Lo único propio es que vence.
 */

/** Cuánto dura. Lo que lleva mirarlo con calma, no un fin de semana. */
export const HORAS_DE_DEMO = 2;

/**
 * Cuántos pueden existir a la vez.
 *
 * El límite por IP frena al distraído: datos móviles rotan IP solos y una VPN
 * cuesta cero. Esto no depende de quién pide, así que es lo que de verdad
 * acota cuánto puede crecer la base — con dos horas de vida, nunca hay más de
 * este número, pidan lo que pidan.
 */
export const TOPE_DE_DEMOS = 30;

/** Lo que llevan adelante todos los ids de prueba. */
export const PREFIJO_DEMO = 'demo-';

const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789';
const LARGO_DEL_AZAR = 10;

/**
 * Un id nuevo, tipo `demo-7k2f9qx3rt`.
 *
 * Al azar y no correlativo: el id va en la dirección del panel, y con
 * `demo-1`, `demo-2` cualquiera prueba el de al lado. No entraría —las
 * credenciales son otra cosa— pero no hay motivo para regalar el mapa.
 *
 * Sin `l`, `o`, `0` ni `1`: el id se lee en pantalla y a veces se dicta.
 */
export function nuevoIdDeDemo(azar: (n: number) => Uint8Array): string {
  const bytes = azar(LARGO_DEL_AZAR);
  let sufijo = '';
  for (const byte of bytes) {
    sufijo += ALFABETO[byte % ALFABETO.length];
  }
  return `${PREFIJO_DEMO}${sufijo}`;
}

/** Si este restaurante es de prueba. */
export function esUnDemo(tenantId: string): boolean {
  return tenantId.startsWith(PREFIJO_DEMO);
}

/** Cuándo vence uno que nace ahora. */
export function venceEn(ahora: Date): Date {
  return new Date(ahora.getTime() + HORAS_DE_DEMO * 3_600_000);
}

/**
 * Si ya no se puede usar.
 *
 * Vencer y borrarse son dos cosas distintas, y ésta es la que importa: pasada
 * la hora no entra nadie, aunque las filas sigan ahí esperando al barrido.
 */
export function demoVencido(expiraEn: Date, ahora: Date): boolean {
  return expiraEn.getTime() <= ahora.getTime();
}

/** Cuántos minutos le quedan, para decírselo a quien está adentro. */
export function minutosQueQuedan(expiraEn: Date, ahora: Date): number {
  return Math.max(0, Math.round((expiraEn.getTime() - ahora.getTime()) / 60_000));
}
