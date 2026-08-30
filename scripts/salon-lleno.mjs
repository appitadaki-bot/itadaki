/**
 * Veinte mesas pidiendo a la vez.
 *
 *   npm run db:reset && npm run salon-lleno
 *
 * Contra la API local, nunca contra producción: abre una sesión por mesa y
 * manda pedidos de verdad, que después alguien tendría que ir a limpiar del
 * restaurante.
 *
 * No mide peticiones por segundo —eso depende del servidor donde corra— sino
 * si el sistema se equivoca cuando todo pasa junto: pedidos que no llegan,
 * pedidos que aparecen en la mesa equivocada, y cuentas que no cierran.
 */
import { randomUUID } from 'node:crypto';

const API = 'http://localhost:3000/api';
const ENVIOS_POR_MESA = 3;

const token = (await (await fetch(`${API}/auth/login`, {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({email:'dueno@itadaki.test',password:'Itadaki2026Demo'}),
})).json()).token;

const tablas = await (await fetch(`${API}/tables`, {headers:{Authorization:`Bearer ${token}`}})).json();
const menu = await (await fetch(`${API}/menu`)).json();
// Sólo lo que se puede pedir: un plato sin stock se rechaza con razón, y
// contarlo como fallo escondería los fallos de verdad.
const productos = menu.products.filter((p) => p.available !== false);
const MESAS = tablas.length;

console.log(`${MESAS} mesas · ${productos.length} platos disponibles\n`);

async function unaMesa(tabla, i) {
  const tableToken = tabla.url.split('t=')[1];
  const cabeceras = { 'Content-Type': 'application/json', 'x-table-token': tableToken };

  const entrada = await (await fetch(`${API}/sessions/join`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ tableToken, nickname: `Comensal ${i}` }),
  })).json();
  if (entrada.kind) return { tabla: tabla.id, error: entrada.kind, mandados: [] };

  const { session: { id: sessionId }, dinerId } = entrada;
  const mandados = [];

  for (let n = 0; n < ENVIOS_POR_MESA; n += 1) {
    const producto = productos[(i + n) % productos.length];
    const cantidad = 1 + ((i + n) % 3);
    const res = await fetch(`${API}/orders`, {
      method: 'POST', headers: cabeceras,
      body: JSON.stringify({ sessionId, dinerId, clientRequestId: randomUUID(),
        lines: [{ productId: producto.id, quantity: cantidad, modifiers: [], notes: '' }] }),
    });
    mandados.push({ producto: producto.name, cantidad, ...(res.ok ? {} : { fallo: res.status }) });
  }
  return { tabla: tabla.id, sessionId, mandados };
}

console.log(`Mandando ${MESAS * ENVIOS_POR_MESA} pedidos desde ${MESAS} mesas, todas a la vez…\n`);
const arranque = Date.now();
const resultados = await Promise.all(tablas.map((t, i) => unaMesa(t, i)));
const duracion = Date.now() - arranque;

const sinEntrar = resultados.filter((r) => r.error);
const esperados = resultados.flatMap((r) => r.mandados.filter((m) => !m.fallo).map((m) => ({ tabla: r.tabla, ...m })));
const rechazados = resultados.flatMap((r) => r.mandados.filter((m) => m.fallo));

const comandas = await (await fetch(`${API}/orders`, {headers:{Authorization:`Bearer ${token}`}})).json();
const recibidos = comandas.flatMap((o) => o.items.map((i) => ({ tabla: o.tableId, producto: i.name, cantidad: i.quantity })));

const linea = '─'.repeat(60);
console.log(linea);
console.log(`TIEMPO             ${duracion} ms · ${(duracion / (MESAS * ENVIOS_POR_MESA)).toFixed(1)} ms por pedido`);
console.log(linea);
console.log(`MESAS QUE ENTRARON ${MESAS - sinEntrar.length} de ${MESAS}  ${sinEntrar.length === 0 ? '✓' : '← ' + JSON.stringify(sinEntrar.map(s=>s.error))}`);
console.log(`PEDIDOS ENVIADOS   ${esperados.length}`);
console.log(`PEDIDOS EN COCINA  ${recibidos.length}`);
console.log(`RECHAZADOS         ${rechazados.length}  ${rechazados.length === 0 ? '✓' : '← ' + JSON.stringify(rechazados.slice(0,2))}`);

const perdidos = esperados.length - recibidos.length;
console.log(`PERDIDOS           ${perdidos}  ${perdidos === 0 ? '✓' : '← PROBLEMA'}`);

let mezclados = 0;
for (const e of esperados) {
  if (!recibidos.find((r) => r.tabla === e.tabla && r.producto === e.producto && r.cantidad === e.cantidad)) mezclados += 1;
}
console.log(`EN OTRA MESA       ${mezclados}  ${mezclados === 0 ? '✓' : '← PROBLEMA'}`);

const mesasEnCocina = new Set(recibidos.map((r) => r.tabla));
console.log(`MESAS EN COCINA    ${mesasEnCocina.size} de ${MESAS}  ${mesasEnCocina.size === MESAS ? '✓' : '← faltan'}`);

let ok = 0; const mal = [];
for (const r of resultados) {
  if (!r.sessionId) continue;
  const tt = tablas.find((t) => t.id === r.tabla).url.split('t=')[1];
  const cuenta = await (await fetch(`${API}/bills/close/${r.sessionId}`, {method:'POST', headers:{'x-table-token': tt}})).json();
  if (cuenta.kind) { mal.push({ tabla: r.tabla, error: cuenta.kind }); continue; }
  const enCuenta = cuenta.lines.reduce((s, l) => s + l.quantity, 0);
  const pedidos = r.mandados.filter((m) => !m.fallo).reduce((s, m) => s + m.cantidad, 0);
  if (enCuenta === pedidos) ok += 1; else mal.push({ tabla: r.tabla, pedidos, enCuenta });
}
console.log(`CUENTAS CORRECTAS  ${ok} de ${MESAS - sinEntrar.length}  ${mal.length === 0 ? '✓' : '← ' + JSON.stringify(mal.slice(0,3))}`);
console.log(linea);
