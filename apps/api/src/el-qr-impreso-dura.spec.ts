import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signTableToken, verifyTableToken } from '@itadaki/identity/infra';

/**
 * El QR que se pega en la mesa tiene que durar.
 *
 * El sticker es papel: nadie puede "volver a escanearlo" cuando el que venció
 * es el papel mismo, y reimprimir todas las mesas es un trabajo que el dueño
 * no tiene por qué hacer. Por eso el token se firma sin vencimiento, y lo
 * único que lo invalida es rotar el secreto de esa mesa.
 *
 * La pantalla de impresión decía lo contrario —"vencen a las 8 horas y se
 * renuevan al volver a abrir esta pantalla"— y eso mandaba al dueño a
 * reimprimir todos los días sin necesidad.
 */

const HOJA = readFileSync(
  join(__dirname, '..', '..', 'admin-web', 'src', 'app', 'qr-sheet.component.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

const MESAS = readFileSync(join(__dirname, 'tables.controller.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('el token del QR impreso', () => {
  const secreto = 'el-secreto-de-la-mesa';
  const nuevo = () =>
    signTableToken({ tenantId: 'resto', tableId: 'mesa-1', issuedAt: Date.now() }, secreto);

  it('sirve un año después de impreso', () => {
    const dentroDeUnAno = new Date(Date.now() + 365 * 24 * 3_600_000);
    expect(verifyTableToken(nuevo(), secreto, dentroDeUnAno)).not.toBeNull();
  });

  it('se firma sin fecha de vencimiento', () => {
    // Si alguien le agrega `expiresAt` acá, todos los stickers pegados pasan a
    // tener fecha de muerte y el local se entera cuando dejan de funcionar.
    const arma = MESAS.slice(MESAS.indexOf('private linkFor'));
    expect(arma.slice(0, arma.indexOf('\n  }'))).not.toContain('expiresAt');
  });

  it('y lo único que lo invalida es rotar el secreto de esa mesa', () => {
    expect(verifyTableToken(nuevo(), 'otro-secreto', new Date())).toBeNull();
  });
});

describe('lo que la pantalla de impresión le promete al dueño', () => {
  it('no dice que vencen', () => {
    expect(HOJA).not.toContain('vencen a las 8 horas');
    expect(HOJA).toContain('No vencen');
  });

  it('ni que hay que volver a imprimirlos', () => {
    const texto = HOJA.slice(HOJA.indexOf('class="hint"'), HOJA.indexOf('</span>'));
    expect(texto).not.toMatch(/renuev|reimprim/i);
  });
});
