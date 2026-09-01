/**
 * Qué gana cuando llega un link del mail.
 *
 * Quien abría "recuperar contraseña" en un navegador donde ya había entrado
 * caía directo en el panel: la sesión guardada se restauraba antes de que
 * nadie mirara la dirección, y la pantalla de elegir contraseña nunca
 * aparecía. Se pedía el link, se tocaba, y no pasaba nada — con la contraseña
 * sin cambiar y sin ninguna señal de por qué.
 *
 * Peor en el caso que el link existe para resolver: alguien que perdió su
 * contraseña, o que sospecha que otro la tiene. Quedarse con la sesión abierta
 * es exactamente lo contrario de lo que vino a hacer.
 */

/** Lo mismo que decide el store, para poder probarlo sin un navegador. */
function hayCredencialEnLaUrl(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search);
  const recuperar = (params.get('reset') ?? '') !== '';
  const verificar = (params.get('t') ?? '') !== '' && pathname.includes('/verificar');

  return recuperar || verificar;
}

describe('el link del mail gana sobre la sesión guardada', () => {
  it('reconoce el de recuperar contraseña', () => {
    expect(hayCredencialEnLaUrl('/', '?reset=abc123')).toBe(true);
  });

  it('reconoce el de confirmar el mail', () => {
    expect(hayCredencialEnLaUrl('/verificar', '?t=abc123')).toBe(true);
  });

  it('una visita normal no toca la sesión', () => {
    // Lo más común: alguien que abre el panel para trabajar.
    expect(hayCredencialEnLaUrl('/', '')).toBe(false);
  });

  it('un parámetro vacío no cuenta', () => {
    // `?reset=` sin nada detrás cerraría la sesión de quien entró a trabajar.
    expect(hayCredencialEnLaUrl('/', '?reset=')).toBe(false);
  });

  it('la "t" sólo vale en la ruta de verificar', () => {
    // Es una letra suelta: en cualquier otra ruta puede ser de otra cosa, y
    // cerrar la sesión por eso echaría a alguien de su trabajo.
    expect(hayCredencialEnLaUrl('/', '?t=abc123')).toBe(false);
  });

  it('no se confunde con otros parámetros', () => {
    expect(hayCredencialEnLaUrl('/', '?tab=carta&orden=nombre')).toBe(false);
  });
});
