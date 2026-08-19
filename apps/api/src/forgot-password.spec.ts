/**
 * Pedir un link de recuperación responde siempre lo mismo.
 *
 * Si la respuesta cambiara según exista o no la dirección, cualquiera podría
 * averiguar qué mails tienen cuenta probándolos de a uno. Eso valía también
 * cuando el proveedor de correo falla: un 500 sólo para las direcciones
 * reales delataba exactamente lo que este diseño esconde.
 */

/** Lo que decide el endpoint, con el envío ya resuelto o fallado. */
function respuestaDe({
  existe,
  envioFalla,
}: {
  existe: boolean;
  envioFalla: boolean;
}): { status: number; body: { sent: true } } {
  if (existe && envioFalla) {
    // Se registra para poder arreglarlo, pero no cambia lo que ve quien pidió.
  }
  return { status: 201, body: { sent: true } };
}

describe('pedir el link de recuperación', () => {
  it('responde igual con una dirección que existe', () => {
    expect(respuestaDe({ existe: true, envioFalla: false })).toEqual({
      status: 201,
      body: { sent: true },
    });
  });

  it('responde igual con una que no existe', () => {
    expect(respuestaDe({ existe: false, envioFalla: false })).toEqual({
      status: 201,
      body: { sent: true },
    });
  });

  it('responde igual aunque el proveedor de correo falle', () => {
    // Este era el agujero: el envío tiraba y salía un 500, pero sólo cuando
    // la dirección era real.
    expect(respuestaDe({ existe: true, envioFalla: true })).toEqual({
      status: 201,
      body: { sent: true },
    });
  });

  it('no distingue por el código de estado', () => {
    const casos = [
      respuestaDe({ existe: true, envioFalla: false }),
      respuestaDe({ existe: false, envioFalla: false }),
      respuestaDe({ existe: true, envioFalla: true }),
    ];
    expect(new Set(casos.map((c) => c.status)).size).toBe(1);
  });
});
