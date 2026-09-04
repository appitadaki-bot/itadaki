import { apiUrl, socketUrl } from '@itadaki/shared/domain';
import { ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import {
  API_BASE_URL,
  CATEGORY_READER,
  MODIFIER_GROUPS_TOKEN,
  PRODUCT_READER,
  TENANT,
  WS_URL,
} from './app/catalog.tokens';
import { HttpCatalog, HttpCategoryReader } from './app/http-catalog';
import { OfflineStore } from './app/offline.store';
// Imported for its module side effect: it grabs `?t=` from the URL before the
// router redirects '' to bienvenida and drops the query string.
import './app/table-token.store';
import { MARCA, hayQueRecargar } from './app/version-nueva';

/**
 * Recuperarse de un despliegue con la app abierta.
 *
 * Al publicar una versión nueva cambian los nombres de los archivos de cada
 * pantalla. El teléfono que venía usando la app pide los viejos, el servidor
 * le devuelve el `index.html` por el rewrite de SPA, y la pantalla no carga.
 * Le pasa a alguien sentado en la mesa: toca "ver la cuenta" y la app deja de
 * andar, sin nada que pueda hacer al respecto.
 *
 * Recargar lo arregla, así que se recarga. Una sola vez por sesión: si vuelve
 * a fallar, el problema es otro y hay que dejarlo llegar a la pantalla en vez
 * de parpadear para siempre.
 */
class RecargarSiCambioLaVersion implements ErrorHandler {
  handleError(error: unknown): void {
    // Sin almacenamiento —una ventana privada, o el navegador bloqueándolo—
    // no se recarga: sin poder dejar la marca, sería un bucle.
    if (hayQueRecargar(error, this.yaSeIntento())) {
      try {
        sessionStorage.setItem(MARCA, '1');
      } catch {
        console.error(error);
        return;
      }
      globalThis.location.reload();
      return;
    }

    console.error(error);
  }

  private yaSeIntento(): boolean {
    try {
      return sessionStorage.getItem(MARCA) === '1';
    } catch {
      return true;
    }
  }
}

const API_URL = apiUrl();
// Tenant is app configuration, not server infrastructure: importing it from
// catalog/infra would drag sharp and node builtins into the browser bundle.
const TENANT_ID = 'itadaki';

/**
 * Composition root: the only place that knows the catalog comes over HTTP.
 * Screens depend on ProductReader/CategoryReader alone.
 */
void bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: ErrorHandler, useClass: RecargarSiCambioLaVersion },
    provideRouter(routes, withComponentInputBinding()),
    { provide: API_BASE_URL, useValue: API_URL },
    { provide: WS_URL, useValue: socketUrl() },
    {
      provide: PRODUCT_READER,
      useFactory: (offline: OfflineStore) => new HttpCatalog(API_URL, offline),
      deps: [OfflineStore],
    },
    {
      provide: CATEGORY_READER,
      useFactory: (reader: HttpCatalog) => new HttpCategoryReader(reader),
      deps: [PRODUCT_READER],
    },
    {
      provide: MODIFIER_GROUPS_TOKEN,
      useFactory: (reader: HttpCatalog) => () => reader.modifierGroups(),
      deps: [PRODUCT_READER],
    },
    { provide: TENANT, useValue: TENANT_ID },
  ],
}).catch((error: unknown) => {
  console.error('bootstrap failed', error);
});

/**
 * En desarrollo se saca de encima, en producción se instala.
 *
 * El worker y el navegador comparten origen entre una corrida de producción y
 * el servidor de desarrollo, así que el que quedó instalado al probar un
 * deploy seguía respondiendo en `localhost` y devolvía pantallas viejas: se
 * editaba el código, compilaba bien, y en el navegador no cambiaba nada.
 * Perseguir eso cuesta horas porque todo lo demás dice que está bien.
 */
const enDesarrollo =
  globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1';

if ('serviceWorker' in navigator) {
  if (enDesarrollo) {
    void navigator.serviceWorker.getRegistrations().then((registros) => {
      for (const registro of registros) void registro.unregister();
    });
  } else {
    globalThis.addEventListener('load', () => {
      void navigator.serviceWorker.register('sw.js').catch(() => {
        // Offline support degrades to the IndexedDB cache; not fatal.
      });
    });
  }
}
