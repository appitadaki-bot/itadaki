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
/**
 * En qué formatos se guarda cada medida.
 *
 * Supo estar AVIF y se fue: era casi la mitad del trabajo de cada subida
 * —medido, 200 ms de los 450 que tardan las doce variantes en una máquina de
 * escritorio, y el servidor tiene una décima de procesador— a cambio de unos
 * kilobytes en fotos que ya pesan poco. El dueño esperaba eso mirando la
 * pantalla, plato por plato, mientras carga la carta.
 *
 * Las fotos que ya tienen su AVIF lo siguen teniendo y se sigue sirviendo: lo
 * que cambia es que no se genera más.
 */
export const VARIANT_FORMATS = ['webp', 'jpeg'] as const;
