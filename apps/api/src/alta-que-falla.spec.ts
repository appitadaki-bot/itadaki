/**
 * Qué se le dice a alguien cuando el alta no sale.
 *
 * Un `fetch` que tira no siempre es falta de red: también tira cuando el
 * navegador bloquea la llamada por CORS. Decir "fijate la red" en ese caso
 * manda a la persona a revisar su wifi por un problema nuestro, y encima la
 * hace abandonar — quien cree que no tiene internet no vuelve a intentar.
 *
 * Es exactamente lo que pasó: la landing quedó fuera de `CORS_ORIGINS` porque
 * empezó siendo estática y después pasó a crear cuentas. El alta contestaba
 * "sin conexión" con la red perfecta.
 */

/** Lo mismo que decide la landing, extraído para poder probarlo. */
function mensajeDeFallo(estado: number | 'tiró', enLinea: boolean): string {
  if (estado === 'tiró') {
    return enLinea
      ? 'No pudimos crear la cuenta ahora. Escribinos por WhatsApp y te damos de alta nosotros.'
      : 'Sin conexión. Fijate la red y probá de nuevo.';
  }
  if (estado === 429) {
    return 'Probaste varias veces seguidas. Esperá un minuto y volvé a intentar.';
  }
  return 'No pudimos crear la cuenta. Probá de nuevo en un momento.';
}

describe('cuando el alta no sale', () => {
  it('con la red andando no culpa a la red', () => {
    // El caso de CORS: el navegador bloqueó la llamada, no el wifi.
    const mensaje = mensajeDeFallo('tiró', true);

    expect(mensaje).not.toContain('Sin conexión');
    expect(mensaje).toContain('WhatsApp');
  });

  it('sin red sí lo dice', () => {
    expect(mensajeDeFallo('tiró', false)).toContain('Sin conexión');
  });

  it('ofrece una salida que funciona igual', () => {
    // Sea CORS o sea la red, escribir por WhatsApp funciona: hay alguien del
    // otro lado que puede dar de alta a mano.
    expect(mensajeDeFallo('tiró', true)).toContain('WhatsApp');
  });

  it('el límite de intentos no invita a reintentar ya', () => {
    // "Probá de nuevo" ante un 429 invita justamente a lo que está bloqueado.
    const mensaje = mensajeDeFallo(429, true);

    expect(mensaje).toContain('Esperá');
  });

  it('otro error del servidor sí deja reintentar', () => {
    expect(mensajeDeFallo(500, true)).toContain('Probá de nuevo');
  });
});
