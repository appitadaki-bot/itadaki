export const ROLES = ['OWNER', 'MANAGER', 'KITCHEN', 'WAITER', 'CAJA', 'SOPORTE'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'menu:read',
  'menu:write',
  'orders:read',
  'orders:advance',
  'bills:read',
  'bills:close',
  'metrics:read',
  'staff:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * What each role may do.
 *
 * Kitchen staff move tickets but never touch prices; a waiter closes bills but
 * does not edit the menu. Keeping this as data rather than scattered ifs means
 * a permission question has exactly one answer.
 */
const GRANTS: Record<Role, readonly Permission[]> = {
  OWNER: [
    'menu:read',
    'menu:write',
    'orders:read',
    'orders:advance',
    'bills:read',
    'bills:close',
    'metrics:read',
    'staff:manage',
  ],
  MANAGER: [
    'menu:read',
    'menu:write',
    'orders:read',
    'orders:advance',
    'bills:read',
    'bills:close',
    'metrics:read',
  ],
  KITCHEN: ['menu:read', 'orders:read', 'orders:advance'],
  /*
   * El mozo atiende, no cobra.
   *
   * Tenía `bills:close`, que es cobrar una mesa y también liberarla sin
   * cobrarla. Con eso, cualquiera del salón podía a las tres de la mañana
   * marcar mesas como pagadas o hacerlas desaparecer, desde su teléfono y sin
   * estar en el local. Cobrar pasa a ser de la caja.
   */
  WAITER: ['menu:read', 'orders:read', 'orders:advance', 'bills:read'],
  /*
   * Quien maneja la plata, y nada más.
   *
   * Cobra, libera una mesa sin cobrarla y ve las cuentas. No toca la carta ni
   * al personal, y no ve las métricas: cuánto vende el local es del dueño.
   *
   * Mueve comandas como el mozo porque comparte pantalla con él —el tablero
   * del salón— y porque en un local chico la misma persona hace las dos cosas
   * con dos cuentas distintas.
   */
  CAJA: ['menu:read', 'orders:read', 'orders:advance', 'bills:read', 'bills:close'],
  /*
   * Nosotros, para armarle la carta a un local nuevo.
   *
   * La promesa del alta es "cuando entres, tu carta ya va a estar cargada", y
   * eso exige entrar antes que el dueño. La alternativa era que él nos dictara
   * su contraseña, que es peor: la clave viaja por WhatsApp, queda en dos
   * historiales, y después nadie sabe si un precio lo cambió él o nosotros.
   *
   * Sólo la carta y las mesas, que es para lo que se usa. No ve la
   * facturación ni las ventas, y no puede tocar al personal: si esta cuenta
   * se filtra, lo peor que puede pasar es una carta mal cargada.
   */
  SOPORTE: ['menu:read', 'menu:write'],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return GRANTS[role];
}

/**
 * Con qué entra cada rol.
 *
 * El dueño y el encargado usan mail y contraseña: tienen mail de trabajo, les
 * llega la factura, y son quienes recuperan el acceso solos. El mozo y la
 * cocina usan usuario y PIN, que es lo que se dicta en el salón y se tipea de
 * parado con las manos ocupadas.
 *
 * Tener dos puertas abiertas para la misma persona confundía: el alta le daba
 * usuario y PIN, y la pantalla igual le ofrecía "entrar con mail y
 * contraseña" —una contraseña que nadie le dictó y un mail que muchas veces
 * es inventado, `@sin-mail.itadaki`—. Cada rol entra por donde le
 * corresponde y por ninguna otra.
 */
export function entraConPin(role: Role): boolean {
  return role === 'WAITER' || role === 'KITCHEN';
}

/**
 * Si este rol es nuestro y no del restaurante.
 *
 * Se usa para no ofrecerlo en el panel —el dueño no puede crear cuentas de
 * soporte— y para dejar dicho en el historial quién tocó qué.
 */
export function esDeSoporte(role: Role): boolean {
  return role === 'SOPORTE';
}

/**
 * Dónde vive la cuenta de soporte.
 *
 * No es un restaurante: es el local al que pertenece su fila, para que tenga
 * dónde apoyarse. El token, en cambio, lleva el restaurante que está
 * atendiendo — por eso comprobar si sigue habilitada hay que hacerlo acá y no
 * donde apunta el token.
 */
export const TENANT_DE_SOPORTE = 'soporte';

/** Si este rol puede entrar con mail y contraseña. */
export function entraConMail(role: Role): boolean {
  return !entraConPin(role);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
