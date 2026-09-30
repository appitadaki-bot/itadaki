import { SIN_CONEXION, respuestaSinConexion } from './sin-conexion';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE = readFileSync(join(__dirname, 'auth.store.ts'), 'utf-8');
const PANEL = readFileSync(
  join(__dirname, '../../../../../apps/admin-web/src/app/admin.component.ts'),
  'utf-8',
);

describe('cuando no se puede llegar al servidor', () => {
  it('se contesta, no se tira', async () => {
    const respuesta = respuestaSinConexion();

    expect(respuesta.ok).toBe(false);
    expect(await respuesta.json()).toEqual({ kind: SIN_CONEXION });
  });

  it('dice que hay que reintentar, no que el pedido estuvo mal', () => {
    expect(respuestaSinConexion().status).toBe(503);
  });

  it('`apiFetch` la usa en lugar de dejar pasar la excepción', () => {
    // Es el único lugar por donde pasan las veintisiete pantallas: si el
    // `catch` no está acá, cada una tiene que acordarse sola.
    const apiFetch = STORE.slice(STORE.indexOf('async apiFetch('));
    expect(apiFetch).toContain('return respuestaSinConexion();');
  });
});

describe('el panel lo cuenta', () => {
  it('la subida de fotos traduce el corte', () => {
    expect(PANEL).toContain("case 'SIN_CONEXION':");
  });

  it('y no se queda muda si estalla antes de tener respuesta', () => {
    // Leer el archivo del disco o codificarlo también puede fallar.
    expect(PANEL).toContain("this.status.set('error: no pudimos subir la foto — probá de nuevo');");
  });
});
