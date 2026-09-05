import { type Interesado } from './interesado';

/**
 * El correo que nos avisa que alguien dejó sus datos en la landing.
 *
 * El formulario guardaba la fila y nada más. La pantalla le promete al
 * restaurante que le escribimos por WhatsApp dentro de las 24 horas hábiles, y
 * cumplir eso dependía de que alguien se acordara de mirar la tabla. Un
 * interesado que espera dos días el mensaje que le prometimos ya no contesta.
 */

/**
 * A quiénes se les avisa.
 *
 * Varios, separados por coma: el alta la atiende quien esté disponible, y
 * mandarlo a una sola casilla hace que un fin de semana se pierda. Se limpian
 * los espacios y se descartan los repetidos —una lista mal pegada tenía la
 * misma dirección dos veces y llegaban dos correos iguales.
 */
export function destinatariosDelAviso(crudo: string): readonly string[] {
  const vistos = new Set<string>();
  const limpios: string[] = [];

  for (const parte of crudo.split(',')) {
    const direccion = parte.trim();
    if (direccion === '') continue;

    const clave = direccion.toLowerCase();
    if (vistos.has(clave)) continue;

    vistos.add(clave);
    limpios.push(direccion);
  }

  return limpios;
}

const COMO_LO_TIENE: Record<Interesado['carta'], string> = {
  link: 'tiene la carta en un link',
  foto: 'la tiene en fotos',
  papel: 'la tiene en papel',
};

export interface CorreoDeInteresado {
  readonly subject: string;
  readonly body: string;
}

/**
 * Qué dice el correo.
 *
 * Todo lo que hace falta para levantar el teléfono, en el cuerpo del mensaje:
 * quien lo atienda no debería tener que abrir la base para saber a qué número
 * escribir. Lo que dice sobre la carta va primero de lo opcional, porque es lo
 * que decide cuánto trabajo es esta alta.
 */
export function correoDeInteresado(interesado: Interesado, id: string): CorreoDeInteresado {
  const lineas = [
    `Local:     ${interesado.local}`,
    `Contacto:  ${interesado.nombre}`,
    `WhatsApp:  ${interesado.whatsapp}`,
  ];

  if (interesado.email !== null) lineas.push(`Mail:      ${interesado.email}`);
  if (interesado.mesas !== null) lineas.push(`Mesas:     ${interesado.mesas}`);

  lineas.push(`Carta:     ${COMO_LO_TIENE[interesado.carta]}`);
  if (interesado.cartaLink !== null) lineas.push(`Link:      ${interesado.cartaLink}`);

  return {
    subject: `Nuevo interesado: ${interesado.local}`,
    body: [
      `${interesado.nombre} dejó sus datos en la landing.`,
      '',
      ...lineas,
      '',
      'Le prometimos un WhatsApp dentro de las 24 horas hábiles.',
      '',
      `Para marcarlo como atendido:`,
      `  UPDATE interesados SET atendido_en = now() WHERE id = '${id}';`,
    ].join('\n'),
  };
}
