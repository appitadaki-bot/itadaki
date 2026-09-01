import { type Result, err, ok } from '@itadaki/shared/domain';

/**
 * El link donde el comensal deja su reseña.
 *
 * Google da uno que abre el formulario ya cargado sobre la ficha del local:
 * el cliente toca, escribe y listo. Buscar el restaurante a mano pierde a la
 * mayoría en el camino, y la mitad termina calificando otro local con nombre
 * parecido.
 *
 * El dueño lo copia una vez desde su panel de Google Business.
 */
export type ResenaError =
  | { readonly kind: 'VACIO' }
  | { readonly kind: 'NO_ES_UNA_URL'; readonly recibido: string }
  | { readonly kind: 'NO_ES_DE_GOOGLE'; readonly host: string }
  | { readonly kind: 'DEMASIADO_LARGO' };

/** Un link más largo que esto no es un link, es otra cosa pegada por error. */
const LARGO_MAXIMO = 500;

/**
 * Los dominios donde Google aloja estos links.
 *
 * `g.page` es el corto que da el panel de Business; los otros aparecen cuando
 * el dueño copia desde el buscador o desde Maps en el teléfono. Todos llevan
 * al mismo lugar, así que se aceptan todos en vez de obligarlo a encontrar el
 * "correcto".
 */
const DOMINIOS = ['g.page', 'search.google.com', 'maps.app.goo.gl', 'goo.gl'];

/**
 * Maps desde la computadora.
 *
 * Ahí Compartir no da el link corto sino `google.com/maps/place/...`, y en
 * Argentina encima con el dominio local: `google.com.ar`. Es de Google igual,
 * y es lo que tiene a mano el que está sentado frente a la computadora
 * configurando su local — rechazarlo mandaba a buscar el link "bueno" sin
 * decir dónde está.
 *
 * Se pide además que la dirección lleve a un lugar y no a la home: pegar
 * `google.com` no es un link de reseña, es lo que quedó en el portapapeles.
 */
const CAMINOS_DE_GOOGLE = ['/maps', '/local', '/search'];

function esGoogleDeEscritorio(host: string, camino: string): boolean {
  const esDominioGoogle = host === 'google.com' || /^(www\.)?google\.[a-z.]{2,7}$/.test(host);
  return esDominioGoogle && CAMINOS_DE_GOOGLE.some((inicio) => camino.startsWith(inicio));
}

/**
 * Valida el link que el dueño pegó.
 *
 * Comprueba que sea de Google y nada más. No se verifica que la ficha exista
 * —eso requiere pedirle permiso a Google sobre el negocio— así que un link
 * bien formado de otro local pasaría: lo que esto evita es el caso común, que
 * es pegar cualquier cosa o el texto equivocado del portapapeles.
 */
export function linkDeResena(crudo: string): Result<string, ResenaError> {
  const limpio = crudo.trim();

  if (limpio === '') {
    return err({ kind: 'VACIO' });
  }
  if (limpio.length > LARGO_MAXIMO) {
    return err({ kind: 'DEMASIADO_LARGO' });
  }

  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    return err({ kind: 'NO_ES_UNA_URL', recibido: limpio });
  }

  // Sólo https: un link http en el teléfono de un cliente es una advertencia
  // del navegador justo cuando le estamos pidiendo un favor.
  if (url.protocol !== 'https:') {
    return err({ kind: 'NO_ES_UNA_URL', recibido: limpio });
  }

  const host = url.hostname.toLowerCase();
  const esDeGoogle =
    DOMINIOS.some((dominio) => host === dominio || host.endsWith(`.${dominio}`)) ||
    esGoogleDeEscritorio(host, url.pathname);

  if (!esDeGoogle) {
    return err({ kind: 'NO_ES_DE_GOOGLE', host });
  }

  return ok(url.toString());
}

/** Si el local tiene reseñas configuradas. Vacío es no ofrecerlo. */
export function pideResenas(link: string | null): boolean {
  return link !== null && link.trim() !== '';
}
