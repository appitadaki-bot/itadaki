/**
 * Si la cuenta que está en pantalla es de una visita anterior.
 *
 * Pagar cierra la mesa, pero no echa al comensal: quien se queda a un café
 * vuelve a sentarse y arranca una sesión nueva, vacía. La pantalla de la
 * cuenta pedía la nueva y, si fallaba o tardaba, se quedaba mostrando la
 * vieja —ya cobrada— con su mismo monto. Para quien se acaba de sentar de
 * nuevo eso se lee como que la mesa le cobra otra vez lo mismo que pagó.
 */
export function esDeOtraVisita(
  sessionIdDeLaCuenta: string | undefined,
  sessionIdPedida: string,
): boolean {
  return sessionIdDeLaCuenta !== undefined && sessionIdDeLaCuenta !== sessionIdPedida;
}
