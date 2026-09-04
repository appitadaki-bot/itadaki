import { claveDeEnvio } from './clave-de-envio';

describe('la clave de un envío', () => {
  /** El caso que duplicaba: dos personas tocan enviar a la vez. */
  it('es la misma para el mismo carrito, sin importar quién lo mande', () => {
    const desdeUnTelefono = claveDeEnvio('mesa-1', ['l1', 'l2', 'l3']);
    const desdeElOtro = claveDeEnvio('mesa-1', ['l1', 'l2', 'l3']);

    expect(desdeUnTelefono).toBe(desdeElOtro);
  });

  /** Cada teléfono ve el carrito en su propio orden. */
  it('no depende del orden en que vengan las líneas', () => {
    expect(claveDeEnvio('mesa-1', ['l3', 'l1', 'l2'])).toBe(
      claveDeEnvio('mesa-1', ['l1', 'l2', 'l3']),
    );
  });

  /** Una segunda ronda son líneas nuevas: tiene que poder entrar. */
  it('cambia cuando cambian las líneas', () => {
    expect(claveDeEnvio('mesa-1', ['l1', 'l2'])).not.toBe(claveDeEnvio('mesa-1', ['l1', 'l3']));
  });

  /** Dos mesas pidiendo lo mismo no son el mismo pedido. */
  it('cambia con la mesa', () => {
    expect(claveDeEnvio('mesa-1', ['l1'])).not.toBe(claveDeEnvio('mesa-2', ['l1']));
  });

  it('entra en la columna sin achicarse', () => {
    expect(claveDeEnvio('mesa-1', ['l1'])).toHaveLength(32);
  });
});
