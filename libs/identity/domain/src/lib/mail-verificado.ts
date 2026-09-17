import { type Permission } from './role';

/**
 * Qué se puede hacer sin haber confirmado el mail.
 *
 * La verificación existía pero no gateaba nada: alguien se anotaba con un
 * mail mal tipeado —o con uno que no es suyo— y quedaba operando un
 * restaurante igual. Eso es lo que esto cierra.
 *
 * El corte es el mismo que usa el trial, y por la misma razón: se bloquea lo
 * del dueño, nunca lo del comensal. Una mesa tiene que poder pedir y la
 * cocina recibir aunque el mail no esté confirmado — un restaurante quemado
 * a mitad de servicio por un correo que no llegó no se convierte en cliente,
 * y encima el problema sería nuestro, no suyo.
 *
 * Así que se cierra la configuración: la carta, los precios y el personal.
 * Todo eso lo toca el dueño desde el panel, sentado, y puede esperar a que
 * haga clic en el mail que ya tiene en la casilla.
 */
const NECESITAN_MAIL_CONFIRMADO: readonly Permission[] = ['menu:write', 'staff:manage'];

export function necesitaMailConfirmado(permiso: Permission): boolean {
  return NECESITAN_MAIL_CONFIRMADO.includes(permiso);
}

/**
 * Si este pedido puede seguir.
 *
 * Se pregunta con el permiso que la ruta declara, no con la ruta: una que se
 * agregue mañana queda cubierta sola si pide `menu:write`, sin que nadie se
 * acuerde de sumarla a una lista.
 */
export function puedeSinConfirmar(permiso: Permission | undefined, confirmado: boolean): boolean {
  if (confirmado) return true;
  if (permiso === undefined) return true;
  return !necesitaMailConfirmado(permiso);
}
