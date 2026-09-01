/**
 * La cadena de conexión de los scripts, con TLS de verdad.
 *
 * `rejectUnauthorized: false` cifra pero no comprueba con quién habla: alguien
 * en el medio puede presentar cualquier certificado y quedarse con la copia
 * entera de la base, o devolver datos inventados en una restauración. En un
 * script que mueve todos los datos de todos los locales eso importa más que
 * en cualquier otro lado.
 *
 * `verify-full` y no `require` por lo mismo que en la API: `pg` las trata
 * igual hoy y avisa que en su próxima versión mayor `require` va a pasar a
 * cifrar sin verificar. Se escribe lo que ya está pasando.
 *
 * Localhost queda afuera: el Postgres de Docker no ofrece TLS.
 */
export function conTlsVerificado(cadena) {
  let url;
  try {
    url = new URL(cadena);
  } catch {
    return cadena;
  }

  if (url.searchParams.has('sslmode')) return cadena;

  const local = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
  if (local.includes(url.hostname)) return cadena;

  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

/**
 * Explica un fallo de certificado en vez de dejar el error crudo.
 *
 * El mensaje de Node —`unable to verify the first certificate`— no dice qué
 * hacer, y la salida fácil es apagar la verificación, que es justamente lo que
 * se vino a arreglar.
 */
export function esProblemaDeCertificado(error) {
  const codigo = typeof error?.code === 'string' ? error.code : '';
  return (
    codigo.startsWith('UNABLE_TO_') ||
    codigo.startsWith('SELF_SIGNED') ||
    codigo === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    codigo === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    codigo === 'CERT_HAS_EXPIRED'
  );
}
