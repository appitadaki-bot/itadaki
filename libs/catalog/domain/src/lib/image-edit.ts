import { type Result, err, ok } from '@itadaki/shared/domain';

/**
 * Crop box in normalised coordinates (0–1) relative to the source image.
 * Normalised rather than pixel-based so the same params re-render correctly
 * against any stored resolution of the original.
 */
export interface CropBox {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Lo único que el editor decide: qué parte de la foto se ve.
 *
 * Supo llevar también profundidad de campo y ajustes de brillo, saturación y
 * nitidez. Nadie los cargaba: el editor de la carta se dejó en recortar y
 * mover, así que llegaban siempre en su valor neutro y el renderizador hacía
 * el trabajo de no hacer nada.
 */
export interface ImageEditParams {
  readonly crop: CropBox;
}

export type ImageEditError = {
  readonly kind: 'CROP_OUT_OF_BOUNDS';
  readonly field: string;
  readonly value: number;
};

const inUnit = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

/** Centred square crop covering as much of the frame as the aspect allows. */
export function defaultCrop(): CropBox {
  return { x: 0, y: 0, size: 1 };
}

/**
 * Validates editor parameters before they reach the render pipeline.
 * A crop that runs past the edge would make sharp throw deep inside the
 * pipeline, so it is rejected here where the error is still meaningful.
 */
export function validateEditParams(params: ImageEditParams): Result<ImageEditParams, ImageEditError> {
  const { crop } = params;

  for (const [field, value] of [
    ['crop.x', crop.x],
    ['crop.y', crop.y],
    ['crop.size', crop.size],
  ] as const) {
    if (!inUnit(value)) {
      return err({ kind: 'CROP_OUT_OF_BOUNDS', field, value });
    }
  }

  if (crop.size <= 0) {
    return err({ kind: 'CROP_OUT_OF_BOUNDS', field: 'crop.size', value: crop.size });
  }
  if (crop.x + crop.size > 1.0001 || crop.y + crop.size > 1.0001) {
    return err({ kind: 'CROP_OUT_OF_BOUNDS', field: 'crop', value: crop.size });
  }

  return ok(params);
}

/** Widths rendered for every image, largest first. */
export const VARIANT_WIDTHS = [1200, 600, 300, 80] as const;
export const VARIANT_FORMATS = ['avif', 'webp', 'jpeg'] as const;
