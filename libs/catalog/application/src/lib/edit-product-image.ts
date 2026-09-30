import { type Result, err, ok } from '@itadaki/shared/domain';
import { type ImageReader, type ImageRenderer, type ImageWriter, type StoredImage } from './image-ports';
import { type RepositoryError } from './ports';

export type ImageEditFailure = RepositoryError;

export interface UploadImageCommand {
  readonly tenantId: string;
  readonly imageId: string;
  readonly original: Buffer;
  readonly alt: string;
}

/** First upload: stores the original, renders the set, records both. */
export function uploadImage(deps: {
  images: ImageWriter;
  renderer: ImageRenderer;
}) {
  return async (command: UploadImageCommand): Promise<Result<StoredImage, ImageEditFailure>> => {
    // Se guarda achicado: el original existe para reeditar el encuadre, no
    // para servirse, y los doce megapíxeles de un teléfono no los descarga
    // nadie nunca. Se renderiza desde el que subieron, que todavía está entero
    // en memoria, así que esta primera vez no pierde nada.
    const paraGuardar = await deps.renderer.shrinkOriginal(command.original);

    const stored = await deps.images.saveOriginal(command.tenantId, command.imageId, paraGuardar);
    if (stored.isErr()) {
      return err(stored.error);
    }

    const rendered = await deps.renderer.render(
      command.original,
      command.imageId,
      command.tenantId,
    );
    if (rendered.isErr()) {
      return err(rendered.error);
    }

    return deps.images
      .saveRecord({
        id: command.imageId,
        tenantId: command.tenantId,
        originalPath: stored.value,
        imageSet: rendered.value,
        alt: command.alt,
      })
      .then((result) => (result.isErr() ? err(result.error) : ok(result.value)));
  };
}

export interface ReeditImageCommand {
  readonly tenantId: string;
  readonly imageId: string;
  readonly alt?: string;
}

/**
 * Vuelve a renderizar desde el original guardado. Nada se sube de nuevo y no
 * se pierde calidad, porque cada render arranca del archivo intacto y no de
 * la salida anterior. Sirve para cambiar el texto alternativo, y para volver
 * a generar las variantes si cambia cómo se arman.
 */
export function reeditImage(deps: {
  images: ImageReader & ImageWriter;
  renderer: ImageRenderer;
}) {
  return async (command: ReeditImageCommand): Promise<Result<StoredImage, ImageEditFailure>> => {
    const existing = await deps.images.findById(command.tenantId, command.imageId);
    if (existing.isErr()) {
      return err(existing.error);
    }

    const original = await deps.images.readOriginal(command.tenantId, command.imageId);
    if (original.isErr()) {
      return err(original.error);
    }

    const rendered = await deps.renderer.render(
      original.value,
      command.imageId,
      command.tenantId,
    );
    if (rendered.isErr()) {
      return err(rendered.error);
    }

    const record = await deps.images.saveRecord({
      ...existing.value,
      imageSet: rendered.value,
      alt: command.alt ?? existing.value.alt,
    });

    return record.isErr() ? err(record.error) : ok(record.value);
  };
}
