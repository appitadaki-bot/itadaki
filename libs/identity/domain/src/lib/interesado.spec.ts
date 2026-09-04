import { validarInteresado } from './interesado';

const base = {
  local: 'Don Pepe',
  nombre: 'Pepe',
  whatsapp: '11 5555-5555',
  email: 'pepe@donpepe.ar',
  mesas: 12,
  carta: 'papel' as const,
  cartaLink: null,
};

describe('los datos del interesado', () => {
  it('acepta a quien tiene la carta en papel', () => {
    const resultado = validarInteresado(base);
    expect(resultado.isOk()).toBe(true);
  });

  /** El mail no es obligatorio: al principio alcanza con el WhatsApp. */
  it('acepta sin mail', () => {
    const resultado = validarInteresado({ ...base, email: null });
    expect(resultado.isOk()).toBe(true);
    if (resultado.isOk()) expect(resultado.value.email).toBeNull();
  });

  it.each(['11 5555-5555', '+54 9 11 5555 5555', '1155555555'])(
    'no le pide un formato al teléfono: %s',
    (whatsapp) => {
      expect(validarInteresado({ ...base, whatsapp }).isOk()).toBe(true);
    },
  );

  it('rechaza un teléfono que no puede serlo', () => {
    const resultado = validarInteresado({ ...base, whatsapp: '123' });
    expect(resultado.isErr()).toBe(true);
    if (resultado.isErr()) expect(resultado.error.kind).toBe('WHATSAPP_CORTO');
  });

  /** Quien dice "tengo link" y no lo pega deja un dato a medias. */
  it('pide el link a quien dijo que lo tiene', () => {
    const resultado = validarInteresado({ ...base, carta: 'link', cartaLink: '   ' });
    expect(resultado.isErr()).toBe(true);
    if (resultado.isErr()) expect(resultado.error.kind).toBe('FALTA');
  });

  /** Y el que eligió otra opción no arrastra un link pegado por error. */
  it('descarta el link cuando la carta no viene por link', () => {
    const resultado = validarInteresado({
      ...base,
      carta: 'foto',
      cartaLink: 'https://algo.example/carta',
    });
    expect(resultado.isOk()).toBe(true);
    if (resultado.isOk()) expect(resultado.value.cartaLink).toBeNull();
  });

  it('exige el nombre del local', () => {
    const resultado = validarInteresado({ ...base, local: '  ' });
    expect(resultado.isErr()).toBe(true);
    if (resultado.isErr()) expect(resultado.error).toEqual({ kind: 'FALTA', campo: 'local' });
  });
});
