/**
 * Da de alta un restaurante: cuenta, carta y mesas, en un solo paso.
 *
 * El alta a mano son diez llamadas a la API y es fácil equivocarse en una.
 * Esto hace el mismo recorrido, avisa qué salió mal, y al final imprime las
 * credenciales listas para copiar al WhatsApp.
 *
 *   node scripts/dar-de-alta.mjs "TACO BOX LELOIR" cliente@mail.com carta.txt 8
 *
 * La carta puede ser un archivo de texto o el link de la carta online. Si es
 * un link, se baja y se convierte sola.
 *
 * Importante: el cliente tiene que confirmar su mail antes de que se le pueda
 * cargar la carta. El script lo dice y espera — no verifica por él, porque
 * entonces la verificación no verificaría nada.
 */
import { readFileSync, existsSync } from 'node:fs';
// Del compilado y no del fuente: Node no ejecuta TypeScript, y `npm run alta`
// construye antes por eso. Es el mismo parser que usa el panel, así que lo
// importado queda idéntico a pegar la carta a mano.
import { parseMenuText } from '../dist/api/libs/catalog/domain/src/lib/menu-import.js';

const API = process.env.API ?? 'https://itadaki-api.onrender.com/api';

/*
 * Dos modos.
 *
 * El normal crea la cuenta y sigue. `--seguir` retoma una que ya existe, para
 * cuando el cliente recién confirma su mail: volver a correr el alta entera
 * fallaría porque el mail ya está tomado.
 */
const args = process.argv.slice(2);
const seguir = args[0] === '--seguir';
const [nombre, email, carta, mesasArg] = seguir
  ? [null, args[1], args[2], args[3]]
  : args;
const mesas = Number(mesasArg ?? 8);

if ((!seguir && !nombre) || !email || !carta) {
  console.error('uso: dar-de-alta "Nombre del local" mail@cliente.com <carta.txt|url> [mesas]');
  console.error('     dar-de-alta --seguir mail@cliente.com <carta.txt|url> [mesas]');
  process.exit(1);
}

/** Legible para dictar: sin caracteres que se confundan entre sí. */
function claveNueva() {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const base = (nombre ?? 'Alta').replace(/[^A-Za-z]/g, '').slice(0, 4) || 'Alta';
  const azar = [...crypto.getRandomValues(new Uint32Array(10))]
    .map((n) => abc[n % abc.length])
    .join('');
  return base[0].toUpperCase() + base.slice(1).toLowerCase() + azar;
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${API}${ruta}`, opciones);
  const cuerpo = await r.text();
  let datos = null;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    datos = cuerpo;
  }
  return { ok: r.ok, status: r.status, datos };
}

/** La carta, de un archivo o de la página del cliente. */
async function leerCarta(origen) {
  if (existsSync(origen)) return readFileSync(origen, 'utf8');

  console.log(`  bajando la carta de ${origen}`);
  const r = await fetch(origen);
  if (!r.ok) throw new Error(`no pude bajar la carta: HTTP ${r.status}`);

  const html = await r.text();
  // Las cartas online arman la página con JavaScript: si no vino nada de
  // texto, hay que pasarla a un archivo a mano.
  const texto = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, '\n');
  if (!/\$\s*\d/.test(texto)) {
    throw new Error(
      'la página no trae la carta en el HTML — abrila en el navegador, copiá el texto a un .txt y pasá ese archivo',
    );
  }
  return texto;
}

console.log(seguir ? `\nRetomando: ${email}\n` : `\nDando de alta: ${nombre}\n`);

/*
 * Al retomar, la contraseña la pone quien corre el script: la que generó la
 * primera vez no se guardó en ningún lado, y así tiene que ser — una clave
 * escrita en un archivo es una clave filtrada.
 */
const clave = seguir ? (process.env.CLAVE ?? '') : claveNueva();

if (seguir && clave === '') {
  console.error('  falta la contraseña: CLAVE="..." npm run alta -- --seguir ...');
  process.exit(1);
}

if (!seguir) {
  const alta = await pedir('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant: nombre, email, password: clave }),
  });

  if (!alta.ok) {
    console.error('  no se pudo crear la cuenta:', JSON.stringify(alta.datos).slice(0, 200));
    process.exit(1);
  }
  console.log('  cuenta creada');
}

const entrada = await pedir('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: clave }),
});
if (!entrada.ok || !entrada.datos?.token) {
  console.error('  la cuenta se creó pero no pude entrar:', JSON.stringify(entrada.datos).slice(0, 200));
  process.exit(1);
}
const token = entrada.datos.token;
const tenant = entrada.datos.user.tenantId;
console.log(`  local: ${tenant}`);

const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// La carta primero, que es lo que puede fallar por el mail sin confirmar.
const texto = await leerCarta(carta);
const { dishes, categories, skipped } = parseMenuText(texto);
console.log(`  carta leída: ${categories.length} categorías · ${dishes.length} platos`);
if (skipped.length > 0) {
  console.log(`  ${skipped.length} líneas que no entendí:`);
  for (const s of skipped.slice(0, 5)) console.log(`     L${s.lineNumber} ${s.problem}: ${s.raw}`);
}

const importado = await pedir('/menu/import', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ dishes }),
});

if (importado.status === 403 && importado.datos?.kind === 'MAIL_SIN_CONFIRMAR') {
  console.log(`
  ──────────────────────────────────────────────────────────────
  FALTA QUE CONFIRME EL MAIL

  La cuenta está creada y le llegó un correo a ${email}.
  Hasta que haga clic en ese link no se puede cargar la carta.

  Pedile que lo confirme y después corré esto, que retoma donde quedó
  sin volver a crear la cuenta:

    CLAVE="${clave}" npm run alta -- --seguir "${email}" "${carta}" ${mesas}

  Usuario:     ${email}
  Contraseña:  ${clave}
  ──────────────────────────────────────────────────────────────
`);
  process.exit(2);
}

if (!importado.ok) {
  console.error('  la carta no se pudo importar:', JSON.stringify(importado.datos).slice(0, 200));
  process.exit(1);
}
console.log(`  carta importada: ${importado.datos.imported} platos`);

for (let n = 1; n <= mesas; n += 1) {
  const r = await pedir('/tables', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ label: `Mesa ${n}`, seats: 4 }),
  });
  if (!r.ok) console.error(`  Mesa ${n}: ${JSON.stringify(r.datos).slice(0, 80)}`);
}
console.log(`  ${mesas} mesas creadas`);

console.log(`
──────────────────────────────────────────────────────────────
LISTO — para copiar al WhatsApp

Panel:       https://adm.itadaki.app
Usuario:     ${email}
Contraseña:  ${clave}

Los QR de las mesas salen del panel, en "Mesas y códigos QR".
──────────────────────────────────────────────────────────────
`);
