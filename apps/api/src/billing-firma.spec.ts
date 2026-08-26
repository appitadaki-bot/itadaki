import { createHmac } from 'node:crypto';
import { firmaValida } from './billing-firma';

/**
 * La firma de los avisos de cobro.
 *
 * El endpoint del webhook es público —lo llama un servidor ajeno, no puede
 * pedir sesión— así que la firma es lo único que separa un aviso real de
 * cualquiera que descubra la URL. Sin ella, un POST bien armado se regala
 * meses de servicio.
 */

const SECRETO = 'secreto-de-prueba';
const PAGO = '1234567890';
const REQUEST = 'req-abc';
const TS = '1787000000';

const firmar = (pagoId = PAGO, requestId = REQUEST, ts = TS, secreto = SECRETO): string => {
  const hash = createHmac('sha256', secreto)
    .update(`id:${pagoId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  return `ts=${ts},v1=${hash}`;
};

describe('verificar la firma de Mercado Pago', () => {
  it('acepta una firma bien hecha', () => {
    expect(firmaValida(firmar(), REQUEST, PAGO, SECRETO)).toBe(true);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    // El caso que importa: alguien que conoce la URL pero no el secreto.
    const ajena = firmar(PAGO, REQUEST, TS, 'otro-secreto');
    expect(firmaValida(ajena, REQUEST, PAGO, SECRETO)).toBe(false);
  });

  it('rechaza una firma de otro pago', () => {
    // Reusar la firma de un cobro viejo para revivirlo.
    const deOtro = firmar('9999999999');
    expect(firmaValida(deOtro, REQUEST, PAGO, SECRETO)).toBe(false);
  });

  it('rechaza si cambia el request-id', () => {
    expect(firmaValida(firmar(), 'otro-request', PAGO, SECRETO)).toBe(false);
  });

  it('rechaza si el ts no es el que se firmó', () => {
    const hash = createHmac('sha256', SECRETO)
      .update(`id:${PAGO};request-id:${REQUEST};ts:${TS};`)
      .digest('hex');
    // Mismo hash, otro ts declarado: el hash deja de corresponder.
    expect(firmaValida(`ts=999,v1=${hash}`, REQUEST, PAGO, SECRETO)).toBe(false);
  });

  it('rechaza una cabecera vacía o ausente', () => {
    expect(firmaValida(undefined, REQUEST, PAGO, SECRETO)).toBe(false);
    expect(firmaValida('', REQUEST, PAGO, SECRETO)).toBe(false);
  });

  it('rechaza una cabecera sin las partes que necesita', () => {
    expect(firmaValida('ts=123', REQUEST, PAGO, SECRETO)).toBe(false);
    expect(firmaValida('v1=abc', REQUEST, PAGO, SECRETO)).toBe(false);
    expect(firmaValida('cualquier cosa', REQUEST, PAGO, SECRETO)).toBe(false);
  });

  it('rechaza sin request-id', () => {
    expect(firmaValida(firmar(), undefined, PAGO, SECRETO)).toBe(false);
  });

  it('no se cae con una firma de largo distinto', () => {
    // `timingSafeEqual` tira si los buffers miden distinto, así que el largo
    // se compara antes. Sin eso, un v1 corto tumbaba el endpoint.
    expect(firmaValida('ts=123,v1=corto', REQUEST, PAGO, SECRETO)).toBe(false);
  });
});
