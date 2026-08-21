/**
 * La cadena de conexión, con TLS cuando la base es remota.
 *
 * Postgres hosteado —Render, Neon, Supabase— cierra la conexión que no negocia
 * TLS, y `pg` lo reporta como `ECONNRESET`: un error de red que no menciona
 * SSL por ningún lado y que manda a buscar por el camino equivocado. Nos pasó
 * dos veces con la misma variable.
 *
 * Es una decisión del entorno y no de quien escribe el comando: contra una
 * base que no está en esta máquina, TLS va siempre. Localhost queda afuera
 * porque el Postgres de Docker no lo ofrece.
 *
 * Se respeta lo que la cadena ya diga: quien escribió `sslmode=disable` a
 * propósito —un túnel, un proxy local— sabe algo que esto no.
 */
export function withSslWhenRemote(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // No es una URL que podamos leer; que decida el driver.
    return connectionString;
  }

  if (url.searchParams.has('sslmode')) return connectionString;

  const local = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
  if (local.includes(url.hostname)) return connectionString;

  url.searchParams.set('sslmode', 'require');
  return url.toString();
}
