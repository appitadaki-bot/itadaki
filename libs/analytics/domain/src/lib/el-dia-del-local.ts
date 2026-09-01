/**
 * Desde cuándo cuenta "hoy" para un restaurante.
 *
 * No son las últimas veinticuatro horas. Un mozo que mira las métricas un
 * martes a las nueve de la noche quiere ver el servicio de hoy, y las últimas
 * veinticuatro le meterían adentro la noche del lunes — que fue otro turno,
 * con otra caja y otro cierre.
 *
 * El día es el del local y no el del servidor: la API corre en Oregon y el
 * restaurante está en San Juan. Sin la zona horaria, "hoy" empieza a las
 * nueve de la noche de ayer para el dueño, y el almuerzo aparece en el día
 * equivocado.
 */

/**
 * La medianoche de hoy en la zona del restaurante, expresada en UTC.
 *
 * Se arma desde las partes de la fecha local y no restando horas: los husos
 * cambian con el horario de verano, y un desplazamiento fijo da mal justo los
 * días en que cambia — que son los que alguien mira dos veces para entender
 * por qué el número no cierra.
 */
export function empiezaElDia(ahora: Date, zona: string): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(ahora);

  const valor = (tipo: string): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? '0');

  /*
   * Cuánto va del día allá, y se resta.
   *
   * Es lo mismo que "poner el reloj en cero" pero sin depender de conocer el
   * desplazamiento: sirve igual en un huso de media hora y el día que cambia
   * el horario de verano.
   */
  const transcurrido =
    valor('hour') * 3_600_000 + valor('minute') * 60_000 + valor('second') * 1000;

  const inicio = new Date(ahora.getTime() - transcurrido);

  // Los milisegundos no salen del formateo: se descuentan aparte para que el
  // corte quede exactamente en la medianoche.
  return new Date(inicio.getTime() - inicio.getMilliseconds());
}

/**
 * Si una zona horaria sirve.
 *
 * Una zona inválida hace explotar el formateo, y eso tumbaría las métricas
 * enteras por un dato de configuración. Quien la use decide con qué
 * reemplazarla.
 */
export function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}
