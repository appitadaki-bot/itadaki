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
 *
 * `verify-full` y no `require` porque es lo que `pg` hace hoy con las dos: las
 * trata igual, y avisa por consola que en su próxima versión mayor `require`
 * va a pasar a la semántica de libpq —cifrar sin verificar contra quién—. Se
 * escribe lo que ya estaba pasando, así el día que cambie no nos degrada la
 * conexión en silencio.
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

  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

/**
 * Quita el `sslmode` de la cadena.
 *
 * `pg` decide el TLS de un solo lado: si la cadena trae `sslmode`, descarta el
 * objeto `ssl` que se le pase, certificado incluido. Para verificar contra una
 * CA propia hay que sacarlo de la cadena y decirlo por el objeto.
 */
function sinSslmode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}


/**
 * El PEM, venga con saltos de línea de verdad o escritos como texto.
 *
 * La casilla de una variable de entorno en un panel web suele ser de un solo
 * renglón: al pegar un certificado, los saltos se pierden o quedan como los
 * dos caracteres \n. Sin ellos OpenSSL no lo puede leer, lo descarta en
 * silencio, y la conexión falla con SELF_SIGNED_CERT_IN_CHAIN — el mismo error
 * que si no se hubiera configurado nada.
 */
function pegado(crudo: string): string {
  return crudo.replaceAll(String.raw`\n`, '\n').trim();
}

/**
 * Cómo conectarse a Postgres, para el pool y para cada script.
 *
 * Con `DATABASE_CA_CERT` se verifica contra esa CA en vez de contra las que
 * Node trae de fábrica. Hace falta cuando el proveedor firma con una CA propia
 * —Supabase es el caso— y si no, el handshake falla con
 * `SELF_SIGNED_CERT_IN_CHAIN`: el certificado está bien, lo que falta es el
 * raíz que lo respalda.
 *
 * Se sigue verificando: se cambia contra quién, no si. Bajar a `no-verify`
 * cifraría la conexión sin comprobar del otro lado, que para la base donde
 * viven los pedidos y las cuentas no es un intercambio aceptable.
 *
 * La variable lleva el PEM tal cual, con sus saltos de línea: tanto Render como
 * una terminal admiten valores de varias líneas.
 */
export function conexionPostgres(connectionString: string): {
  connectionString: string;
  ssl?: { ca: string };
} {
  const ca = pegado(process.env['DATABASE_CA_CERT'] ?? '');
  if (ca === '') return { connectionString: withSslWhenRemote(connectionString) };

  return { connectionString: sinSslmode(connectionString), ssl: { ca } };
}
