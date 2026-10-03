import { sembrarCarta, type ClienteSql } from './sembrar-carta';

/**
 * Qué deja —y qué no— la carta de ejemplo.
 *
 * Sembraba dos grupos de opciones del bife de chorizo: un punto de cocción
 * obligatorio y una guarnición con precio. El comensal entonces no podía
 * agregar el plato de la carta —le decía "Elegir opciones"— y el dueño del
 * local no tenía pantalla para cambiarlos ni para sacarlos, porque el panel
 * nunca tuvo una. Una elección obligatoria que nadie podía editar.
 *
 * Esto se fija contra lo que la siembra le pide a la base, no contra el texto
 * del archivo: el `for` puede volver escrito de otra forma y el síntoma sería
 * el mismo.
 */

/** Un cliente que sólo anota lo que le pidieron. */
const clienteQueAnota = (): { client: ClienteSql; consultas: string[] } => {
  const consultas: string[] = [];
  return {
    consultas,
    client: {
      query: async (texto: string): Promise<unknown> => {
        consultas.push(texto);
        return { rows: [], rowCount: 0 };
      },
    },
  };
};

describe('la carta de ejemplo', () => {
  it('no siembra grupos de opciones', async () => {
    const { client, consultas } = clienteQueAnota();

    await sembrarCarta(client, 'un-restaurante');

    expect(consultas.some((sql) => sql.includes('INSERT INTO modifier_groups'))).toBe(false);
  });

  it('pero sí borra los que haya, por si quedaron de antes', async () => {
    // Los restaurantes sembrados con la versión anterior los tienen cargados;
    // volver a sembrar es la forma de limpiarlos.
    const { client, consultas } = clienteQueAnota();

    await sembrarCarta(client, 'un-restaurante');

    expect(consultas.some((sql) => sql.includes('DELETE FROM modifier_groups'))).toBe(true);
  });

  it('y sigue dejando las categorías y los platos', async () => {
    // Sacar las opciones no tenía que vaciar la carta: sin platos la demo no
    // muestra nada.
    const { client, consultas } = clienteQueAnota();

    await sembrarCarta(client, 'un-restaurante');

    expect(consultas.some((sql) => sql.includes('INSERT INTO categories'))).toBe(true);
    expect(consultas.some((sql) => sql.includes('INSERT INTO products'))).toBe(true);
  });
});
