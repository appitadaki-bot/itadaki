import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * La firma que Mercado Pago manda en `x-signature`.
 *
 * Viene como `ts=<momento>,v1=<hash>`, y el hash es un HMAC sobre una cadena
 * con el id del pago, el id del pedido y ese momento. Compararla con
 * `timingSafeEqual` y no con `===`: comparar strings corta en el primer byte
 * distinto, y ese tiempo alcanza para adivinar la firma byte a byte.
 */
export function firmaValida(
  cabecera: string | undefined,
  requestId: string | undefined,
  pagoId: string,
  secreto: string,
): boolean {
  if (cabecera === undefined || requestId === undefined) return false;

  const partes = new Map(
    cabecera.split(',').map((parte) => {
      const [clave = '', valor = ''] = parte.split('=');
      return [clave.trim(), valor.trim()] as const;
    }),
  );

  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (ts === undefined || v1 === undefined) return false;

  const esperado = createHmac('sha256', secreto)
    .update(`id:${pagoId};request-id:${requestId};ts:${ts};`)
    .digest('hex');

  const dado = Buffer.from(v1);
  const quiero = Buffer.from(esperado);
  return dado.length === quiero.length && timingSafeEqual(dado, quiero);
}
