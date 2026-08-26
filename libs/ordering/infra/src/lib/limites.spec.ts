import {
  MAX_ACTIVE_ORDERS,
  MAX_ORDERS_IN_WINDOW,
  MAX_SESSION_ORDERS,
} from './postgres-orders';
import { MAX_PRODUCTS } from '@itadaki/catalog/infra';

/**
 * Los topes son el techo de lo que una petición puede cargar en memoria, no
 * una regla de negocio. Lo único que hay que fijar es que estén por encima de
 * lo que la realidad produce: un tope que se toca seguido deja de proteger y
 * empieza a recortar datos buenos.
 */
describe('los topes de los listados', () => {
  it('deja pasar una cocina desbordada', () => {
    // Cincuenta mesas con tres comandas cada una y nadie entregando.
    expect(MAX_ACTIVE_ORDERS).toBeGreaterThan(50 * 3);
  });

  it('deja pasar un cumpleaños de veinte que pide toda la noche', () => {
    // Veinte personas pidiendo de a una, cinco rondas.
    expect(MAX_SESSION_ORDERS).toBeGreaterThan(20 * 5);
  });

  it('deja pasar dos meses de un local muy movido', () => {
    // Trescientos pedidos por día durante los sesenta que se guardan crudos.
    expect(MAX_ORDERS_IN_WINDOW).toBeGreaterThanOrEqual(300 * 60);
  });

  it('deja pasar varias cartas largas juntas', () => {
    // Una carta larga de verdad ronda los doscientos.
    expect(MAX_PRODUCTS).toBeGreaterThan(200 * 3);
  });
});
