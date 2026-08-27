/**
 * Cuándo se muestra "alguien de la mesa envió el pedido".
 *
 * El carrito se vacía sin que esta persona toque nada: alguien más envió
 * mientras ella elegía. Sin el aviso, los platos desaparecen de la pantalla
 * sin explicación.
 *
 * Como texto en el pie se podía quedar puesto para siempre —molestaba poco—
 * pero al pasarlo a un cartel sobre la lista eso dejaba de ser tolerable:
 * taparía los platos hasta cambiar de pantalla.
 */

/** Lo mismo que decide el carrito, extraído para poder probarlo. */
function muestraElAviso(estado: {
  visible: boolean;
  huboPlatos: boolean;
  platosAhora: number;
  envio: string;
}): boolean {
  return (
    estado.visible && estado.huboPlatos && estado.platosAhora === 0 && estado.envio === 'idle'
  );
}

const base = { visible: true, huboPlatos: true, platosAhora: 0, envio: 'idle' };

describe('el aviso de que otro envió el pedido', () => {
  it('aparece cuando el carrito se vacía sin que yo enviara', () => {
    expect(muestraElAviso(base)).toBe(true);
  });

  it('no aparece si nunca hubo platos', () => {
    // Un carrito vacío desde el principio no es una desaparición.
    expect(muestraElAviso({ ...base, huboPlatos: false })).toBe(false);
  });

  it('no aparece mientras todavía hay platos', () => {
    expect(muestraElAviso({ ...base, platosAhora: 2 })).toBe(false);
  });

  it('no aparece cuando fui yo quien envió', () => {
    // Ahí la pantalla ya dice "Pedido enviado", y dos avisos se contradicen.
    expect(muestraElAviso({ ...base, envio: 'sent' })).toBe(false);
  });

  it('se apaga solo pasado un rato', () => {
    // Un cartel flotante que no se va tapa la lista.
    expect(muestraElAviso({ ...base, visible: false })).toBe(false);
  });
});
