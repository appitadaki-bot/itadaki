/**
 * Qué se renderiza de cada foto.
 *
 * Supo vivir acá el recorte —un cuadrado que el dueño elegía arrastrando— con
 * su validación y su editor. La foto ahora entra entera y el cuadrado se
 * rellena, así que no hay nada que elegir ni nada que validar: lo único que
 * queda es en qué medidas y formatos se guarda.
 */
/** Widths rendered for every image, largest first. */
export const VARIANT_WIDTHS = [1200, 600, 300, 80] as const;
export const VARIANT_FORMATS = ['avif', 'webp', 'jpeg'] as const;
