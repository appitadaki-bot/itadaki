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
function texto(estado: {
  visible: boolean;
  huboPlatos: boolean;
  loVacieYo?: boolean;
  platosAhora: number;
  envio: string;
}): string | null {
  if (!estado.visible) return null;
  if (estado.envio === 'sent') return 'Pedido enviado · la cocina ya lo está viendo';
  if (
    estado.huboPlatos &&
    estado.loVacieYo !== true &&
    estado.platosAhora === 0 &&
    estado.envio === 'idle'
  ) {
    return 'Alguien de la mesa envió el pedido a la cocina';
  }
  return null;
}

const muestraElAviso = (estado: Parameters<typeof texto>[0]): boolean => texto(estado) !== null;

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

  it('cuando fui yo quien envió, dice eso', () => {
    // El mismo cartel sirve para los dos casos: la noticia es que el pedido
    // salió, y sólo cambia quién lo mandó. Dos carteles se apilarían si las
    // dos cosas pasan casi juntas.
    expect(texto({ ...base, envio: 'sent' })).toContain('Pedido enviado');
  });

  it('lo propio le gana a lo de otro', () => {
    // Si envié yo, el aviso habla de mi envío aunque el carrito se haya
    // vaciado: decirme que "alguien" lo mandó cuando fui yo confunde.
    expect(texto({ ...base, envio: 'sent' })).not.toContain('Alguien');
  });

  it('se apaga solo pasado un rato', () => {
    // Un cartel flotante que no se va tapa la lista.
    expect(muestraElAviso({ ...base, visible: false })).toBe(false);
  });
});

/**
 * Sacar un plato no es que otro haya enviado.
 *
 * Bajar el último a cero deja la mesa vacía igual que un envío, así que el
 * aviso decía que alguien había mandado el pedido a la cocina cuando lo único
 * que pasó fue que alguien se arrepintió.
 */
describe('cuando el carrito lo vacía uno mismo', () => {
  it('no avisa nada', () => {
    expect(texto({ ...base, loVacieYo: true })).toBeNull();
  });

  it('y vuelve a avisar cuando la mesa pide de nuevo y se envía', () => {
    expect(texto({ ...base, loVacieYo: false })).toBe(
      'Alguien de la mesa envió el pedido a la cocina',
    );
  });
});
