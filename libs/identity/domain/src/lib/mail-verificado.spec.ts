import { PERMISSIONS } from './role';
import { necesitaMailConfirmado, puedeSinConfirmar } from './mail-verificado';

/**
 * Lo que se corta sin confirmar el mail, y lo que no.
 *
 * El caso que importa es el segundo: una mesa tiene que poder pedir y la
 * cocina recibir aunque el dueño no haya hecho clic en su correo.
 */
describe('qué exige tener el mail confirmado', () => {
  it('editar la carta y tocar el personal, sí', () => {
    expect(necesitaMailConfirmado('menu:write')).toBe(true);
    expect(necesitaMailConfirmado('staff:manage')).toBe(true);
  });

  /**
   * Nada de lo que hace funcionar el servicio.
   *
   * Un restaurante quemado a mitad de un sábado por un mail que no llegó no
   * se convierte en cliente, y el problema además sería nuestro.
   */
  it('recibir y avanzar pedidos, no', () => {
    expect(necesitaMailConfirmado('orders:read')).toBe(false);
    expect(necesitaMailConfirmado('orders:advance')).toBe(false);
  });

  it('cobrar una cuenta, tampoco', () => {
    expect(necesitaMailConfirmado('bills:read')).toBe(false);
    expect(necesitaMailConfirmado('bills:close')).toBe(false);
  });

  it('ni leer la carta', () => {
    expect(necesitaMailConfirmado('menu:read')).toBe(false);
  });

  /** Con el mail confirmado no se bloquea nada, sea el permiso que sea. */
  it('confirmado, pasa todo', () => {
    for (const permiso of PERMISSIONS) {
      expect(puedeSinConfirmar(permiso, true)).toBe(true);
    }
  });

  it('sin confirmar, pasa todo menos la configuración', () => {
    for (const permiso of PERMISSIONS) {
      const esperado = permiso !== 'menu:write' && permiso !== 'staff:manage';
      expect(puedeSinConfirmar(permiso, false)).toBe(esperado);
    }
  });

  /** Una ruta sin permiso declarado no es configuración: no se toca. */
  it('una ruta sin permiso no se bloquea', () => {
    expect(puedeSinConfirmar(undefined, false)).toBe(true);
  });
});
