export const ROLES = ['OWNER', 'MANAGER', 'KITCHEN', 'WAITER'] as const;
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
  WAITER: ['menu:read', 'orders:read', 'orders:advance', 'bills:read', 'bills:close'],
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

/** Si este rol puede entrar con mail y contraseña. */
export function entraConMail(role: Role): boolean {
  return !entraConPin(role);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
