import { type Result, err, ok } from '@itadaki/shared/domain';

/**
 * Qué parte de la foto entra en el cuadrado de la carta.
 *
 * El centro va en fracción del ancho y del alto; el lado, en fracción del
 * lado más largo de la foto. Así `lado: 1` centrado es la foto entera —el
 * cuadrado la contiene y lo que sobra se rellena— y no un caso aparte que
 * haya que tratar distinto.
 *
 * Normalizado y no en píxeles: el original se guarda achicado, y las mismas
 * coordenadas tienen que servir contra cualquier medida de la que se
 * renderice.
 */
export interface Encuadre {
  readonly cx: number;
  readonly cy: number;
  readonly lado: number;
}

/** La foto entera, que es con lo que abre el editor. */
export const ENCUADRE_ENTERO: Encuadre = { cx: 0.5, cy: 0.5, lado: 1 };

export type EncuadreError = {
  readonly kind: 'ENCUADRE_FUERA_DE_RANGO';
  readonly campo: string;
  readonly valor: number;
};

const enUnidad = (valor: number): boolean => Number.isFinite(valor) && valor >= 0 && valor <= 1;

/** Si no se tocó nada: sirve para no mandar lo que el servidor ya hace solo. */
export function esLaFotoEntera(encuadre: Encuadre): boolean {
  return (
    encuadre.lado >= 1 &&
    Math.abs(encuadre.cx - 0.5) < 0.001 &&
    Math.abs(encuadre.cy - 0.5) < 0.001
  );
}

/**
 * Comprueba lo que llega del navegador antes de que toque el renderizador.
 *
 * Un lado en cero o un centro en NaN haría que sharp reviente adentro de la
 * tubería, donde el error ya no dice nada de lo que pasó.
 */
export function validarEncuadre(encuadre: Encuadre): Result<Encuadre, EncuadreError> {
  for (const [campo, valor] of [
    ['cx', encuadre.cx],
    ['cy', encuadre.cy],
    ['lado', encuadre.lado],
  ] as const) {
    if (!enUnidad(valor)) {
      return err({ kind: 'ENCUADRE_FUERA_DE_RANGO', campo, valor });
    }
  }

  if (encuadre.lado <= 0) {
    return err({ kind: 'ENCUADRE_FUERA_DE_RANGO', campo: 'lado', valor: encuadre.lado });
  }

  return ok(encuadre);
}

export interface RecorteEnPixeles {
  readonly left: number;
  readonly top: number;
  readonly lado: number;
}

/**
 * Dónde cae el encuadre sobre la foto, en píxeles.
 *
 * Puede caer fuera: con la foto entera, el cuadrado es más ancho que una foto
 * vertical y más alto que una apaisada. Eso es a propósito —lo que sobra se
 * rellena— así que acá no se recorta contra los bordes: se informa tal cual y
 * decide quien renderiza.
 */
export function recorteEnPixeles(
  encuadre: Encuadre,
  width: number,
  height: number,
): RecorteEnPixeles {
  const masLargo = Math.max(width, height);
  const lado = Math.max(1, Math.round(encuadre.lado * masLargo));

  return {
    left: Math.round(encuadre.cx * width - lado / 2),
    top: Math.round(encuadre.cy * height - lado / 2),
    lado,
  };
}

/**
 * El encuadre más cerrado que todavía cae dentro de la foto, en cada eje.
 *
 * Mirando de cerca una foto apaisada, el cuadrado se puede pasear a lo largo
 * pero no se puede subir ni bajar: ya toca arriba y abajo. Sin esto, acercarse
 * y arrastrar metía relleno en el medio de la foto.
 *
 * Cuando el cuadrado es más grande que la foto en un eje —la foto entera lo es
 * siempre en el eje corto— no hay nada que elegir y queda centrado.
 */
export function centrarDentro(encuadre: Encuadre, width: number, height: number): Encuadre {
  const masLargo = Math.max(width, height);
  const lado = Math.min(1, encuadre.lado) * masLargo;

  const acotar = (centro: number, medida: number): number => {
    if (lado >= medida) return 0.5;
    const margen = lado / 2 / medida;
    return Math.min(1 - margen, Math.max(margen, centro));
  };

  return {
    cx: acotar(encuadre.cx, width),
    cy: acotar(encuadre.cy, height),
    lado: Math.min(1, encuadre.lado),
  };
}
