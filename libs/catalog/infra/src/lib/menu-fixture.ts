import { type Category, type ModifierGroup, type Product } from '@itadaki/catalog/domain';
import { Money } from '@itadaki/shared/domain';

const TENANT = 'itadaki';

const ars = (minor: number): Money => {
  const result = Money.of(minor, 'ARS');
  if (result.isErr()) {
    throw new Error(`invalid fixture price: ${minor}`);
  }
  return result.value;
};

/**
 * Sample menu for the demo tenant: a neighbourhood parrilla/bodegón, the most
 * common kind of restaurant this would be sold into. The catalog itself is
 * cuisine-agnostic — this fixture is data, not a constraint.
 */
export const CATEGORIES: readonly Category[] = [
  { id: 'entradas', tenantId: TENANT, name: 'Entradas', sortOrder: 1, availability: null },
  { id: 'parrilla', tenantId: TENANT, name: 'Parrilla', sortOrder: 2, availability: null },
  { id: 'milanesas', tenantId: TENANT, name: 'Milanesas', sortOrder: 3, availability: null },
  { id: 'bebidas', tenantId: TENANT, name: 'Bebidas', sortOrder: 4, availability: null },
  { id: 'postres', tenantId: TENANT, name: 'Postres', sortOrder: 5, availability: null },
];

export const PRODUCTS: readonly Product[] = [
  {
    id: 'e1',
    tenantId: TENANT,
    categoryId: 'entradas',
    name: 'Empanadas de carne',
    description: 'media docena, carne cortada a cuchillo',
    price: ars(340_000),
    images: null,
    allergens: ['GLUTEN'],
    diets: [],
    estimatedPrepMinutes: 8,
    available: true,
  },
  {
    id: 'e2',
    tenantId: TENANT,
    categoryId: 'entradas',
    name: 'Provoleta a la parrilla',
    description: 'provolone, orégano y aceite de oliva',
    price: ars(310_000),
    images: null,
    allergens: ['LACTOSE'],
    diets: ['VEGETARIAN', 'GLUTEN_FREE'],
    estimatedPrepMinutes: 6,
    available: false,
  },
  {
    id: 'a1',
    tenantId: TENANT,
    categoryId: 'parrilla',
    name: 'Bife de chorizo',
    description: '400g con guarnición a elección',
    price: ars(820_000),
    images: null,
    allergens: [],
    diets: ['GLUTEN_FREE', 'LACTOSE_FREE'],
    estimatedPrepMinutes: 14,
    available: true,
  },
  {
    id: 'a2',
    tenantId: TENANT,
    categoryId: 'parrilla',
    name: 'Vacío al horno de barro',
    description: 'cocción lenta 3hs, papas españolas',
    price: ars(790_000),
    images: null,
    allergens: [],
    diets: ['GLUTEN_FREE', 'LACTOSE_FREE'],
    estimatedPrepMinutes: 12,
    available: true,
  },
  {
    id: 'm1',
    tenantId: TENANT,
    categoryId: 'milanesas',
    name: 'Milanesa napolitana',
    description: 'ternera, jamón, salsa y muzzarella',
    price: ars(740_000),
    images: null,
    allergens: ['GLUTEN', 'EGG', 'LACTOSE'],
    diets: [],
    estimatedPrepMinutes: 11,
    available: true,
  },
  {
    id: 'b1',
    tenantId: TENANT,
    categoryId: 'bebidas',
    name: 'Limonada con menta',
    description: 'jarra de un litro, bien fría',
    price: ars(150_000),
    images: null,
    allergens: [],
    diets: ['VEGAN', 'VEGETARIAN', 'GLUTEN_FREE', 'LACTOSE_FREE'],
    estimatedPrepMinutes: 2,
    available: true,
  },
  {
    id: 'p1',
    tenantId: TENANT,
    categoryId: 'postres',
    name: 'Flan casero con dulce',
    description: 'con dulce de leche y crema',
    price: ars(260_000),
    images: null,
    allergens: ['EGG', 'LACTOSE'],
    diets: ['VEGETARIAN', 'GLUTEN_FREE'],
    estimatedPrepMinutes: 4,
    available: true,
  },
];

export const MODIFIER_GROUPS: readonly ModifierGroup[] = [
  {
    id: 'g-parrilla-punto',
    productId: 'a1',
    name: 'Punto de cocción',
    minSelections: 1,
    maxSelections: 1,
    modifiers: [
      { id: 'm1', name: 'Jugoso', priceDelta: ars(0), available: true },
      { id: 'm2', name: 'A punto', priceDelta: ars(0), available: true },
      { id: 'm3', name: 'Bien cocido', priceDelta: ars(0), available: true },
    ],
  },
  {
    id: 'g-parrilla-guarnicion',
    productId: 'a1',
    name: 'Guarnición',
    minSelections: 0,
    maxSelections: 2,
    modifiers: [
      { id: 'm4', name: 'Papas fritas', priceDelta: ars(80_000), available: true },
      { id: 'm5', name: 'Ensalada mixta', priceDelta: ars(70_000), available: true },
      { id: 'm6', name: 'Puré de calabaza', priceDelta: ars(90_000), available: true },
    ],
  },
];

export const TENANT_ID = TENANT;
