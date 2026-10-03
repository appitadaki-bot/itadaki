import { createHash } from 'node:crypto';

/**
 * Si esta contraseña ya apareció en alguna filtración conocida.
 *
 * Es lo que de verdad tumba una cuenta. Ninguna regla de largo ni de símbolos
 * frena a alguien que reusa en Itadaki la misma contraseña que tenía en un
 * foro que se filtró en 2019: eso se prueba primero y entra a la primera.
 *
 * La contraseña nunca sale de este servidor. Se manda a Have I Been Pwned los
 * cinco primeros caracteres del SHA-1 y vuelven todos los sufijos que empiezan
 * así —cientos—; la comparación se hace acá. Del otro lado saben que alguien
 * preguntó por un prefijo que comparten miles de contraseñas distintas, y nada
 * más. Es gratis y no lleva credenciales.
 *
 * El SHA-1 es el formato que pide esa lista y no se usa para guardar nada: lo
 * que se almacena sigue siendo scrypt.
 */
const RANGO = 'https://api.pwnedpasswords.com/range';

/** Cuánto se espera antes de seguir sin saber. */
const PACIENCIA_MS = 3_000;

export interface Filtradas {
  esta(password: string): Promise<boolean>;
}

export class FiltradasDeHibp implements Filtradas {
  /**
   * Devuelve `false` cuando no se pudo averiguar.
   *
   * Se deja pasar en vez de trabar: si el servicio está caído o la red del
   * servidor falla, lo contrario sería no dejar a nadie elegir su contraseña
   * —ni al dueño que acaba de recibir el mail de bienvenida— por algo que no
   * tiene nada que ver con él. Es una verificación de más, no la única.
   */
  async esta(password: string): Promise<boolean> {
    const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefijo = hash.slice(0, 5);
    const sufijo = hash.slice(5);

    try {
      const respuesta = await fetch(`${RANGO}/${prefijo}`, {
        // Rellena la respuesta con sufijos falsos para que el tamaño no diga
        // cuántas coincidencias hubo. Las falsas vienen con cuenta 0.
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(PACIENCIA_MS),
      });
      if (!respuesta.ok) return false;

      const cuerpo = await respuesta.text();
      return cuerpo.split('\n').some((linea) => {
        const [suf, veces] = linea.trim().split(':');
        return suf === sufijo && Number(veces ?? '0') > 0;
      });
    } catch {
      // Sin red, sin respuesta o tardó demasiado: se sigue sin saber.
      return false;
    }
  }
}

/** Para los tests y para correr sin salir a internet. */
export class FiltradasQueNoSabe implements Filtradas {
  async esta(): Promise<boolean> {
    return false;
  }
}
