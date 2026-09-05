import { esDeOtraVisita } from './cuenta-de-otra-visita';

describe('la cuenta guardada, cuando la mesa cambia de sesión', () => {
  /** El caso que estaba roto: pagar, quedarse a un café, y ver el monto viejo. */
  it('es de otra visita si el sessionId no coincide', () => {
    expect(esDeOtraVisita('sesion-vieja', 'sesion-nueva')).toBe(true);
  });

  it('no es de otra visita si es la misma sesión', () => {
    expect(esDeOtraVisita('sesion-1', 'sesion-1')).toBe(false);
  });

  it('no es de otra visita si todavía no había ninguna cuenta guardada', () => {
    expect(esDeOtraVisita(undefined, 'sesion-1')).toBe(false);
  });
});
