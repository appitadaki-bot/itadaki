import {
  VERIFY_TOKEN_HORAS,
  digestDeVerificacion,
  mailDeVerificacion,
  nuevoTokenDeVerificacion,
} from './verificacion-mail';

/**
 * El token que confirma que un mail es de quien dice.
 *
 * Sin esto, cualquiera se registra con el mail de otro: se queda con el nombre
 * de un restaurante que no es suyo, y el dueño real no puede usar su propio
 * mail porque figura como tomado. Del otro lado, un tipeo deja al dueño sin
 * forma de recuperar la contraseña.
 */

describe('el token de verificación', () => {
  it('la base guarda el hash, nunca el token', () => {
    // Una base filtrada no puede alcanzar para verificar la cuenta de otro,
    // por el mismo motivo por el que las contraseñas tampoco se guardan.
    const { token, digest } = nuevoTokenDeVerificacion();

    expect(digest).not.toBe(token);
    expect(digest).not.toContain(token);
  });

  it('el hash del link es el mismo que se guardó', () => {
    const { token, digest } = nuevoTokenDeVerificacion();

    expect(digestDeVerificacion(token)).toBe(digest);
  });

  it('cada token es distinto', () => {
    // Dos altas seguidas no pueden compartir token: el segundo verificaría
    // la cuenta del primero.
    const uno = nuevoTokenDeVerificacion();
    const otro = nuevoTokenDeVerificacion();

    expect(uno.token).not.toBe(otro.token);
    expect(uno.digest).not.toBe(otro.digest);
  });

  it('un token distinto no coincide con el hash guardado', () => {
    const { digest } = nuevoTokenDeVerificacion();
    const ajeno = nuevoTokenDeVerificacion();

    expect(digestDeVerificacion(ajeno.token)).not.toBe(digest);
  });

  it('vence en tres días', () => {
    // Más que el de recuperación —que lo pide alguien mirando la pantalla—
    // porque este llega cuando el dueño se anotó y quizás lo abre mañana.
    const { expiraEn } = nuevoTokenDeVerificacion();
    const horas = (expiraEn.getTime() - Date.now()) / 3_600_000;

    expect(Math.round(horas)).toBe(VERIFY_TOKEN_HORAS);
  });

  it('el token entra en una URL sin escaparse', () => {
    // Va como parámetro en el link del mail: un carácter que necesite escape
    // se rompe en algún cliente de correo.
    const { token } = nuevoTokenDeVerificacion();

    expect(encodeURIComponent(token)).toBe(token);
  });
});

describe('el mail que se manda', () => {
  const { subject, body } = mailDeVerificacion('Manolo San Telmo', 'https://panel/verificar?t=abc');

  it('el asunto dice de qué restaurante es', () => {
    // Quien tiene dos locales recibe dos mails y tiene que poder
    // distinguirlos sin abrirlos.
    expect(subject).toContain('Manolo San Telmo');
  });

  it('el cuerpo trae el link', () => {
    expect(body).toContain('https://panel/verificar?t=abc');
  });

  it('le dice qué hacer a quien no se anotó', () => {
    // Alguien puede recibir esto porque otro se equivocó de mail: tiene que
    // entender en dos líneas que no tiene que hacer nada.
    expect(body).toContain('Si no fuiste vos');
  });

  it('dice cuánto vale el link', () => {
    expect(body).toContain(String(VERIFY_TOKEN_HORAS));
  });
});
