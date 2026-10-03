import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * `scrypt` con promesa.
 *
 * A mano y no con `promisify`: la firma con opciones es una sobrecarga que
 * `promisify` no conserva, y sin opciones no se puede ni elegir el costo ni
 * subir `maxmem`.
 */
function derivar(
  password: string,
  salt: Buffer,
  largo: number,
  opciones: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(password, salt, largo, opciones, (error, derivado) => {
      if (error !== null) rechazar(error);
      else resolver(derivado);
    });
  });
}

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Cuánto cuesta derivar una contraseña.
 *
 * scrypt de la propia librería de Node: lento y pesado en memoria a propósito,
 * para que una tabla filtrada no se pueda recorrer a velocidad. Elegido sobre
 * bcrypt porque no necesita una dependencia nativa.
 *
 * `N` a 65536 y no más arriba por dónde corre esto. La memoria que usa es
 * `128 * N * r`, o sea 64 MB por derivación, y el servidor es una instancia de
 * 512 MB con 0.1 de CPU: a 131072 serían 128 MB cada una, y dos logins a la
 * vez se comerían la mitad de la máquina. Medido acá: 112 ms a 65536 contra
 * 228 ms a 131072, que en 0.1 de CPU se vuelven segundos.
 *
 * Es cuatro veces lo que costaba antes. Se sube cuando el servidor deje de ser
 * el plan gratis, y eso ahora **se puede hacer** — ver abajo.
 */
const COSTO = { N: 65536, r: 8, p: 1 } as const;

/** Node corta en 32 MB si no se le dice otra cosa, y 65536 pide el doble. */
const maxmemPara = (N: number, r: number): number => 128 * N * r * 2;

/**
 * El formato en el que se guarda: `scrypt$N$r$p$sal$hash`.
 *
 * Con los parámetros adentro, y no sueltos en el código.
 *
 * Antes era `scrypt$sal$hash`, sin el costo, y eso tenía una consecuencia que
 * no se ve hasta que se intenta: subirlo invalidaba **todas** las contraseñas
 * existentes a la vez, porque al verificar se derivaba con un costo distinto
 * del que se había guardado. Todos los dueños afuera de su restaurante, sin
 * forma de volver. En los hechos el costo quedaba congelado para siempre.
 *
 * Guardándolos, cada hash se verifica con los suyos y el costo de los nuevos
 * se cambia cuando haga falta.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = COSTO;
  const derived = await derivar(password, salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: maxmemPara(N, r),
  });

  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Los parámetros con los que se guardó este hash, sea del formato que sea. */
function comoSeGuardo(
  stored: string,
): { N: number; r: number; p: number; salt: string; hash: string } | null {
  const partes = stored.split('$');
  if (partes[0] !== 'scrypt') return null;

  // El viejo, sin parámetros: se derivó con los de fábrica de Node. Se sigue
  // leyendo para no dejar afuera a nadie que haya elegido su contraseña antes
  // de este cambio; los nuevos se guardan siempre con el formato largo.
  if (partes.length === 3) {
    const [, salt, hash] = partes;
    if (salt === undefined || hash === undefined) return null;
    return { N: 16384, r: 8, p: 1, salt, hash };
  }

  if (partes.length === 6) {
    const [, n, r, p, salt, hash] = partes;
    if (salt === undefined || hash === undefined) return null;

    const nums = [Number(n), Number(r), Number(p)];
    if (nums.some((valor) => !Number.isInteger(valor) || valor <= 0)) return null;

    return { N: nums[0] ?? 0, r: nums[1] ?? 0, p: nums[2] ?? 0, salt, hash };
  }

  return null;
}

/**
 * Compara en tiempo constante. Un `===` pelado filtra por el tiempo cuánto del
 * hash coincidió, que alcanza para reconstruirlo byte a byte.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const guardado = comoSeGuardo(stored);
  if (guardado === null) return false;

  try {
    const salt = Buffer.from(guardado.salt, 'hex');
    const expected = Buffer.from(guardado.hash, 'hex');
    const derived = await derivar(password, salt, expected.length, {
      N: guardado.N,
      r: guardado.r,
      p: guardado.p,
      maxmem: maxmemPara(guardado.N, guardado.r),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
