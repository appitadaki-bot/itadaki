import { type Result, err, ok } from '@itadaki/shared/domain';

/**
 * Cómo entra el personal que no tiene mail de trabajo.
 *
 * Un mozo de diecinueve años que empezó ayer no tiene un mail del
 * restaurante: usaría el suyo personal, no lo verificaría nunca, y quedaría
 * dentro del sistema cuando renuncie. Y el dueño no puede darlo de alta un
 * viernes a las nueve de la noche si el chico no tiene el teléfono a mano.
 *
 * El dueño sí tiene mail y le importa: es su negocio, su factura y su
 * recuperación de contraseña. Por eso son dos caminos distintos y no uno solo
 * estirado para servir a los dos.
 */

export type UsuarioError =
  | { readonly kind: 'MUY_CORTO'; readonly recibido: string }
  | { readonly kind: 'MUY_LARGO'; readonly recibido: string }
  | { readonly kind: 'CARACTERES_INVALIDOS'; readonly recibido: string };

const LARGO_MINIMO = 2;
const LARGO_MAXIMO = 24;

/** Cuántos dígitos tiene el PIN. */
export const LARGO_DEL_PIN = 6;

/**
 * Normaliza el nombre de usuario.
 *
 * Todo en minúscula y sin acentos: se dicta en voz alta —"entrá con nico"— y
 * nadie aclara si va con tilde. Un usuario que depende de eso genera un
 * llamado al dueño la primera vez que alguien lo escribe distinto.
 */
export function nombreDeUsuario(crudo: string): Result<string, UsuarioError> {
  const limpio = crudo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Saca los acentos, dejando la letra base.
    .replace(/[̀-ͯ]/g, '')
    // Los espacios pasan a punto: "juan pablo" se dicta igual que
    // "juan.pablo", y un espacio en un campo de usuario se pierde al copiar.
    .replace(/\s+/g, '.');

  if (limpio.length < LARGO_MINIMO) {
    return err({ kind: 'MUY_CORTO', recibido: crudo });
  }
  if (limpio.length > LARGO_MAXIMO) {
    return err({ kind: 'MUY_LARGO', recibido: crudo });
  }
  if (!/^[a-z0-9.]+$/.test(limpio)) {
    return err({ kind: 'CARACTERES_INVALIDOS', recibido: crudo });
  }

  return ok(limpio);
}

/**
 * Un usuario libre a partir del nombre de la persona.
 *
 * "Nico" es mejor que "nico4"; el número aparece sólo cuando hay dos Nicos en
 * el mismo restaurante. Empezar en 2 y no en 1 es lo que hace que el segundo
 * sea "nico2" y no "nico1", que se leería como si el primero también tuviera
 * número.
 */
export function usuarioLibre(base: string, tomados: ReadonlySet<string>): string {
  const limpio = nombreDeUsuario(base);
  // Un nombre impresentable —sólo símbolos— cae a algo usable en vez de
  // dejar al dueño trabado en el formulario.
  const raiz = limpio.isOk() ? limpio.value : 'staff';

  if (!tomados.has(raiz)) return raiz;

  for (let sufijo = 2; sufijo < 1000; sufijo += 1) {
    const candidato = `${raiz}${sufijo}`;
    if (!tomados.has(candidato)) return candidato;
  }

  // Mil personas con el mismo nombre en un restaurante no va a pasar, pero
  // devolver algo siempre es mejor que un bucle infinito.
  return `${raiz}${Date.now()}`;
}

/**
 * Un PIN nuevo, de seis dígitos.
 *
 * Se tipea en un teléfono, de parado y con las manos ocupadas: seis dígitos
 * con teclado numérico es rápido, y una contraseña con mayúsculas y símbolos
 * es un problema en ese contexto.
 *
 * El riesgo es acotado a propósito. Un PIN sólo sirve dentro de ese
 * restaurante, y lo peor que puede hacer quien lo adivine es marcar platos
 * como listos: no toca precios, ni personal, ni la facturación. Eso es del
 * dueño, que entra con mail y contraseña.
 *
 * `crypto.getRandomValues` y no `Math.random()`: esto decide quién entra al
 * sistema de un restaurante, y el generador de siempre es predecible si se
 * llegan a ver algunos valores.
 */
export function nuevoPin(): string {
  const digitos = new Uint32Array(LARGO_DEL_PIN);
  crypto.getRandomValues(digitos);

  return [...digitos].map((valor) => String(valor % 10)).join('');
}

/** Si lo tipeado tiene forma de PIN. No dice si es el correcto. */
export function pareceUnPin(crudo: string): boolean {
  return new RegExp(`^\\d{${LARGO_DEL_PIN}}$`).test(crudo.trim());
}

/** Cuántos PIN fallidos seguidos traban la cuenta. */
export const INTENTOS_ANTES_DE_TRABAR = 5;

/** Cuánto queda trabada. */
export const MINUTOS_TRABADA = 15;

/**
 * Qué hacer después de un intento de PIN.
 *
 * Se traba la cuenta y no la dirección de red: quien prueba PINes a ciegas
 * cambia de IP cuando quiere, pero no cambia de usuario.
 *
 * Con seis dígitos hay un millón de combinaciones, y cinco intentos cada
 * quince minutos son unos cuatrocientos ochenta por día: adivinarlo llevaría
 * años, y mientras tanto el dueño ve el contador subir en su panel.
 */
export interface ResultadoDelIntento {
  /** Si esta cuenta queda trabada, y hasta cuándo. */
  readonly trabadoHasta: Date | null;
  /** Cuántos fallidos lleva después de este intento. */
  readonly intentos: number;
}

export function trasElIntento(
  intentosPrevios: number,
  acerto: boolean,
  ahora: Date,
): ResultadoDelIntento {
  // Acertar borra el contador: el mozo que se equivocó dos veces no arrastra
  // eso el resto del turno.
  if (acerto) {
    return { trabadoHasta: null, intentos: 0 };
  }

  const intentos = intentosPrevios + 1;
  if (intentos < INTENTOS_ANTES_DE_TRABAR) {
    return { trabadoHasta: null, intentos };
  }

  return {
    trabadoHasta: new Date(ahora.getTime() + MINUTOS_TRABADA * 60_000),
    intentos,
  };
}

/** Si la cuenta está trabada en este momento. */
export function estaTrabada(trabadoHasta: Date | null, ahora: Date): boolean {
  return trabadoHasta !== null && trabadoHasta > ahora;
}
