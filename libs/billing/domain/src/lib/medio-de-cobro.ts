/**
 * Con qué se cobró, según el mozo.
 *
 * Es otra pregunta que la del llamado a la mesa. Ahí el comensal declara cómo
 * *piensa* pagar antes de que el mozo camine —lo justo para saber si llevar el
 * posnet—, y para eso "tarjeta" alcanza. Acá el mozo ya tuvo la plata en la
 * mano y pasó el posnet: sabe si fue crédito o débito, y esa diferencia le
 * cuesta plata al dueño.
 *
 * Por eso son dos vocabularios y no uno estirado para los dos usos. Pedirle al
 * comensal que elija crédito o débito antes de que llegue el mozo sería una
 * pregunta que no puede contestar bien y que no le sirve a nadie.
 *
 * La separación importa porque los medios no cuestan lo mismo: el crédito
 * cobra más comisión que el débito y se acredita más tarde, y la
 * transferencia entra casi entera pero hay que conciliarla a mano. Un solo
 * número de "tarjeta" esconde justamente lo que el dueño querría mirar.
 */
export const MEDIOS_DE_COBRO = [
  'CASH',
  'DEBIT',
  'CREDIT',
  'TRANSFER',
  'COUNTER',
] as const;

export type MedioDeCobro = (typeof MEDIOS_DE_COBRO)[number];

/**
 * Cómo se llama cada uno en pantalla.
 *
 * Acá y no en cada componente: el mozo elige el medio en el salón y el dueño
 * lo lee en sus métricas, y que una pantalla diga "Débito" y la otra "Tarjeta
 * de débito" haría dudar de si son el mismo número.
 */
export const NOMBRE_DEL_MEDIO: Record<MedioDeCobro, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  TRANSFER: 'Transferencia',
  COUNTER: 'En la caja',
};

/** Cómo se muestra un medio, incluido el que nadie declaró. */
export function nombreDelMedio(medio: string | null): string {
  if (medio === null) return 'Sin declarar';

  return NOMBRE_DEL_MEDIO[medio as MedioDeCobro] ?? medio;
}

/** Si lo que llegó es un medio que conocemos. */
export function esMedioDeCobro(valor: unknown): valor is MedioDeCobro {
  return typeof valor === 'string' && (MEDIOS_DE_COBRO as readonly string[]).includes(valor);
}

/**
 * Los medios que el mozo elige al cerrar la mesa, en orden.
 *
 * Efectivo primero: es el más frecuente y el que tiene descuento.
 *
 * Sin "en la caja". No era un medio de pago sino un lugar, y ofrecerlo al
 * cobrar no tenía sentido: si el mozo está cerrando la mesa, la plata la tuvo
 * él. Para la mesa que se va sin pagar por la mesa está "liberar sin cobrar",
 * que es lo que de verdad pasó.
 */
export const MEDIOS_QUE_ELIGE_EL_MOZO: readonly MedioDeCobro[] = [
  'CASH',
  'DEBIT',
  'CREDIT',
  'TRANSFER',
];

/**
 * Los medios que elige el comensal al pedir la cuenta.
 *
 * Los mismos que el mozo, menos "en la caja": esa no es una forma de pagar
 * sino un lugar, y el comensal que la elegía dejaba a la mesa sin registrar
 * —nadie cobra en la mesa, así que el sistema no se entera de si pagaron—.
 * Si van a la caja, el mozo lo marca al liberar.
 *
 * Que sean los mismos importa porque el descuento por efectivo depende de lo
 * que la mesa eligió: con vocabularios distintos, la mesa decía "tarjeta" y el
 * mozo tenía que traducir a débito o crédito, y en el medio se perdía si
 * correspondía descontar.
 */
export const MEDIOS_QUE_ELIGE_LA_MESA: readonly MedioDeCobro[] = [
  'CASH',
  'DEBIT',
  'CREDIT',
  'TRANSFER',
];

/**
 * Cómo se le explica cada medio a la mesa.
 *
 * Distinto del nombre que ve el mozo: el comensal no está declarando cómo
 * cobró, está pidiendo que le traigan algo. "Débito" solo no dice que el mozo
 * va a venir con el posnet.
 */
export const LO_QUE_PASA_SI_ELIGE: Record<MedioDeCobro, string> = {
  CASH: 'te llevan el cambio',
  DEBIT: 'te llevan el posnet a la mesa',
  CREDIT: 'te llevan el posnet a la mesa',
  TRANSFER: 'te pasan los datos para transferir',
  COUNTER: 'pagan al salir, en el mostrador',
};

/**
 * Cuánto entró en la caja con esta cuenta, en unidades menores.
 *
 * El consumo menos el descuento en efectivo: es la plata que el mozo tuvo en
 * la mano, que es lo que el dueño cruza con su caja. Sin restar el descuento,
 * las métricas dirían que entró más de lo que entró justamente en las cuentas
 * donde el local resignó plata a propósito.
 *
 * La propina queda afuera: no es del local, es del personal, y sumarla al
 * total cobrado infla las ventas con plata que se reparte.
 */
export function cobradoDeLaCuenta(subtotalMinor: number, descuentoMinor: number): number {
  // Nunca negativo: un descuento mal cargado que supere el consumo daría una
  // venta en negativo que arrastraría el total del día para abajo.
  return Math.max(0, subtotalMinor - descuentoMinor);
}
