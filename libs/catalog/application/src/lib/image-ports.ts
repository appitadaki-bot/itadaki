import { type ImageEditParams, type ImageSet } from '@itadaki/catalog/domain';
import { type Result } from '@itadaki/shared/domain';
import { type RepositoryError } from './ports';

/** One stored image: the untouched original plus the params last applied. */
export interface StoredImage {
  readonly id: string;
  readonly tenantId: string;
  readonly originalPath: string;
  readonly params: ImageEditParams;
  readonly imageSet: ImageSet;
  readonly alt: string;
}

export interface ImageReader {
  findById(tenantId: string, imageId: string): Promise<Result<StoredImage, RepositoryError>>;
}

export interface ImageWriter {
  /** Persists the original once; re-edits reuse it rather than re-uploading. */
  saveOriginal(tenantId: string, imageId: string, data: Buffer): Promise<Result<string, RepositoryError>>;
  saveRecord(image: StoredImage): Promise<Result<StoredImage, RepositoryError>>;
  readOriginal(tenantId: string, imageId: string): Promise<Result<Buffer, RepositoryError>>;

  /**
   * Borra la foto entera, registro y bytes.
   *
   * La foto se guarda con el id del producto, así que un plato borrado deja la
   * suya sin dueño: la fila queda, los bytes también, y si mañana nace otro
   * producto con ese mismo id se la encuentra puesta.
   */
  remove(tenantId: string, imageId: string): Promise<Result<void, RepositoryError>>;
}

/** Renders the derivative set. Kept behind a port so sharp stays in infra. */
export interface ImageRenderer {
  render(
    original: Buffer,
    params: ImageEditParams,
    imageId: string,
    tenantId: string,
  ): Promise<Result<ImageSet, RepositoryError>>;

  /**
   * Deja el original en algo que se pueda guardar sin remordimiento.
   *
   * No devuelve `Result`: una foto que no se pudo achicar se guarda como vino.
   * Perder la subida por no haber podido ahorrar espacio sería un mal negocio.
   */
  shrinkOriginal(original: Buffer): Promise<Buffer>;
}
