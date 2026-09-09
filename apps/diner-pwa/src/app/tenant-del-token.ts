/**
 * De qué restaurante es la mesa, según el token del QR.
 *
 * La app no puede adivinarlo: se sabe recién cuando alguien escanea. Antes
 * venía escrito fijo en el arranque —`itadaki`, el restaurante demo— y la
 * carta pública salía siempre de ahí. Con un solo local andaba de casualidad;
 * con dos, el comensal de uno veía la carta del otro.
 *
 * Se lee el cuerpo del token sin comprobar la firma, que necesita el secreto
 * de la mesa y vive en el servidor. Para elegir qué carta pedir alcanza: la
 * carta es pública, y todo lo que no sea leerla lo valida la API contra la
 * firma real.
 *
 * Existe `peekTableToken` en identity/infra, pero usa `Buffer` y es de Node.
 */
export function tenantDelToken(token: string | null): string | null {
  if (token === null || token === '') return null;

  const body = token.split('.')[0];
  if (body === undefined) return null;

  try {
    // base64url a base64: el token viaja en una URL, así que trae - y _.
    const base64 = body.replaceAll('-', '+').replaceAll('_', '/');
    const parsed = JSON.parse(atob(base64)) as { tenantId?: unknown };
    return typeof parsed.tenantId === 'string' && parsed.tenantId !== ''
      ? parsed.tenantId
      : null;
  } catch {
    return null;
  }
}
