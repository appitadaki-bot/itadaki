import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un plato anulado se ve como anulado en las cuatro pantallas.
 *
 * La caja sacó un plato de la cuenta y el sistema mostró tres cosas distintas:
 * la cocina decía "entregado", el comensal "enviado", y el mozo lo seguía
 * teniendo en el pase. Ninguna era cierta.
 *
 * Eran dos fallas encimadas. Sacar de la cuenta no tocaba el pedido —el plato
 * quedaba con su estado anterior— y además las pantallas usaban un `else` que
 * juntaba todo lo que no reconocían: `status === 'READY' ? ... : 'entregado'`
 * convierte un plato anulado en uno servido.
 *
 * Es el tipo de falla que no se ve en un test de lógica: cada parte hacía lo
 * suyo y el conjunto mentía.
 */

const APPS = join(__dirname, '..', '..');
const leer = (...ruta: string[]): string =>
  readFileSync(join(APPS, ...ruta), 'utf-8').replace(/\r\n/g, '\n');

const COCINA = leer('kds-web', 'src', 'app', 'kds.component.ts');
const COMENSAL = leer('diner-pwa', 'src', 'app', 'tracking.page.ts');
const SALON_STORE = leer('floor-web', 'src', 'app', 'floor.store.ts');
const SALON = leer('floor-web', 'src', 'app', 'floor.component.ts');
const CUENTA = readFileSync(join(__dirname, 'bills.controller.ts'), 'utf-8');

describe('sacar un plato de la cuenta', () => {
  it('también lo anula en el pedido', () => {
    // Si sólo sale de la cuenta, las otras tres pantallas lo siguen mostrando
    // como si nada hubiera pasado.
    const endpoint = CUENTA.slice(CUENTA.indexOf('async quitarDeLaCuenta'));
    expect(endpoint.slice(0, endpoint.indexOf('\n  }'))).toContain('anularPlato(');
  });

  it('y guarda la cuenta antes de anular', () => {
    // Si anular falla, el plato ya salió de lo que se cobra —que es lo que el
    // cliente tiene delante— y el resto se corrige mirando el log. Al revés se
    // cobraría un plato que las pantallas ya dan por anulado.
    const endpoint = CUENTA.slice(CUENTA.indexOf('async quitarDeLaCuenta'));
    const cuerpo = endpoint.slice(0, endpoint.indexOf('\n  }'));

    expect(cuerpo.indexOf('bills.store.save')).toBeLessThan(cuerpo.indexOf('anularPlato('));
  });
});

describe('cada pantalla lo nombra', () => {
  it('la cocina dice "anulado", no "entregado"', () => {
    const etiqueta = COCINA.slice(COCINA.indexOf('protected doneLabel'));
    const cuerpo = etiqueta.slice(0, etiqueta.indexOf('\n  }'));

    expect(cuerpo).toContain("status === 'CANCELLED'");
    // El `else` suelto es lo que convertía un anulado en un servido.
    expect(cuerpo.indexOf("'CANCELLED'")).toBeLessThan(cuerpo.indexOf("return 'entregado'"));
  });

  it('y el comensal dice que no se pudo hacer', () => {
    const etiqueta = COMENSAL.slice(COMENSAL.indexOf('protected dishState'));
    const cuerpo = etiqueta.slice(0, etiqueta.indexOf('\n  }'));

    expect(cuerpo).toContain("status === 'CANCELLED'");
    expect(cuerpo.indexOf("'CANCELLED'")).toBeLessThan(cuerpo.indexOf("return 'enviado'"));
  });
});

describe('y deja de contar como trabajo pendiente', () => {
  it('el salón no lo muestra en cocina', () => {
    // El filtro era "todo lo que no salió", y un anulado no sale nunca: se
    // quedaba ahí para siempre.
    const cooking = SALON_STORE.slice(SALON_STORE.indexOf('readonly cooking = computed'));
    expect(cooking.slice(0, cooking.indexOf('),'))).toContain("!== 'CANCELLED'");
  });

  it('ni ofrece sacarlo de nuevo', () => {
    const enCocina = SALON.slice(SALON.indexOf('protected enCocina'));
    expect(enCocina.slice(0, enCocina.indexOf('\n  }'))).toContain("!== 'CANCELLED'");
  });

  it('y el comensal no lo espera', () => {
    // Contándolo, el "2 de 3" nunca llegaba a 3 y el pedido se veía
    // eternamente a medias.
    expect(COMENSAL).toContain("dish.status !== 'CANCELLED'");

    const paso = COMENSAL.slice(COMENSAL.indexOf('overallStep = computed'));
    expect(paso.slice(0, paso.indexOf('});'))).toContain('enPie()');
  });
});
