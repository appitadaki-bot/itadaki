import { type Result, err, ok } from '@itadaki/shared/domain';

/**
 * Alguien que dejó sus datos para que le armemos la carta.
 *
 * Todavía no es un restaurante: la cuenta se crea después, con la carta
 * cargada. El alta automática lo dejaba entrando a un panel vacío justo
 * cuando la landing le había prometido lo contrario.
 */
export const COMO_TIENE_LA_CARTA = ['link', 'foto', 'papel'] as const;
export type ComoTieneLaCarta = (typeof COMO_TIENE_LA_CARTA)[number];

export interface Interesado {
  readonly local: string;
  readonly nombre: string;
  readonly whatsapp: string;
  readonly email: string | null;
  readonly mesas: number | null;
  readonly carta: ComoTieneLaCarta;
  /** Sólo cuando dijo que tiene link. */
  readonly cartaLink: string | null;
}

export type InteresadoError =
  | { readonly kind: 'FALTA'; readonly campo: string }
  | { readonly kind: 'DEMASIADO_LARGO'; readonly campo: string }
  | { readonly kind: 'WHATSAPP_CORTO' }
  | { readonly kind: 'CARTA_DESCONOCIDA'; readonly recibido: string };

const LARGO = 120;

/**
 * Un teléfono usable, sin pedir un formato.
 *
 * La gente escribe "11 5555-5555", "+54 9 11 5555 5555" o "1155555555". Pedir
 * uno solo es rebotar a alguien que ya decidió dejarte sus datos, así que se
 * cuentan los dígitos y listo: ocho es lo mínimo que puede ser un teléfono.
 */
const DIGITOS_MINIMOS = 8;

export function validarInteresado(
  crudo: Omit<Interesado, 'mesas'> & { readonly mesas: number | null },
): Result<Interesado, InteresadoError> {
  for (const [campo, valor] of [
    ['local', crudo.local],
    ['nombre', crudo.nombre],
    ['whatsapp', crudo.whatsapp],
  ] as const) {
    if (valor.trim() === '') return err({ kind: 'FALTA', campo });
    if (valor.length > LARGO) return err({ kind: 'DEMASIADO_LARGO', campo });
  }

  const digitos = crudo.whatsapp.replace(/\D/g, '');
  if (digitos.length < DIGITOS_MINIMOS) return err({ kind: 'WHATSAPP_CORTO' });

  if (!COMO_TIENE_LA_CARTA.includes(crudo.carta)) {
    return err({ kind: 'CARTA_DESCONOCIDA', recibido: String(crudo.carta) });
  }

  // El link sólo cuenta si dijo que lo tiene: guardar uno pegado por error en
  // otra opción sería mandar a alguien a importar una carta que no es.
  const cartaLink = crudo.carta === 'link' ? (crudo.cartaLink?.trim() || null) : null;
  if (crudo.carta === 'link' && cartaLink === null) {
    return err({ kind: 'FALTA', campo: 'cartaLink' });
  }

  return ok({
    local: crudo.local.trim(),
    nombre: crudo.nombre.trim(),
    whatsapp: crudo.whatsapp.trim(),
    email: crudo.email?.trim() || null,
    mesas: crudo.mesas,
    carta: crudo.carta,
    cartaLink,
  });
}
