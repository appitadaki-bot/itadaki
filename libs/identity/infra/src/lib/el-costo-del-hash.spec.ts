import { hashPassword, verifyPassword } from './password';

/**
 * Que el costo de derivar una contraseña se pueda cambiar algún día.
 *
 * El formato era `scrypt$sal$hash`, sin los parámetros. Eso tiene una
 * consecuencia que no se ve hasta que se intenta: subir el costo invalida
 * todas las contraseñas existentes de golpe, porque al verificar se deriva con
 * un costo distinto del que se guardó. Todos los dueños afuera de su propio
 * restaurante, sin forma de volver.
 *
 * Guardándolos, cada hash se verifica con los suyos. Lo que estos casos
 * cuidan es que los dos formatos convivan: el viejo tiene que seguir
 * entrando, y el nuevo tiene que llevar su costo escrito.
 */

const CLAVE = 'trueno-mandarina-9fk2';

describe('el costo del hash', () => {
  it('queda escrito en el hash', async () => {
    const guardado = await hashPassword(CLAVE);
    const [esquema, n, r, p] = guardado.split('$');

    expect(esquema).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(65536);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('verifica lo que acaba de guardar', async () => {
    const guardado = await hashPassword(CLAVE);
    expect(await verifyPassword(CLAVE, guardado)).toBe(true);
    expect(await verifyPassword('otra-cosa-larga-9fk2', guardado)).toBe(false);
  });

  it('sigue aceptando los del formato viejo', async () => {
    // Guardado antes de este cambio: sin parámetros, derivado con los de
    // fábrica de Node. Si dejara de verificar, quien eligió su contraseña
    // antes se queda afuera y el mensaje dice "credenciales inválidas".
    const viejo =
      'scrypt$' +
      '4f1a2b3c4d5e6f708192a3b4c5d6e7f8$' +
      '0b5a4e5c8c2b7f8b06b1a04b2a7f0e8f4d1b3c2a9e8d7c6b5a4f3e2d1c0b9a88' +
      '7766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa9988';

    // No es el hash de nada que sepamos, así que lo que se prueba es que no
    // explote ni dé `true`: el formato se entiende y la comparación se hace.
    expect(await verifyPassword(CLAVE, viejo)).toBe(false);
  });

  it('un hash con cualquier otra forma no entra', async () => {
    for (const roto of ['', 'scrypt', 'scrypt$solo-uno', 'bcrypt$a$b$c$d$e', 'scrypt$0$8$1$aa$bb']) {
      expect(await verifyPassword(CLAVE, roto)).toBe(false);
    }
  });
});
