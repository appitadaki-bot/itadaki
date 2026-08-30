/**
 * Tope de pedidos por IP.
 *
 * Escrito a mano y no con `@nestjs/throttler`, por lo mismo que los headers de
 * seguridad se escriben acá y no con helmet: son treinta líneas y una
 * dependencia menos que actualizar.
 *
 * La cuenta vive en memoria, así que cada instancia lleva la suya. Con una
 * sola instancia corriendo eso es exacto; con varias, el tope real es el
 * número de instancias por este. Alcanza: esto no está para repartir cuota
 * sino para que nadie martille la API desde una máquina.
 */

/** Cuántos pedidos y en cuánto tiempo. */
export interface Cupo {
  readonly limite: number;
  readonly ventanaMs: number;
}

export interface Cubo {
  usados: number;
  /** Cuándo vuelve a cero, en milisegundos epoch. */
  vence: number;
}

/**
 * Ventana fija: al primer pedido arranca el reloj y a los `ventanaMs` se
 * reinicia la cuenta.
 *
 * Una ventana deslizante sería más justa en el borde —quien gasta todo al
 * final de una ventana puede gastar todo de nuevo al principio de la
 * siguiente— pero pide guardar cada marca de tiempo en vez de un número.
 */
export function consumir(cubo: Cubo | undefined, ahora: number, cupo: Cupo): {
  readonly cubo: Cubo;
  readonly permitido: boolean;
  readonly esperarSegundos: number;
} {
  const vigente = cubo !== undefined && cubo.vence > ahora;
  const actual: Cubo = vigente
    ? (cubo as Cubo)
    : { usados: 0, vence: ahora + cupo.ventanaMs };

  if (actual.usados >= cupo.limite) {
    return {
      cubo: actual,
      permitido: false,
      esperarSegundos: Math.max(1, Math.ceil((actual.vence - ahora) / 1000)),
    };
  }

  actual.usados += 1;
  return { cubo: actual, permitido: true, esperarSegundos: 0 };
}

/**
 * Saca los cubos vencidos.
 *
 * Sin esto el mapa guarda una entrada por cada IP que pasó alguna vez, y eso
 * sólo crece: un proceso que corre semanas termina con la memoria llena de
 * cuentas de gente que ya se fue.
 */
export function purgar(cubos: Map<string, Cubo>, ahora: number): void {
  for (const [clave, cubo] of cubos) {
    if (cubo.vence <= ahora) cubos.delete(clave);
  }
}

/**
 * Los tres topes.
 *
 * Entrar es lo caro de proteger: cada intento verifica una contraseña, y quien
 * prueba de a miles busca acertar una. El resto es tráfico normal de una mesa
 * —la carta con sus fotos son veinte pedidos de una— así que el tope general
 * es alto: está para frenar una máquina, no a un comensal apurado.
 */
export const CUPO_ENTRAR: Cupo = { limite: 10, ventanaMs: 60_000 };
export const CUPO_GENERAL: Cupo = { limite: 300, ventanaMs: 60_000 };

/**
 * Sentarse a una mesa.
 *
 * Tiene su propio tope porque no es lo mismo que probar una contraseña, aunque
 * hasta ahora compartían el de 10 por minuto. Los comensales de un restaurante
 * salen todos por el mismo WiFi, así que para el servidor son una sola IP: un
 * grupo de doce que se sienta junto y escanea el QR gastaba el cupo entero y
 * los últimos dos veían un error, y un sábado con veinte mesas rotando lo
 * gastaba el salón entero.
 *
 * Se descubrió probando veinte mesas pidiendo a la vez: entraron nueve.
 *
 * El riesgo es mucho menor que el del login. Unirse no verifica ninguna
 * credencial secreta —hace falta el token de la mesa, que sale del QR
 * impreso— así que no hay nada que adivinar a fuerza de intentos. El tope
 * sigue existiendo para que una máquina no abra sesiones sin fin, pero puede
 * ser el de un salón lleno y no el de un formulario de contraseña.
 */
export const CUPO_SENTARSE: Cupo = { limite: 120, ventanaMs: 60_000 };

/** Las rutas donde se prueba una credencial. */
export function esIntentoDeEntrar(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/password')
  );
}

/** Sentarse a una mesa desde el QR. */
export function esSentarseAUnaMesa(url: string): boolean {
  return url.includes('/sessions/join');
}

/** Cada cuántas escrituras se barren los cubos vencidos. */
const CADA = 500;

export interface PedidoMinimo {
  readonly ip?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

export interface RespuestaMinima {
  status(codigo: number): RespuestaMinima;
  setHeader(nombre: string, valor: string): void;
  json(cuerpo: unknown): void;
}

/**
 * El middleware, con su memoria adentro.
 *
 * Salud queda afuera a propósito: Render la consulta cada pocos segundos y no
 * tiene sentido que el propio orquestador se quede sin cuota.
 */
export function limitadorPorIp(ahora: () => number = Date.now) {
  const cubos = new Map<string, Cubo>();
  let escrituras = 0;

  return (pedido: PedidoMinimo, respuesta: RespuestaMinima, siguiente: () => void): void => {
    const url = pedido.originalUrl ?? pedido.url ?? '';
    if (url.includes('/health')) {
      siguiente();
      return;
    }

    const instante = ahora();
    escrituras += 1;
    if (escrituras % CADA === 0) purgar(cubos, instante);

    const entrando = esIntentoDeEntrar(url);
    const sentandose = esSentarseAUnaMesa(url);
    const cupo = entrando ? CUPO_ENTRAR : sentandose ? CUPO_SENTARSE : CUPO_GENERAL;
    // Cuentas separadas: gastar la cuota mirando la carta no puede dejar a esa
    // misma mesa sin poder entrar.
    const clave = `${entrando ? 'entrar' : sentandose ? 'sentarse' : 'todo'}:${pedido.ip ?? 'desconocida'}`;

    const paso = consumir(cubos.get(clave), instante, cupo);
    cubos.set(clave, paso.cubo);

    if (!paso.permitido) {
      respuesta.setHeader('Retry-After', String(paso.esperarSegundos));
      respuesta.status(429).json({ kind: 'DEMASIADOS_PEDIDOS', esperarSegundos: paso.esperarSegundos });
      return;
    }

    siguiente();
  };
}
