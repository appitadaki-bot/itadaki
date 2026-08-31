import { apiUrl } from '@itadaki/shared/domain';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import { type ImageEditParams } from '@itadaki/catalog/domain';
import { ImageEditorComponent } from '@itadaki/shared/ui-image-editor';
import { moverEnLista } from './mover-en-lista';
import { AuthStore, LoginComponent } from '@itadaki/shared/ui-auth';
import { DecimalPipe } from '@angular/common';
import { MAX_DISHES, csvToMenuText, parseMenuText } from '@itadaki/catalog/domain';
import { QrSheetComponent } from './qr-sheet.component';
import { MetricsComponent } from './metrics.component';
import { type TableAssignment, orphanedTables } from '@itadaki/ordering/domain';

/**
 * Las tres cosas distintas que hace un dueño acá.
 *
 * Estaban las tres en la misma página, una debajo de otra: la carta entera,
 * el editor de fotos, el equipo, las mesas. Había que scrollear todo para
 * llegar a cualquier cosa, y nada indicaba dónde ir para cada tarea.
 */
type AdminTab = 'carta' | 'local' | 'ventas' | 'resenas';

const TABS: ReadonlyArray<{ id: AdminTab; label: string; hint: string }> = [
  { id: 'carta', label: 'Tu carta', hint: 'todo lo que vendés' },
  { id: 'local', label: 'Tu local', hint: 'mesas y equipo' },
  // Las ventas salen de "Tu local": mirar los números es otra tarea, en otro
  // momento del día, y estaban al pie de una pantalla de configuración.
  { id: 'ventas', label: 'Métricas', hint: 'ventas, tiempos y horarios' },
  { id: 'resenas', label: 'Reseñas', hint: 'opiniones en Google' },
];

const API = apiUrl();

/**
 * Cuánto queda en pantalla el aviso de que la foto se guardó.
 *
 * Lo que tarda en leerse una línea. Más corto se pierde si el ojo estaba en
 * la foto; más largo y sigue ahí cuando ya se está subiendo la siguiente.
 */
const SEGUNDOS_DEL_AVISO = 4;

/** Una pregunta de sí o no, con el nombre puesto en el botón que la cumple. */
interface PedidoDeConfirmacion {
  readonly titulo: string;
  readonly detalle: string;
  /** Lo que dice el botón: "Borrar la mesa" y no "Aceptar". */
  readonly accion: string;
  /** Si lo que sigue no se deshace, para pintarlo distinto. */
  readonly peligro: boolean;
}

/** Lo que propone el interruptor al prenderse; el local lo cambia y confirma. */
const DESCUENTO_SUGERIDO = 10;

interface MenuProduct {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  price: { amountInMinorUnits: number; currency: string };
  available: boolean;
  /** Lo que leen los filtros de la carta: vegano, sin gluten, etc. */
  diets: readonly string[];
  imageSet: { variants: Array<{ url: string; width: number; format: string }>; lqip: string } | null;
}

interface MenuCategory {
  id: string;
  name: string;
}

interface RestaurantTable {
  id: string;
  label: string;
  seats: number;
  url: string;
}

interface StaffMember {
  id: string;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
}

/**
 * Por qué no se pudo traer la carta de una URL.
 *
 * Cada uno dice qué hacer: la salida siempre es copiar y pegar, que es el
 * camino que ya funciona.
 */
const FETCH_ERRORS: Record<string, string> = {
  URL_INVALIDA: 'Esa dirección no es válida. Tiene que empezar con http:// o https://',
  DESTINO_NO_PERMITIDO: 'Esa dirección no es una página de internet.',
  NO_RESPONDE: 'La página no respondió. Probá copiando el texto y pegándolo acá.',
  NO_ES_UNA_PAGINA: 'Eso no es una página de texto — un PDF o una foto no los podemos leer. Copiá el texto y pegalo acá.',
  DEMASIADO_GRANDE: 'Esa página pesa demasiado. Copiá la parte de la carta y pegala acá.',
};

const ROLE_NAMES: Record<string, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Encargado',
  KITCHEN: 'Cocina',
  WAITER: 'Mozo',
};

@Component({
  selector: 'itd-admin',
  standalone: true,
  imports: [DecimalPipe, ImageEditorComponent, LoginComponent, QrSheetComponent, MetricsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin.component.css',
  template: `
    @if (!auth.ready()) {
      <p class="booting">Cargando…</p>
    } @else if (!auth.signedIn()) {
      <itd-login context="Administración" />
    } @else if (showQrSheet()) {
      <!-- Full screen: the print layout must own the page for @media print. -->
      <itd-qr-sheet [tables]="tables()" (close)="showQrSheet.set(false)" />
    } @else {
    <header class="head">
      <div>
        <p class="eyebrow">Administración</p>
        <h1 class="title">{{ tabTitle() }}</h1>
      </div>
      <div class="session">
        <span class="who">
          {{ auth.profile()?.displayName }}
          <em>{{ roleLabel() }}</em>
        </span>
        <button type="button" class="signout" (click)="auth.signOut()">Salir</button>
      </div>
    </header>

    <!-- Tres solapas en vez de una columna infinita.
         Antes la carta entera, el equipo, las mesas y el editor de fotos
         vivían apilados en la misma página: había que scrollear todo para
         llegar a cualquier cosa, y no se veía dónde ir para cada tarea. -->
    <nav class="tabs" aria-label="Secciones">
      @for (tab of tabs; track tab.id) {
        @if (canSee(tab.id)) {
          <button
            type="button"
            class="tab"
            [class.on]="activeTab() === tab.id"
            [attr.aria-current]="activeTab() === tab.id ? 'page' : null"
            (click)="activeTab.set(tab.id)"
          >
            <span class="tab-name">{{ tab.label }}</span>
            <span class="tab-hint">{{ tab.hint }}</span>
          </button>
        }
      }
    </nav>

    @if (trial(); as sub) {
      @if (sub.status === 'EXPIRED') {
        <section class="trial expired" role="alert">
          <strong>Se terminó tu mes de prueba.</strong>
          <span>
            Los comensales siguen pidiendo y la cocina sigue recibiendo, pero no
            podés cambiar la carta ni las mesas hasta que activemos tu cuenta.
            Escribinos y lo resolvemos.
          </span>
        </section>
      } @else if (sub.status === 'TRIAL_ENDING') {
        <section class="trial ending" role="status">
          <strong>
            Te {{ sub.daysLeft === 1 ? 'queda' : 'quedan' }} {{ sub.daysLeft }}
            {{ sub.daysLeft === 1 ? 'día' : 'días' }} de prueba.
          </strong>
          <span>Escribinos para seguir usándolo sin interrupciones.</span>
        </section>
      }
    }

    <div class="layout" [attr.data-tab]="activeTab()">

      <!-- Tu carta: los platos y cómo se organizan. -->
      @if (activeTab() === 'carta') {
      <section class="panel">
        @if (createdName(); as name) {
          <!-- Sobre la carta, no dentro del modal que acaba de cerrarse:
               acá se lee junto al plato que recién apareció. -->
          <p class="status created" role="status">
            <strong>{{ name }}</strong> ya está en tu carta ✓
          </p>
        }

        <!-- Sin título: la solapa ya dice "Carta", y repetir de qué se trata
             arriba de la lista de platos no agrega nada. -->
        <div class="panel-head">
          <!-- Crear abre su propia pantalla: pegado a la lista hacía
               dudar si el formulario editaba un plato o creaba otro. -->
          <div class="panel-actions">
            <!-- Cargar sesenta platos de a uno es lo que hace abandonar la
                 prueba antes de empezar. -->
            <button type="button" class="secondary" (click)="openImport()">
              Traer mi carta
            </button>
            <button type="button" class="create" (click)="openNew()">+ Agregar a la carta</button>
          </div>
        </div>



        <!-- Agrupado por categoría y en el orden de la carta, que es lo que
             el comensal va a ver. Antes era una lista plana alfabética, así
             que mover una categoría con las flechas de abajo no cambiaba nada
             en esta pantalla: la única forma de comprobar el cambio era abrir
             la app del comensal, y sin eso el botón parecía roto. -->
        <div class="products">
          @for (grupo of porCategoria(); track grupo.id) {
            <h3 class="cat-heading">
              {{ grupo.nombre }}
              <span class="cat-heading-count">{{ grupo.productos.length }}</span>
            </h3>

          @for (product of grupo.productos; track product.id) {
            <!-- Dos accesos en la misma fila, cada uno a lo suyo: la foto se
                 toca sobre la foto, y el resto abre la ficha del plato. Antes
                 la foto salía de un botón dentro de la ficha, que quedaba
                 abierta tapando la pantalla a la que acababa de llevar. -->
            <div class="product" [class.on]="selected() === product.id">
              <button
                type="button"
                class="product-foto"
                [attr.aria-label]="(thumb(product) ? 'Editar la foto de ' : 'Poner la foto de ') + product.name"
                (click)="irALaFoto(product.id)"
              >
                @if (thumb(product); as url) {
                  <img class="product-thumb" [src]="url" alt="" width="56" height="56" />
                } @else {
                  <span class="product-thumb empty" aria-hidden="true">
                    {{ initials(product.name) }}
                  </span>
                }
                <span class="product-foto-pista">
                  {{ thumb(product) ? 'Editar foto' : 'Poner foto' }}
                </span>
              </button>

              <button
                type="button"
                class="product-ficha"
                [attr.aria-pressed]="selected() === product.id"
                (click)="select(product.id)"
              >
                <span class="product-info">
                  <span class="product-name">{{ product.name }}</span>
                  <span class="product-meta">
                    <span class="product-price">{{ format(product.price) }}</span>
                    @if (!product.available) {
                      <span class="badge out">Sin stock</span>
                    }
                  </span>
                </span>
                <!-- Una flecha sola no dice qué abre: había que tocarla para
                     descubrir que era la ficha del plato y no otra cosa. -->
                <span class="product-abrir">Editar →</span>
              </button>
            </div>
          }
          } @empty {
            <p class="muted">Cargando la carta…</p>
          }
        </div>


        <details class="details manage-cats">
          <summary>Organizar categorías</summary>

          <div class="cat-list">
            @for (category of categories(); track category.id) {
              <div
                class="cat-row"
                [class.arrastrando]="arrastrando() === category.id"
                [class.destino]="sobre() === category.id && arrastrando() !== category.id"
                [attr.draggable]="agarrada() === category.id"
                (dragstart)="arrastrando.set(category.id)"
                (dragover)="$event.preventDefault(); sobre.set(category.id)"
                (dragleave)="sobre.set(null)"
                (drop)="$event.preventDefault(); soltarEn(category.id)"
                (dragend)="soltarNada()"
              >
                <!--
                  El arrastre se agarra de acá y no de toda la fila: al lado
                  hay un campo de texto, y arrastrar dentro de él para
                  seleccionar el nombre empezaba a mover la categoría.

                  Las flechas se quedan. Esto es del mouse: con el dedo o con
                  el teclado no existe, y el orden de la carta no puede
                  depender de tener un mouse.
                -->
                <span
                  class="cat-agarre"
                  aria-hidden="true"
                  title="Arrastrá para cambiar el orden"
                  (mousedown)="agarrada.set(category.id)"
                  (mouseup)="agarrada.set(null)"
                >⠿</span>
                <input
                  class="cat-name"
                  [value]="category.name"
                  maxlength="40"
                  [attr.aria-label]="'Nombre de ' + category.name"
                  (blur)="renameCategory(category.id, $event)"
                />
                <span class="cat-count">{{ countIn(category.id) }}</span>
                <button
                  type="button"
                  class="cat-move"
                  [disabled]="$first"
                  aria-label="Subir"
                  (click)="moveCategory(category.id, -1)"
                >↑</button>
                <button
                  type="button"
                  class="cat-move"
                  [disabled]="$last"
                  aria-label="Bajar"
                  (click)="moveCategory(category.id, 1)"
                >↓</button>
                <button
                  type="button"
                  class="cat-del"
                  [disabled]="countIn(category.id) > 0"
                  [attr.title]="countIn(category.id) > 0 ? 'primero movés lo que tiene' : 'eliminar'"
                  aria-label="Eliminar categoría"
                  (click)="deleteCategory(category.id)"
                >×</button>
              </div>
            }
          </div>

          <form class="new-form" (submit)="createCategory($event)">
            <label class="field">
              <span>Nueva categoría</span>
              <input name="name" required maxlength="40" placeholder="Ej: parrilla, entradas, vinos" />
            </label>
            <button type="submit" class="create">Crear categoría</button>
          </form>

          @if (catError(); as error) {
            <p class="status error">{{ error }}</p>
          }
        </details>
      </section>
      }

      <!-- Tu local: mesas, equipo y ventas. -->
      @if (activeTab() === 'local') {
      <!-- Antes de las mesas: es una decisión de cuánto cobrás, no de cómo
           está armado el salón, y quien entra acá a configurar el local lo
           primero que quiere resolver es eso. -->
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Descuento por pagar en efectivo</h2>
          <!-- Una casilla de siempre con role de interruptor: el navegador ya
               sabe marcarla, enfocarla y anunciarla; el CSS le da la forma. -->
          <label class="switch">
            <input
              type="checkbox"
              role="switch"
              [checked]="descuentoActivo()"
              (change)="alternarDescuento()"
              aria-label="Activar el descuento por pagar en efectivo"
            />
            <span class="switch-pista" aria-hidden="true"></span>
          </label>
        </div>

        @if (descuentoActivo()) {
        <p class="panel-lede">
          Si lo activás, la mesa lo ve al elegir cómo paga y el total baja solo.
          El mozo cobra lo que dice la pantalla, sin hacer cuentas.
        </p>

        <div class="descuento-fila">
          <label class="descuento-campo">
            <span class="descuento-label">Descuento</span>
            <span class="descuento-input">
              <input
                type="number"
                min="0"
                max="50"
                step="1"
                inputmode="numeric"
                [value]="descuento()"
                (input)="cambiarDescuento($event)"
                aria-label="Porcentaje de descuento por pagar en efectivo"
              />
              <span class="descuento-signo" aria-hidden="true">%</span>
            </span>
          </label>

          <button
            type="button"
            class="create"
            [disabled]="guardandoDescuento() || descuento() === descuentoGuardado()"
            (click)="guardarDescuento()"
          >
            {{ guardandoDescuento() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>

        <!-- Un ejemplo con plata, no un porcentaje suelto: "10%" no dice
             cuánto resigna el local hasta que uno hace la cuenta. -->
        @if (descuento() > 0) {
          <p class="descuento-ejemplo">
            Una mesa de {{ format(ejemploConsumo) }} pagaría
            <strong>{{ format(ejemploConDescuento()) }}</strong> en efectivo.
            Resignás {{ format(ejemploAhorro()) }} y te ahorrás la comisión de
            la tarjeta.
          </p>
        } @else {
          <p class="descuento-ejemplo apagado">
            En cero no aparece en ninguna pantalla. Poné un número para
            activarlo.
          </p>
        }

        @if (descuentoError(); as error) {
          <p class="error" role="alert">{{ error }}</p>
        }
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Mesas y códigos QR</h2>
          <!-- Arriba y no al pie: con veinte mesas cargadas, agregar una
               obligaba a bajar la lista entera para llegar al campo. -->
          <button type="button" class="panel-action" (click)="nuevaMesa.set(!nuevaMesa())">
            {{ nuevaMesa() ? 'Cancelar' : '+ Nueva mesa' }}
          </button>
        </div>
        <p class="panel-lede">
          Si repartís las mesas, cada mozo abre su app y ve solamente su sector.
          Las que dejes en "todo el salón" las siguen viendo todos.
        </p>

        @if (nuevaMesa()) {
          <form class="new-form" (submit)="createTable($event)">
            <label class="field">
              <span>Nombre de la mesa</span>
              <input name="label" required maxlength="40" placeholder="Ej: Mesa 8, Barra 2" autofocus />
            </label>
            <button type="submit" class="create">Crear mesa</button>
          </form>
        }

        <!-- El aviso del confirm se ve una vez y se olvida. Esto queda hasta
             que alguien lo resuelva, porque una mesa que no aparece en la app
             de nadie no se nota hasta que el cliente reclama. -->
        @if (orphaned().length > 0) {
          <p class="orphan-warn" role="alert">
            <strong>
              {{ orphaned().length === 1 ? 'Una mesa quedó' : orphaned().length + ' mesas quedaron' }}
              sin mozo.
            </strong>
            @for (id of orphaned(); track id) {
              <span class="orphan-table">{{ tableLabel(id) }}</span>
            }
            <span class="orphan-why">
              {{ orphaned().length === 1 ? 'Está' : 'Están' }} asignadas a alguien que ya no
              trabaja acá, así que no {{ orphaned().length === 1 ? 'aparece' : 'aparecen' }} en la
              app de ningún mozo. Elegí otro abajo, o dejalas en "todo el salón".
            </span>
          </p>
        }
        <details class="details manage-tables" open>
          <summary>Ver las mesas</summary>

          @if (tableError(); as message) {
            <p class="status error" role="alert">{{ message }}</p>
          }

          <div class="table-list">
            @for (table of tables(); track table.id) {
              <div class="table-row">
                @if (editingTable() === table.id) {
                  <!-- Se edita en la misma fila: abrir otra pantalla para
                       corregir un nombre hace perder de vista el resto del
                       salón, que es contra lo que se compara al renombrar. -->
                  <form class="table-edit" (submit)="saveTable(table, $event)">
                    <input
                      class="table-edit-label"
                      name="label"
                      [value]="table.label"
                      maxlength="40"
                      required
                      aria-label="Nombre de la mesa"
                    />
                    <input
                      class="table-edit-seats"
                      name="seats"
                      type="number"
                      [value]="table.seats"
                      min="1"
                      max="30"
                      required
                      aria-label="Lugares"
                    />
                    <button type="submit" class="table-save">Guardar</button>
                    <button type="button" class="table-cancel" (click)="editingTable.set(null)">
                      Cancelar
                    </button>
                  </form>
                } @else {
                <div class="table-info">
                  <span class="table-label">{{ table.label }}</span>
                  <span class="table-seats">{{ table.seats }} lugares</span>
                </div>

                <div class="table-actions">
                  <button type="button" class="table-copy" (click)="copyLink(table)">
                    {{ copied() === table.id ? '¡Copiado!' : 'Copiar link' }}
                  </button>
                  <button
                    type="button"
                    class="table-rotate"
                    (click)="rotate(table)"
                    title="Invalida los QR ya impresos de esta mesa"
                  >
                    Renovar QR
                  </button>
                  <button type="button" class="table-edit-btn" (click)="editingTable.set(table.id)">
                    Editar
                  </button>
                  <button
                    type="button"
                    class="table-delete"
                    (click)="removeTable(table)"
                    title="Saca la mesa del salón"
                  >
                    Borrar
                  </button>
                </div>
                }
              </div>
            } @empty {
              <p class="muted">Todavía no cargaste ninguna mesa.</p>
            }
          </div>

          @if (tables().length > 0) {
            <button type="button" class="print-all" (click)="showQrSheet.set(true)">
              Ver e imprimir los QR ({{ tables().length }})
            </button>
          }

          <p class="muted qr-hint">
            El link es el QR de esa mesa. Vence a las 8 horas y se renueva solo cada vez que abrís esta pantalla.
          </p>
        </details>

      </section>

      @if (auth.can('staff:manage') && waiters().length > 0) {
        <section class="panel">
          <h2 class="panel-title">Reparto del salón</h2>
          <p class="panel-lede">
            El sector habitual de cada uno. Se carga una vez: cuando el mozo
            entra al turno desde su app, ve solamente estas mesas. Las de quien
            hoy no vino las siguen viendo todos.
          </p>

          @if (orphaned().length > 0) {
            <p class="orphan-warn" role="alert">
              <strong>
                {{ orphaned().length === 1 ? 'Una mesa quedó' : orphaned().length + ' mesas quedaron' }}
                sin mozo.
              </strong>
              @for (id of orphaned(); track id) {
                <span class="orphan-table">{{ tableLabel(id) }}</span>
              }
              <span class="orphan-why">
                {{ orphaned().length === 1 ? 'Está' : 'Están' }} asignadas a alguien que ya no
                trabaja acá. Pasalas a otro abajo, o dejalas sin asignar.
              </span>
            </p>
          }

          <!-- Todo el reparto de un vistazo: con un desplegable por fila hacía
               falta abrir veinte menús para ver quién tenía qué. -->
          <div class="sectors">
            @for (mozo of waiters(); track mozo.id) {
              <div class="sector">
                <p class="sector-head">
                  <span class="sector-name">{{ mozo.displayName }}</span>
                  <span class="sector-count">{{ tablesOf(mozo.id).length }}</span>
                </p>
                <div class="sector-tables">
                  @for (table of tables(); track table.id) {
                    <button
                      type="button"
                      class="sector-chip"
                      [class.on]="isAssigned(table.id, mozo.id)"
                      (click)="toggleTable(table.id, mozo.id)"
                    >
                      {{ table.label }}
                    </button>
                  }
                </div>
              </div>
            }

            <div class="sector free">
              <p class="sector-head">
                <span class="sector-name">Sin asignar</span>
                <span class="sector-count">{{ unassigned().length }}</span>
              </p>
              <p class="sector-hint">Las ve todo el salón.</p>
              <div class="sector-tables">
                @for (id of unassigned(); track id) {
                  <span class="sector-chip idle">{{ tableLabel(id) }}</span>
                }
              </div>
            </div>
          </div>

          @if (staffError(); as message) {
            <p class="error-note" role="alert">{{ message }}</p>
          }
        </section>
      }

      @if (auth.can('staff:manage')) {
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">Tu equipo</h2>
            <button type="button" class="panel-action" (click)="modal.set('equipo')">
              + Agregar persona
            </button>
          </div>
          <p class="panel-lede">
            Quién entra a cada pantalla. La cocina no toca precios y el mozo no
            edita la carta.
          </p>
          <details class="details manage-staff" open>
            <summary>Ver el equipo</summary>

            <!-- El link con el que entra el personal. Va acá y también junto a
                 cada PIN recién generado: acá para cuando alguien lo pierda,
                 y allá para mandar los tres datos de una. -->
            <div class="link-del-local">
              <p class="link-titulo">Por acá entra tu equipo</p>
              <p class="link-valor">{{ linkDelLocal() }}</p>
              <button type="button" class="secondary" (click)="copiarLink()">
                {{ copiadoLink() ? 'Copiado ✓' : 'Copiar el link' }}
              </button>
            </div>

            <div class="staff-list">
              @for (member of staff(); track member.id) {
                <div class="staff-row" [class.inactive]="!member.active">
                  <div class="staff-info">
                    <span class="staff-name">{{ member.displayName }}</span>
                    <span class="staff-meta">
                      {{ roleName(member.role) }} · {{ member.email }}
                    </span>
                  </div>
                  @if (member.id === auth.profile()?.id) {
                    <span class="staff-you">Vos</span>
                  } @else {
                    <div class="staff-acciones">
                      <!-- El mismo botón sirve para tres cosas: el que olvidó
                           su PIN, el que se trabó probando, y el que se fue
                           del local —a ése no se le dicta el nuevo. -->
                      @if (member.role !== 'OWNER') {
                        <button
                          type="button"
                          class="staff-toggle"
                          [disabled]="generandoPin() === member.id"
                          (click)="generarPin(member)"
                        >
                          {{ generandoPin() === member.id ? 'Generando…' : 'PIN nuevo' }}
                        </button>
                      }
                      <button
                        type="button"
                        class="staff-toggle"
                        (click)="toggleStaff(member)"
                      >
                        {{ member.active ? 'Dar de baja' : 'Reactivar' }}
                      </button>
                    </div>
                  }
                </div>
              } @empty {
                <p class="muted">Todavía sos la única persona con acceso.</p>
              }
            </div>

            <!-- El PIN se ve una sola vez: después queda cifrado y nadie puede
                 volver a leerlo. Por eso el cartel se queda hasta que el dueño
                 lo cierra, en vez de irse solo mientras busca el teléfono. -->
            @if (pinNuevo(); as datos) {
              <div class="pin-nuevo" role="status">
                <p class="pin-titulo">Datos de acceso de {{ datos.nombre }}</p>
                <dl class="pin-datos">
                  <dt>Link</dt>
                  <dd>{{ linkDelLocal() }}</dd>
                  <dt>Usuario</dt>
                  <dd>{{ datos.usuario }}</dd>
                  <dt>PIN</dt>
                  <dd class="pin-numero">{{ datos.pin }}</dd>
                </dl>
                <p class="pin-aviso">
                  Anotalo o mandáselo ahora: el PIN no se puede volver a ver.
                  Si se pierde, generás otro.
                </p>
                <div class="pin-acciones">
                  <button type="button" class="create" (click)="copiarAcceso(datos)">
                    {{ copiado() ? 'Copiado ✓' : 'Copiar los tres datos' }}
                  </button>
                  <button type="button" class="secondary" (click)="pinNuevo.set(null)">
                    Listo
                  </button>
                </div>
              </div>
            }
          </details>
        </section>
      }
      }

      @if (activeTab() === 'ventas') {
        <section class="panel">
          <h2 class="panel-title">Métricas</h2>
          <itd-metrics [apiUrl]="apiUrl" />
        </section>
      }

      @if (activeTab() === 'resenas') {
        <section class="panel">
          <h2 class="panel-title">Reseñas de Google</h2>
          <p class="panel-lede">
            Cuando la mesa termina de pagar, el mismo teléfono con el que pidió
            le ofrece dejar la reseña. Es el único momento del día en que el
            cliente está conforme, con el teléfono en la mano y la comida
            fresca en la memoria — un cartelito en la mesa no compite con eso.
          </p>

          <label class="campo">
            <span class="campo-label">Tu link de reseñas de Google</span>
            <input
              type="url"
              class="campo-input"
              placeholder="https://g.page/r/…/review"
              [value]="resenaUrl()"
              (input)="cambiarResena($event)"
            />
          </label>

          <!-- Dónde encontrarlo. Sin esto, el paso uno es googlear "cómo
               conseguir mi link de reseñas", y ahí se pierde la mitad. -->
          <details class="ayuda">
            <summary>¿De dónde saco ese link?</summary>
            <ol class="ayuda-pasos">
              <li>Entrá a tu <strong>Perfil de Empresa de Google</strong>.</li>
              <li>Buscá <strong>Pedir reseñas</strong> o <strong>Compartir</strong>.</li>
              <li>Copiá el link corto que te da y pegalo acá.</li>
            </ol>
            <p class="ayuda-nota">
              También sirve el que sale al buscar tu local en Google y tocar
              "Escribir una reseña".
            </p>
          </details>

          <div class="descuento-fila">
            <button
              type="button"
              class="create"
              [disabled]="guardandoResena() || resenaUrl() === resenaGuardada()"
              (click)="guardarResena()"
            >
              {{ guardandoResena() ? 'Guardando…' : 'Guardar' }}
            </button>

            @if (resenaGuardada() !== '') {
              <a class="secondary" [href]="resenaGuardada()" target="_blank" rel="noopener">
                Probar el link →
              </a>
            }
          </div>

          @if (resenaError(); as error) {
            <p class="error" role="alert">{{ error }}</p>
          }

          <!-- Cuántas veces se ofreció y cuántas se tocó. Cuántas reseñas
               entraron de verdad lo ve el dueño en su propio Google: decirlo
               acá sería inventar un número que él puede contrastar. -->
          @if (resenaOfrecidas() > 0) {
            <div class="resena-numeros">
              <p class="resena-dato">
                <strong>{{ resenaOfrecidas() }}</strong> veces se ofreció
              </p>
              <p class="resena-dato">
                <strong>{{ resenaTocadas() }}</strong> tocaron el botón
                <span class="resena-tasa">({{ tasaDeResenas() }}%)</span>
              </p>
            </div>
          } @else if (resenaGuardada() !== '') {
            <p class="descuento-ejemplo apagado">
              Todavía no se ofreció a ninguna mesa. Aparece cuando el mozo
              cierra una cuenta.
            </p>
          }
        </section>
      }
    </div>

    <!-- Al pie y en toda pantalla: un documento legal que no se encuentra es
         como no tenerlo. Se abren en una pestaña nueva para no perder lo que
         se estaba cargando. -->
    <footer class="legal">
      <a href="/legal/terminos.html" target="_blank" rel="noopener">Términos y condiciones</a>
      <a href="/legal/privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>
      <a href="/legal/tratamiento-de-datos.html" target="_blank" rel="noopener">
        Tratamiento de datos
      </a>
    </footer>

    <!-- Los modales, al final del template para que queden por encima de
         todo sin depender del orden de la página. -->
    @if (modal() !== null) {
      <div class="scrim" (click)="closeModal()" aria-hidden="true"></div>
    }

    <!-- Lo que preguntaba el confirm del navegador, con la letra y los
         colores del panel. Además dice qué hace el botón —"Borrar la mesa" y
         no "Aceptar"—, que es lo que uno lee cuando ya se arrepintió. -->
    @if (confirma(); as pedido) {
      <div class="scrim" (click)="responder(false)" aria-hidden="true"></div>
      <div class="modal confirma" role="alertdialog" aria-modal="true" aria-labelledby="confirma-title">
        <header class="modal-head">
          <h2 class="modal-title" id="confirma-title">{{ pedido.titulo }}</h2>
        </header>

        <div class="modal-body">
          <p class="confirma-detalle">{{ pedido.detalle }}</p>

          <div class="confirma-acciones">
            <button type="button" class="ghost" (click)="responder(false)">Cancelar</button>
            <button
              type="button"
              class="confirma-ok"
              [class.peligro]="pedido.peligro"
              (click)="responder(true)"
            >
              {{ pedido.accion }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (modal() === 'nuevo') {
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="nuevo-title">
        <header class="modal-head">
          <h2 class="modal-title" id="nuevo-title">Nuevo producto</h2>
          <button type="button" class="modal-close" (click)="closeModal()" aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div class="modal-body">

                  <form class="new-form" (submit)="createProduct($event)">
            <label class="field">
              <span>Nombre</span>
              <input name="name" required maxlength="60" placeholder="Ej: gyoza de cerdo" />
            </label>
            <label class="field">
              <span>Descripción</span>
              <input name="description" maxlength="140" placeholder="Ej: seis unidades, salsa ponzu" />
            </label>
            <label class="field">
              <span>Precio en pesos</span>
              <!-- step=1: a price is whatever the restaurant charges, not a
                   multiple of a hundred. -->
              <input name="price" type="number" min="0" step="1" required placeholder="4500" />
            </label>
            <label class="field">
              <span>Categoría</span>
              <select name="categoryId">
                @for (category of categories(); track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
            </label>
            <!-- Las dietas se cargan al crear, no después: un plato que
                 nace sin ellas es invisible para quien filtra la carta, y
                 nadie vuelve a editarlo para agregarlas. -->
            <fieldset class="field diets">
              <legend>Apto para</legend>
              <div class="checks">
                @for (diet of dietOptions; track diet.id) {
                  <label class="check">
                    <input type="checkbox" [name]="'diet-' + diet.id" />
                    <span>{{ diet.label }}</span>
                  </label>
                }
              </div>
            </fieldset>

            <button type="submit" class="create">Agregar a la carta</button>
            @if (createError(); as error) {
              <p class="status error">{{ error }}</p>
            }
          </form>
        </div>
      </div>
    }

    <!-- La foto en su propio modal, sobre la carta. Tenerla en una solapa
         aparte obligaba a ir y volver para algo que se hace plato por plato,
         mirando la lista. -->
    @if (modal() === 'foto' && editing(); as dish) {
      <div class="modal ancho" role="dialog" aria-modal="true" aria-label="La foto">
        <header class="modal-head">
          <h2 class="modal-title">{{ dish.name }}</h2>

          <div class="foto-head-acciones">
            <!-- Cargar las fotos de una carta es una tanda, no una visita por
                 plato: seguir al siguiente es la acción que más se repite, así
                 que vive arriba y no al pie de todo lo demás. -->
            @if (siguienteSinFoto(); as siguiente) {
              <button type="button" class="foto-siguiente" (click)="irALaFoto(siguiente.id)">
                Seguir con {{ siguiente.name }} →
              </button>
            }
            <button type="button" class="modal-close" (click)="cerrarFoto()" aria-label="Cerrar">
              ✕
            </button>
          </div>
        </header>

        <div class="modal-body">
          <!--
            Una instancia por plato, no una reutilizada.
            Angular conserva el componente al cambiar de plato, así que la foto
            recién subida y su recorte quedaban colgados del siguiente: se abría
            la "Provoleta" y se veía el bife. Con el id en el @if, el editor se
            destruye y nace limpio.
          -->
          <!-- El editor y su cortina de carga, juntos: la cortina se pone
               encima y no debajo, o el aviso queda al pie del modal, lejos de
               la foto de la que habla. -->
          <div class="editor-zona">
            @if (modal() === 'foto' && selected(); as platoId) {
              <itd-image-editor
                [subjectId]="platoId"
                [existingUrl]="currentPhoto()"
                (applied)="upload($event)"
              />
            }

            <!--
              Mientras se procesa, tapa la foto.

              Antes era una línea de texto al pie que decía "procesando la
              imagen…" y se quedaba ahí: no se sabía si seguía trabajando o si
              se había colgado, y el editor abajo parecía usable cuando no lo
              era. Una cortina sobre la foto dice las dos cosas a la vez.
            -->
            @if (subiendo()) {
              <div class="cortina" role="status" aria-live="polite">
                <span class="ruedita" aria-hidden="true"></span>
                <span class="cortina-texto">Procesando la foto…</span>
              </div>
            }
          </div>

          <!-- El error se queda: es lo único que hay que leer y decidir qué
               hacer. El "listo" se va solo, porque la foto nueva ya se ve. -->
          @if (status(); as state) {
            <p class="status" [class.error]="state.startsWith('error')">{{ state }}</p>
          }

          @if (result(); as set) {
            <img class="preview" [src]="best(set)" alt="" width="300" height="300" />
            <p class="muted">
              {{ set.variants.length }} variantes · AVIF, WebP y JPEG en 4 tamaños
            </p>
          }
        </div>
      </div>
    }

    @if (modal() === 'editar' && editing(); as dish) {
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="editar-title">
        <header class="modal-head">
          <div>
            <p class="modal-eyebrow">Editando</p>
            <h2 class="modal-title" id="editar-title">{{ dish.name }}</h2>
          </div>
          <button type="button" class="modal-close" (click)="closeSheet()" aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div class="modal-body">
          <form class="edit-form" (submit)="saveDish($event, dish)">
          <div class="field-row">
          <label class="field">
          <span>Nombre</span>
          <input name="name" [value]="dish.name" required maxlength="60" />
          </label>
          <label class="field narrow">
          <span>Precio</span>
          <input
          name="price"
          type="number"
          min="0"
          step="1"
          [value]="dish.price.amountInMinorUnits / 100"
          required
          />
          </label>
          </div>

          <label class="field">
          <span>Descripción</span>
          <input name="description" [value]="dish.description" maxlength="140" />
          </label>

          <label class="field">
          <span>Categoría</span>
          <select name="categoryId">
          @for (category of categories(); track category.id) {
          <option [value]="category.id" [selected]="category.id === dish.categoryId">
          {{ category.name }}
          </option>
          }
          </select>
          </label>

          <!-- Los filtros de la carta leen esto: un plato sin dietas es
          invisible para quien busca vegano o sin gluten. -->
          <fieldset class="field diets">
          <legend>Apto para</legend>
          <div class="checks">
          @for (diet of dietOptions; track diet.id) {
          <label class="check">
          <input
          type="checkbox"
          [name]="'diet-' + diet.id"
          [checked]="dish.diets.includes(diet.id)"
          />
          <span>{{ diet.label }}</span>
          </label>
          }
          </div>
          </fieldset>

          @if (editError(); as error) {
          <p class="status error">{{ error }}</p>
          }
          @if (editSaved()) {
          <p class="status created" role="status">Guardado ✓</p>
          }

          <div class="sheet-actions">
          <button type="submit" class="create">Guardar cambios</button>
          <!-- Apagado hasta que se lo busca: sacar un plato es raro al lado de
               corregirle el precio, que es lo de todos los días. -->
          <button type="button" class="borrar" (click)="borrarPlato(dish)">
          Sacar de la carta
          </button>
          </div>
          </form>
        </div>
      </div>
    }

    @if (modal() === 'equipo') {
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="equipo-title">
        <header class="modal-head">
          <h2 class="modal-title" id="equipo-title">Agregar persona</h2>
          <button type="button" class="modal-close" (click)="closeModal()" aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div class="modal-body">
          <form class="new-form staff-form" (submit)="inviteStaff($event)">
            <label class="field">
              <span>Nombre</span>
              <input name="displayName" required maxlength="60" placeholder="Ej: Nico" autofocus />
            </label>
            <label class="field">
              <span>Email</span>
              <input name="email" type="email" required placeholder="Nico@turestaurante.ar" />
            </label>
            <label class="field">
              <span>Contraseña inicial</span>
              <input name="password" type="password" required minlength="8" />
            </label>
            <label class="field">
              <span>Puesto</span>
              <select name="role" required>
                <option value="KITCHEN">Cocina — ve y avanza los pedidos</option>
                <option value="WAITER">Mozo — pedidos y cuentas</option>
                <option value="MANAGER">Encargado — todo menos el equipo</option>
              </select>
            </label>
            <button type="submit" class="create">Dar de alta</button>
          </form>

          @if (staffError(); as message) {
            <p class="error-note" role="alert">{{ message }}</p>
          }
          <p class="muted qr-hint">
            Le pasás vos la contraseña; después la puede seguir usando para entrar.
          </p>
        </div>
      </div>
    }

    @if (modal() === 'importar') {
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="importar-title">
        <header class="modal-head">
          <div>
            <p class="modal-eyebrow">Traer mi carta</p>
            <h2 class="modal-title" id="importar-title">Pegá tu carta</h2>
          </div>
          <button type="button" class="modal-close" (click)="closeModal()" aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div class="modal-body import-body">
          <p class="import-hint">
            Copiala de donde la tengas — un Word, un Excel, un mensaje. Una línea por producto
            con el precio al final, y las secciones solas en su renglón.
          </p>

          <!-- La página ajena tampoco es un camino aparte: baja, se convierte
               a las mismas líneas y cae en el mismo cuadro. Lo que trae una
               web tiene ruido —el menú de navegación, el horario— y por eso
               importa que se pueda borrar a mano antes de guardar. -->
          <div class="import-url">
            <input
              type="url"
              class="import-url-input"
              placeholder="Https://mirestaurante.com/carta"
              [value]="importUrl()"
              (input)="onImportUrl($event)"
            />
            <button
              type="button"
              class="secondary"
              [disabled]="importUrl().trim() === '' || fetching()"
              (click)="fetchFromUrl()"
            >
              {{ fetching() ? 'Trayendo…' : 'Traer de la web' }}
            </button>
          </div>

          <!-- El archivo cae en el mismo cuadro: se puede corregir a mano
               antes de guardar, sin volver a Excel. -->
          <label class="import-file">
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              (change)="onImportFile($event)"
            />
            <span>O subí un archivo (.csv o .txt)</span>
          </label>

          <textarea
            class="import-text"
            rows="10"
            spellcheck="false"
            placeholder="ENTRADAS&#10;Empanadas de carne - media docena  $3.400&#10;Provoleta  5.200&#10;&#10;PARRILLA&#10;Bife de chorizo  $8.500"
            [value]="importText()"
            (input)="onImportText($event)"
          ></textarea>

          @if (importText().trim() !== '') {
            <!-- La vista previa es el punto: nadie guarda una carta entera a
                 ciegas, y corregir acá es más barato que después. -->
            <div class="preview">
              <p class="preview-count">
                <strong>{{ parsed().dishes.length }}</strong> productos en
                <strong>{{ parsed().categories.length }}</strong> secciones
                @if (withPhoto() > 0) {
                  · <strong>{{ withPhoto() }}</strong> con foto
                }
              </p>

              @if (parsed().dishes.length > maxDishes) {
                <p class="status error">
                  Entran {{ maxDishes }} productos por vez y hay
                  {{ parsed().dishes.length }} — subí la carta en dos tandas.
                </p>
              }

              @if (parsed().skipped.length > 0) {
                <p class="status error">
                  {{ parsed().skipped.length }} líneas no se entendieron — revisalas y
                  corregilas arriba
                </p>
                <ul class="skipped">
                  @for (line of parsed().skipped; track line.lineNumber) {
                    <li><span class="line-no">línea {{ line.lineNumber }}</span> {{ line.raw }}</li>
                  }
                </ul>
              }

              <ul class="preview-list" [class.with-photos]="withPhoto() > 0">
                @for (dish of parsed().dishes; track dish.name + dish.priceMinor) {
                  <li class="preview-row">
                    <!-- La foto se ve acá y no después: es la única forma de
                         notar que la página la enganchó al plato de al lado. -->
                    @if (dish.imageUrl !== '') {
                      <img class="preview-photo" [src]="dish.imageUrl" alt="" loading="lazy" />
                    } @else {
                      <span class="preview-photo"></span>
                    }
                    <span class="preview-cat">{{ dish.category }}</span>
                    <span class="preview-name">
                      {{ dish.name }}
                      @if (dish.description !== '') {
                        <em>{{ dish.description }}</em>
                      }
                    </span>
                    <span class="preview-price">
                      {{ dish.priceMinor / 100 | number: '1.0-0' }}
                    </span>
                  </li>
                }
              </ul>
            </div>
          }

          @if (importResult(); as message) {
            <p class="status error">{{ message }}</p>
          }

          <div class="sheet-actions">
            <button
              type="button"
              class="create"
              [disabled]="
                parsed().dishes.length === 0 ||
                parsed().dishes.length > maxDishes ||
                importing()
              "
              (click)="confirmImport()"
            >
              {{ importing() ? 'Cargando…' : 'Agregar ' + parsed().dishes.length + ' productos' }}
            </button>
            <button type="button" class="secondary" (click)="closeModal()">Cancelar</button>
          </div>
        </div>
      </div>
    }
    }
  `,
})
export class AdminComponent {
  protected readonly auth = inject(AuthStore);

  protected readonly tabs = TABS;
  protected readonly activeTab = signal<AdminTab>('carta');

  protected tabTitle(): string {
    return TABS.find((tab) => tab.id === this.activeTab())?.label ?? 'Administración';
  }

  /**
   * Cada solapa pide lo suyo.
   *
   * Antes "Tu local" mezclaba equipo y ventas, así que alcanzaba con
   * cualquiera de los dos permisos para ver las dos cosas. Separadas, cada una
   * exige lo que le corresponde: un encargado sin `staff:manage` mira los
   * números sin poder tocar el personal.
   */
  protected canSee(tab: AdminTab): boolean {
    if (tab === 'local') return this.auth.can('staff:manage');
    if (tab === 'ventas' || tab === 'resenas') return this.auth.can('metrics:read');
    return true;
  }

  protected readonly products = signal<readonly MenuProduct[]>([]);
  protected readonly categories = signal<readonly MenuCategory[]>([]);
  /**
   * La carta como la va a ver el comensal: por sección y en ese orden.
   *
   * Los productos vienen ordenados por nombre y las categorías por su posición,
   * así que agrupar acá es lo que hace visible el orden que se edita más abajo.
   * Sin esto, mover una categoría no cambiaba nada en esta pantalla.
   *
   * Lo que quedó sin categoría —o con una que ya no existe— va al final y con
   * nombre propio: esconderlo sería perder productos de vista sin decirlo.
   */
  protected readonly porCategoria = computed(() => {
    const porId = new Map<string, MenuProduct[]>();
    for (const product of this.products()) {
      const grupo = porId.get(product.categoryId) ?? [];
      grupo.push(product);
      porId.set(product.categoryId, grupo);
    }

    const grupos = this.categories()
      .map((category) => ({
        id: category.id,
        nombre: category.name,
        productos: porId.get(category.id) ?? [],
      }))
      .filter((grupo) => grupo.productos.length > 0);

    const conocidas = new Set(this.categories().map((category) => category.id));
    const sueltos = this.products().filter((product) => !conocidas.has(product.categoryId));
    if (sueltos.length > 0) {
      grupos.push({ id: '__sin-categoria__', nombre: 'Sin categoría', productos: sueltos });
    }

    return grupos;
  });

  protected readonly createError = signal<string | null>(null);
  protected readonly createdName = signal<string | null>(null);
  protected readonly tables = signal<readonly RestaurantTable[]>([]);
  protected readonly copied = signal<string | null>(null);
  protected readonly showQrSheet = signal(false);
  protected readonly apiUrl = API;
  protected readonly staff = signal<readonly StaffMember[]>([]);

  /**
   * Qué mozo atiende qué mesa.
   *
   * Vacío es un estado válido y es el que trae todo salón nuevo: mientras
   * nadie reparta, cada mozo ve el salón entero, que es lo correcto en un
   * local chico.
   */
  protected readonly assignments = signal<readonly TableAssignment[]>([]);

  /** Sólo los mozos: al encargado y a la cocina no se les reparte sector. */
  protected readonly waiters = computed(() =>
    this.staff().filter((member) => member.active && member.role === 'WAITER'),
  );

  /** Si esta mesa está en el sector de este mozo. Puede estar en varios. */
  protected isAssigned(tableId: string, staffId: string): boolean {
    return this.assignments().some((a) => a.tableId === tableId && a.staffId === staffId);
  }

  /** La mesa que se está editando en la lista, o null. */
  protected readonly editingTable = signal<string | null>(null);

  /** Lo que falló al tocar una mesa, dicho arriba de la lista. */
  protected readonly tableError = signal<string | null>(null);

  /**
   * Guarda el nombre y los lugares.
   *
   * El id no cambia aunque cambie el nombre: de él cuelga el QR pegado en la
   * mesa, y renombrarla no puede obligar a reimprimirlo.
   */
  protected async saveTable(table: RestaurantTable, event: Event): Promise<void> {
    event.preventDefault();
    this.tableError.set(null);

    const data = new FormData(event.target as HTMLFormElement);
    const label = String(data.get('label') ?? '').trim();
    const seats = Number(data.get('seats') ?? 0);
    if (label === '' || !Number.isFinite(seats)) return;

    const response = await this.auth.apiFetch(`${API}/tables/${table.id}`, {
      method: 'PATCH',
      headers: { ...this.auth.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, seats }),
    });

    if (!response.ok) {
      this.tableError.set('No se pudo guardar la mesa. Probá de nuevo.');
      return;
    }

    this.editingTable.set(null);
    await this.loadTables();
  }

  /**
   * Saca una mesa del salón.
   *
   * Pregunta antes porque no se deshace, y dice qué se lleva puesto: el QR
   * pegado en esa mesa deja de servir.
   */
  protected async removeTable(table: RestaurantTable): Promise<void> {
    this.tableError.set(null);

    const ok = await this.preguntar({
      titulo: `Borrar ${table.label}`,
      detalle:
        'El QR pegado en esa mesa deja de funcionar. Las ventas que ya pasaron por ' +
        'ella se conservan.',
      accion: 'Borrar la mesa',
      peligro: true,
    });
    if (!ok) return;

    const response = await this.auth.apiFetch(`${API}/tables/${table.id}`, {
      method: 'DELETE',
      headers: this.auth.headers(),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
      this.tableError.set(
        detail?.kind === 'TABLE_IN_USE'
          ? `${table.label} tiene gente sentada. Cerrá su cuenta antes de borrarla.`
          : 'No se pudo borrar la mesa. Probá de nuevo.',
      );
      return;
    }

    await this.loadTables();
  }

  /** El nombre del cartelito, para hablar de la mesa como la llama el salón. */
  protected tableLabel(tableId: string): string {
    return this.tables().find((t) => t.id === tableId)?.label ?? tableId;
  }

  /**
   * Mesas asignadas a alguien que ya no puede entrar.
   *
   * Dar de baja a un mozo no borra su ficha —se desactiva, para poder
   * reactivarlo— así que sus mesas siguen asignadas a él y no aparecen en la
   * app de nadie. El aviso al dar de baja se ve una vez y se olvida; esto
   * queda hasta que alguien lo resuelva.
   */
  protected readonly orphaned = computed(() =>
    orphanedTables(
      this.assignments(),
      this.staff().filter((m) => m.active).map((m) => m.id),
    ),
  );
  protected readonly staffError = signal<string | null>(null);
  protected readonly trial = signal<{
    status: string;
    daysLeft: number | null;
  } | null>(null);
  protected readonly catError = signal<string | null>(null);
  /** Bumped after every upload to bust the browser's image cache. */
  private readonly photoVersion = signal(0);
  protected readonly selected = signal<string | null>(null);

  /** El plato abierto para editar, con todos sus datos actuales. */
  protected readonly editing = computed(() => {
    const id = this.selected();
    return id === null ? null : (this.products().find((p) => p.id === id) ?? null);
  });

  protected readonly editError = signal<string | null>(null);
  protected readonly editSaved = signal(false);

  /**
   * Qué modal está abierto, si alguno.
   *
   * Crear y editar son tareas que empiezan y terminan: mientras están
   * abiertas ocupan la pantalla y al cerrarlas la carta queda como estaba.
   * En la misma página, el formulario de alta pegado a la lista hacía dudar
   * si un plato se estaba creando o editando.
   */
  protected readonly modal = signal<
    'nuevo' | 'editar' | 'opciones' | 'importar' | 'foto' | 'equipo' | null
  >(
    null,
  );

  /** El texto pegado y lo que se entendió de él. */
  protected readonly importText = signal('');
  protected readonly importUrl = signal('');
  protected readonly fetching = signal(false);
  protected readonly maxDishes = MAX_DISHES;
  protected readonly importing = signal(false);
  protected readonly importResult = signal<string | null>(null);

  protected readonly parsed = computed(() => parseMenuText(this.importText()));
  protected readonly withPhoto = computed(
    () => this.parsed().dishes.filter((dish) => dish.imageUrl !== '').length,
  );

  protected openImport(): void {
    this.importText.set('');
    this.importUrl.set('');
    this.importResult.set(null);
    this.modal.set('importar');
  }

  protected onImportText(event: Event): void {
    this.importText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onImportUrl(event: Event): void {
    this.importUrl.set((event.target as HTMLInputElement).value);
  }

  /**
   * Trae la carta publicada en la web del restaurante.
   *
   * La baja el servidor, que además es el único que puede: el sitio ajeno no
   * autoriza al navegador a leerlo. Vuelve como texto y termina en el mismo
   * cuadro, así que lo que traiga de más se borra antes de guardar.
   */
  protected async fetchFromUrl(): Promise<void> {
    const url = this.importUrl().trim();
    if (url === '') return;

    this.fetching.set(true);
    this.importResult.set(null);

    try {
      const response = await this.auth.apiFetch(`${API}/menu/import/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
        this.importResult.set(FETCH_ERRORS[detail?.kind ?? ''] ?? 'No pudimos leer esa página.');
        return;
      }

      const body = (await response.json()) as { text: string };
      if (body.text.trim() === '') {
        // Pasa con las páginas que arman la carta con JavaScript: el HTML
        // llega vacío y no hay nada que interpretar.
        this.importResult.set(
          'Esa página no trae la carta como texto. Copiala del navegador y pegala acá.',
        );
        return;
      }

      this.importText.set(body.text);
    } catch {
      this.importResult.set('No pudimos leer esa página.');
    } finally {
      this.fetching.set(false);
    }
  }

  /**
   * Sube un archivo y lo deja en el mismo cuadro de texto.
   *
   * El archivo no es un camino aparte: se convierte a las mismas líneas y
   * pasa por la misma vista previa. Así hay un solo comportamiento probado,
   * y quien sube una planilla puede corregirla a mano antes de guardar sin
   * tener que volver a Excel.
   */
  protected async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;

    this.importResult.set(null);

    try {
      const raw = await file.text();
      // Una planilla trae separadores; un texto pegado no. Mirar el contenido
      // y no la extensión evita fallar con un .txt exportado de Excel.
      const looksTabular = /^[^\n]*[;,][^\n]*[;,]/.test(raw) || /,\s*\d+\s*$/m.test(raw);
      this.importText.set(looksTabular ? csvToMenuText(raw) : raw);
    } catch {
      this.importResult.set('No pudimos leer el archivo. Probá copiando el texto.');
    } finally {
      // Permite volver a elegir el mismo archivo si lo corrigieron afuera.
      input.value = '';
    }
  }

  /**
   * Guarda lo que la vista previa mostró.
   *
   * Se manda lo interpretado y no el texto: lo que se guarda es exactamente
   * lo que la persona vio y aprobó en pantalla, no algo que el servidor
   * vuelva a interpretar por su cuenta.
   */
  protected async confirmImport(): Promise<void> {
    const { dishes } = this.parsed();
    if (dishes.length === 0) return;

    this.importing.set(true);
    this.importResult.set(null);

    try {
      const response = await this.auth.apiFetch(`${API}/menu/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
        body: JSON.stringify({ dishes }),
      });

      if (!response.ok) {
        this.importResult.set('No pudimos cargar la carta. Probá de nuevo.');
        return;
      }

      const body = (await response.json()) as {
        imported: number;
        photos: number;
        sinAlmacenamiento?: boolean;
      };
      await this.load();
      this.modal.set(null);
      this.createdName.set(
        body.photos > 0 ? `${body.imported} productos, ${body.photos} con foto` : `${body.imported} productos`,
      );
      if (body.sinAlmacenamiento === true) {
        // La carta entró; las fotos no. Decirlo evita que alguien las busque.
        this.importResult.set(
          'La carta se cargó sin las fotos: falta configurar dónde guardarlas.',
        );
      }
      globalThis.setTimeout(() => this.createdName.set(null), 5000);
    } finally {
      this.importing.set(false);
    }
  }

  protected openNew(): void {
    this.createError.set(null);
    this.createdName.set(null);
    this.modal.set('nuevo');
  }

  /**
   * La pregunta que está en pantalla, o null.
   *
   * Reemplaza a `confirm()`, que en el navegador sale con la tipografía del
   * sistema, sin los colores del panel y con el dominio arriba de todo. Un
   * solo lugar para las cuatro preguntas que hace el panel.
   */
  protected readonly confirma = signal<PedidoDeConfirmacion | null>(null);
  private resolverConfirma: ((ok: boolean) => void) | null = null;

  private preguntar(pedido: PedidoDeConfirmacion): Promise<boolean> {
    // Si ya había una pregunta abierta, se da por cancelada: sin esto su
    // promesa no se resolvería nunca y quien la esperaba quedaría colgado.
    if (this.resolverConfirma !== null) this.responder(false);

    this.confirma.set(pedido);
    return new Promise((resolver) => {
      this.resolverConfirma = resolver;
    });
  }

  /** Cierra la pregunta y le contesta a quien la hizo. */
  protected responder(ok: boolean): void {
    this.confirma.set(null);
    const resolver = this.resolverConfirma;
    this.resolverConfirma = null;
    resolver?.(ok);
  }

  protected closeModal(): void {
    this.modal.set(null);
    this.staffError.set(null);
    this.editError.set(null);
    this.editSaved.set(false);
  }

  /** Cerrar con Escape: es lo que espera cualquiera con un modal abierto. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    // La pregunta primero: es la que está más arriba en pantalla.
    if (this.confirma() !== null) {
      this.responder(false);
      return;
    }
    if (this.modal() !== null) this.closeModal();
  }

  /** Las dietas que la carta ofrece como filtro, con su nombre en español. */
  protected readonly dietOptions = [
    { id: 'VEGAN', label: 'Vegano' },
    { id: 'VEGETARIAN', label: 'Vegetariano' },
    { id: 'GLUTEN_FREE', label: 'Sin gluten' },
    { id: 'LACTOSE_FREE', label: 'Sin lactosa' },
  ] as const;

  protected closeSheet(): void {
    this.selected.set(null);
    this.closeModal();
  }

  /**
   * De la fila del plato a su foto, sin pasar por la ficha.
   *
   * El acceso salía de un botón dentro de la ficha del plato, y esa ficha
   * quedaba abierta tapando justamente la pantalla a la que acababa de
   * llevar: había que adivinar que se cerraba tocando afuera. Tocar la foto
   * en la fila no abre nada que después haya que cerrar.
   */
  /**
   * Saca un plato de la carta.
   *
   * Pregunta antes porque no se deshace, y dice qué se lleva puesto: la foto y
   * las opciones del plato. Para el que se dejó de vender está "sin stock",
   * que lo esconde del comensal sin perder nada.
   */
  protected async borrarPlato(dish: MenuProduct): Promise<void> {
    this.editError.set(null);

    const ok = await this.preguntar({
      titulo: `Borrar ${dish.name}`,
      detalle:
        'Se va con su foto y sus opciones. Si sólo se te acabó, marcalo sin stock ' +
        'y desaparece de la carta sin perder nada.',
      accion: 'Borrar el plato',
      peligro: true,
    });
    if (!ok) return;

    const response = await this.auth.apiFetch(`${API}/menu/products/${dish.id}`, {
      method: 'DELETE',
      headers: this.auth.headers(),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
      this.editError.set(
        detail?.kind === 'CONFLICT'
          ? `${dish.name} está en un pedido sin cobrar. Cerrá esa mesa antes de borrarlo.`
          : 'No se pudo sacar de la carta. Probá de nuevo.',
      );
      return;
    }

    this.selected.set(null);
    this.closeModal();
    await this.load();
  }

  /** Cerrar la foto suelta el plato: se terminó de trabajar con él. */
  protected cerrarFoto(): void {
    this.selected.set(null);
    this.status.set(null);
    this.closeModal();
  }

  /**
   * El próximo plato sin foto, para encadenar sin cerrar.
   *
   * Cargar las fotos de una carta es una tanda: hacerlo plato por plato,
   * abriendo y cerrando, es el trabajo que esta pantalla viene a ahorrar.
   */
  protected readonly siguienteSinFoto = computed(() => {
    const actual = this.selected();
    return (
      this.products().find(
        (product) => product.id !== actual && this.thumb(product) === null,
      ) ?? null
    );
  });

  protected irALaFoto(id: string): void {
    this.selected.set(id);
    this.status.set(null);
    // La vista previa del plato anterior también se va: quedaba abajo del
    // editor nuevo y hacía creer que la foto ya estaba subida.
    this.result.set(null);
    this.modal.set('foto');
  }

  /**
   * Guarda los cambios del plato abierto.
   *
   * Manda sólo lo que el formulario muestra: la API deja el resto como está,
   * así que editar el precio no borra la foto ni los alérgenos cargados.
   */
  protected async saveDish(event: Event, dish: MenuProduct): Promise<void> {
    event.preventDefault();
    this.editError.set(null);
    this.editSaved.set(false);

    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const pesos = Number(data.get('price'));

    if (!Number.isFinite(pesos) || pesos < 0) {
      this.editError.set('el precio no es válido');
      return;
    }

    const diets = this.dietOptions
      .filter((diet) => data.get(`diet-${diet.id}`) !== null)
      .map((diet) => diet.id);

    const response = await this.auth.apiFetch(`${API}/menu/products/${dish.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({
        name: String(data.get('name') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
        priceMinor: Math.round(pesos * 100),
        categoryId: String(data.get('categoryId') ?? ''),
        diets,
      }),
    });

    if (!response.ok) {
      this.editError.set('no pudimos guardar los cambios');
      return;
    }

    this.editSaved.set(true);
    await this.load();
  }
  /** Si hay una foto procesándose ahora mismo. */
  protected readonly subiendo = signal(false);

  protected readonly status = signal<string | null>(null);
  protected readonly result = signal<{ variants: Array<{ url: string; width: number; format: string }>; lqip: string } | null>(null);

  constructor() {
    this.auth.configure(API);
    void this.auth.restore().then(() => {
      if (this.auth.signedIn()) void this.load();
    });

    // Reload the carte whenever a sign-in completes.
    effect(() => {
      if (this.auth.signedIn()) void this.load();
    });
  }

  protected roleLabel(): string {
    const labels: Record<string, string> = {
      OWNER: 'Dueño',
      MANAGER: 'Encargado',
      KITCHEN: 'Cocina',
      WAITER: 'Mozo',
    };
    return labels[this.auth.profile()?.role ?? ''] ?? '';
  }

  private async load(): Promise<void> {
    // Los ajustes en paralelo: son otra pantalla, y esperar la carta para
    // leerlos dejaría el formulario en cero mientras tanto.
    void this.cargarDescuento();

    const response = await this.auth.apiFetch(`${API}/menu`, { headers: this.auth.headers() });
    if (!response.ok) return;

    const menu = (await response.json()) as {
      products: MenuProduct[];
      categories: MenuCategory[];
    };
    this.products.set([...menu.products].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    this.categories.set(menu.categories);
    await this.loadTables();
    await this.loadStaff();
    await this.loadTrial();
  }

  private async loadTables(): Promise<void> {
    const response = await this.auth.apiFetch(`${API}/tables`, { headers: this.auth.headers() });
    if (response.ok) {
      this.tables.set((await response.json()) as RestaurantTable[]);
    }
  }

  /** El formulario de mesa nueva, cerrado hasta que alguien lo pide. */
  protected readonly nuevaMesa = signal(false);

  protected async createTable(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const label = String(new FormData(form).get('label') ?? '').trim();
    if (label === '') return;

    const response = await this.auth.apiFetch(`${API}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({ label }),
    });

    if (response.ok) {
      form.reset();
      this.nuevaMesa.set(false);
      await this.loadTables();
    }
  }

  /**
   * First-run guidance, derived from what the restaurant actually has.
   *
   * A fresh panel is every section empty at once, which reads as broken rather
   * than new. The list disappears on its own once the three things that make
   * the app usable exist, so nobody has to dismiss it.
   */
  protected readonly priceSaved = signal(false);

  /** The selected dish's price in pesos, for the editable field. */
  protected selectedPricePesos(): number {
    const product = this.products().find((candidate) => candidate.id === this.selected());
    return product === undefined ? 0 : Math.round(product.price.amountInMinorUnits / 100);
  }

  /**
   * Saves a new price for the selected dish.
   *
   * Orders already placed keep the price they were taken at — the snapshot in
   * the order is the contract with that diner, and this does not touch it.
   */
  protected async changePrice(event: Event): Promise<void> {
    const productId = this.selected();
    if (productId === null) return;

    const pesos = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(pesos) || pesos < 0) return;

    const response = await this.auth.apiFetch(`${API}/menu/products/${productId}`, {
      method: 'PATCH',
      headers: { ...this.auth.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceMinor: Math.round(pesos * 100) }),
    });

    if (response.ok) {
      await this.load();
      this.priceSaved.set(true);
      globalThis.setTimeout(() => this.priceSaved.set(false), 1600);
    }
  }

  protected roleName(role: string): string {
    return ROLE_NAMES[role] ?? role;
  }

  private async loadTrial(): Promise<void> {
    const response = await this.auth.apiFetch(`${API}/auth/subscription`, { headers: this.auth.headers() });
    if (response.ok) {
      this.trial.set((await response.json()) as { status: string; daysLeft: number | null });
    }
  }

  private async loadStaff(): Promise<void> {
    if (!this.auth.can('staff:manage')) return;

    const response = await this.auth.apiFetch(`${API}/staff`, { headers: this.auth.headers() });
    if (response.ok) {
      this.staff.set((await response.json()) as StaffMember[]);
    }

    const reparto = await this.auth.apiFetch(`${API}/tables/assignments`, {
      headers: this.auth.headers(),
    });
    if (reparto.ok) {
      this.assignments.set((await reparto.json()) as TableAssignment[]);
    }
  }

  /**
   * Suma o saca a un mozo de una mesa.
   *
   * Suma en vez de reemplazar: una mesa puede estar a cargo de varios, y
   * antes poner a uno sacaba al otro — lo que obligaba a rehacer el reparto
   * cada vez que dos compartían un sector.
   */
  protected async assignTable(tableId: string, staffId: string, sacar: boolean): Promise<void> {
    this.staffError.set(null);

    const response = await this.auth.apiFetch(
      `${API}/tables/${tableId}/assign`,
      sacar
        ? {
            method: 'DELETE',
            headers: { ...this.auth.headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffId }),
          }
        : {
            method: 'POST',
            headers: { ...this.auth.headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffId }),
          },
    );

    if (!response.ok) {
      this.staffError.set('No se pudo guardar el reparto. Probá de nuevo.');
      return;
    }

    this.assignments.update((current) =>
      sacar
        ? current.filter((a) => !(a.tableId === tableId && a.staffId === staffId))
        : [...current, { tableId, staffId }],
    );
  }

  /** Las mesas de un mozo, para contarlas al lado de su nombre. */
  protected tablesOf(staffId: string): readonly string[] {
    return this.assignments()
      .filter((a) => a.staffId === staffId)
      .map((a) => a.tableId);
  }

  /** Las que no son de nadie: las ve todo el salón. */
  protected readonly unassigned = computed(() => {
    const repartidas = new Set(this.assignments().map((a) => a.tableId));
    return this.tables()
      .filter((table) => !repartidas.has(table.id))
      .map((table) => table.id);
  });

  /**
   * Un toque pone la mesa en ese sector; otro se la saca.
   *
   * Tocar una mesa que ya es de otro se la pasa directamente, sin obligar a
   * quitarla primero: repartir el salón es mover mesas entre columnas, no un
   * trámite de dos pasos.
   */
  protected toggleTable(tableId: string, staffId: string): void {
    void this.assignTable(tableId, staffId, this.isAssigned(tableId, staffId));
  }

  protected async inviteStaff(event: Event): Promise<void> {
    event.preventDefault();
    this.staffError.set(null);

    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const payload = {
      displayName: String(data.get('displayName') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      password: String(data.get('password') ?? ''),
      role: String(data.get('role') ?? 'KITCHEN'),
    };
    if (payload.displayName === '' || payload.email === '' || payload.password === '') return;

    const response = await this.auth.apiFetch(`${API}/staff`, {
      method: 'POST',
      headers: { ...this.auth.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
      this.staffError.set(
        detail?.kind === 'EMAIL_TAKEN'
          ? 'Ya existe una cuenta con ese email'
          : detail?.kind === 'PASSWORD_TOO_SHORT'
            ? 'La contraseña necesita al menos 8 caracteres'
            : detail?.kind === 'INVALID_EMAIL'
              ? 'Revisá el email'
              : 'No pudimos dar de alta a esa persona',
      );
      return;
    }

    form.reset();
    this.closeModal();
    await this.loadStaff();
  }

  /** Revoking access is reversible, so it confirms but does not alarm. */
  protected async toggleStaff(member: StaffMember): Promise<void> {
    if (member.active) {
      // Sus mesas se dicen antes, no después: dar de baja al mozo del fondo
      // un viernes deja esas mesas sin nadie que las vea en su app, y quien
      // lo hace no tiene forma de saberlo si no se lo decimos acá.
      const suyas = this.assignments()
        .filter((a) => a.staffId === member.id)
        .map((a) => this.tableLabel(a.tableId));

      const aviso =
        suyas.length === 0
          ? ''
          : ` Atiende ${suyas.length === 1 ? 'la' : 'las'} ${suyas.join(', ')}. ` +
            `${suyas.length === 1 ? 'Esa mesa queda' : 'Esas mesas quedan'} sin mozo asignado ` +
            `hasta que ${suyas.length === 1 ? 'la' : 'las'} pases a otro.`;

      const ok = await this.preguntar({
        titulo: `Dar de baja a ${member.displayName}`,
        detalle: `No va a poder entrar hasta que lo reactives.${aviso}`,
        accion: 'Dar de baja',
        peligro: true,
      });
      if (!ok) return;
    }

    const response = await this.auth.apiFetch(`${API}/staff/${member.id}/active`, {
      method: 'PATCH',
      headers: { ...this.auth.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !member.active }),
    });
    if (response.ok) await this.loadStaff();
  }

  /**
   * Rotates a table's secret, which invalidates every QR already printed for
   * it — the reason to do that is a leaked or photographed code, so it asks
   * first and says plainly what breaks.
   */
  protected async rotate(table: RestaurantTable): Promise<void> {
    const ok = await this.preguntar({
      titulo: `Renovar el QR de ${table.label}`,
      detalle:
        'Los códigos ya impresos de esta mesa dejan de funcionar y hay que imprimirlos de nuevo.',
      accion: 'Renovar el QR',
      peligro: false,
    });
    if (!ok) return;

    const response = await this.auth.apiFetch(`${API}/tables/${table.id}/rotate`, {
      method: 'POST',
      headers: this.auth.headers(),
    });
    if (response.ok) await this.loadTables();
  }

  /** Copies the QR link so it can be pasted into a code generator or printed. */
  protected async copyLink(table: RestaurantTable): Promise<void> {
    try {
      await navigator.clipboard.writeText(table.url);
      this.copied.set(table.id);
      globalThis.setTimeout(() => this.copied.set(null), 2000);
    } catch {
      // Clipboard blocked: leave the label unchanged rather than lie.
    }
  }

  /** Largest webp of the selected dish, used as the editor's opening image. */
  protected currentPhoto(): string | null {
    const set = this.result();
    if (set === null) return null;

    const webp = set.variants.filter((variant) => variant.format === 'webp');
    return webp.find((variant) => variant.width === 600)?.url ?? webp[0]?.url ?? null;
  }

  protected countIn(categoryId: string): number {
    return this.products().filter((product) => product.categoryId === categoryId).length;
  }

  protected selectedCategory(): string {
    return this.products().find((product) => product.id === this.selected())?.categoryId ?? '';
  }

  protected async createCategory(event: Event): Promise<void> {
    event.preventDefault();
    this.catError.set(null);

    const form = event.target as HTMLFormElement;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (name === '') return;

    const response = await this.auth.apiFetch(`${API}/menu/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      this.catError.set('no pudimos crear la categoría');
      return;
    }
    form.reset();
    await this.load();
  }

  protected async renameCategory(categoryId: string, event: Event): Promise<void> {
    this.catError.set(null);

    const name = (event.target as HTMLInputElement).value.trim();
    const current = this.categories().find((category) => category.id === categoryId);
    if (name === '' || current === undefined || name === current.name) return;

    const response = await this.auth.apiFetch(`${API}/menu/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      this.catError.set('no pudimos renombrar la categoría');
      return;
    }
    await this.load();
  }

  /** Cuál se puede arrastrar: sólo la que tiene el mouse apretado en su agarre. */
  protected readonly agarrada = signal<string | null>(null);
  /** Cuál va viajando, y sobre cuál está parada. */
  protected readonly arrastrando = signal<string | null>(null);
  protected readonly sobre = signal<string | null>(null);

  protected soltarNada(): void {
    this.agarrada.set(null);
    this.arrastrando.set(null);
    this.sobre.set(null);
  }

  /** La suelta encima de otra: va a ocupar el lugar de esa. */
  protected async soltarEn(destinoId: string): Promise<void> {
    const origenId = this.arrastrando();
    this.soltarNada();
    if (origenId === null || origenId === destinoId) return;

    const order = this.categories().map((category) => category.id);
    const from = order.indexOf(origenId);
    const to = order.indexOf(destinoId);
    if (from === -1 || to === -1) return;

    await this.guardarOrden(moverEnLista(order, from, to));
  }

  protected async moveCategory(categoryId: string, delta: number): Promise<void> {
    const order = this.categories().map((category) => category.id);
    const from = order.indexOf(categoryId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;

    await this.guardarOrden(moverEnLista(order, from, to));
  }

  /**
   * Guarda el orden nuevo, venga de las flechas o del arrastre.
   *
   * Mira la respuesta: si el servidor lo rechaza y la pantalla recarga igual,
   * todo queda como estaba sin una palabra, y mover algo que no se mueve se
   * lee como que está roto.
   */
  private async guardarOrden(orderedIds: readonly string[]): Promise<void> {
    this.catError.set(null);

    const response = await this.auth.apiFetch(`${API}/menu/categories/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({ orderedIds }),
    });

    if (!response.ok) {
      this.catError.set('no pudimos cambiar el orden');
      return;
    }
    await this.load();
  }

  protected async deleteCategory(categoryId: string): Promise<void> {
    this.catError.set(null);

    const response = await this.auth.apiFetch(`${API}/menu/categories/${categoryId}`, {
      method: 'DELETE',
      headers: this.auth.headers(),
    });
    if (!response.ok) {
      // El motivo habitual es tener productos adentro, pero no es el único:
      // decirlo sin mirar mandaba a vaciar una categoría ya vacía.
      this.catError.set(
        this.countIn(categoryId) > 0
          ? 'esa categoría todavía tiene productos'
          : 'no pudimos eliminar la categoría',
      );
      return;
    }
    await this.load();
  }

  /** Moves the selected dish to another category. */
  protected async moveProduct(event: Event): Promise<void> {
    const productId = this.selected();
    if (productId === null) return;

    const categoryId = (event.target as HTMLSelectElement).value;
    const response = await this.auth.apiFetch(`${API}/menu/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({ categoryId }),
    });

    if (response.ok) await this.load();
  }

  /**
   * Los que no tienen foto, primero.
   *
   * Es la lista de lo que falta hacer: con veinte platos cargados, los que ya
   * tienen foto son ruido, y buscar el que falta entre ellos es el trabajo
   * que esta pantalla viene a ahorrar.
   */
  protected readonly sinFotoPrimero = computed(() => {
    const sinFoto = this.products().filter((product) => this.thumb(product) === null);
    const conFoto = this.products().filter((product) => this.thumb(product) !== null);
    return [...sinFoto, ...conFoto];
  });

  /** Cuántos platos siguen sin foto, para decirlo antes de la lista. */
  protected readonly faltanFoto = computed(
    () => this.products().filter((product) => this.thumb(product) === null).length,
  );

  protected selectedName(): string {
    return this.products().find((product) => product.id === this.selected())?.name ?? '';
  }

  /** Smallest variant is plenty for a 56px row thumbnail. */
  protected thumb(product: MenuProduct): string | null {
    const variants = product.imageSet?.variants ?? [];
    const webp = variants.filter((variant) => variant.format === 'webp');
    const url = webp.find((variant) => variant.width === 80)?.url ?? webp[0]?.url ?? null;
    if (url === null) return null;

    const version = this.photoVersion();
    if (version === 0) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  protected async createProduct(event: Event): Promise<void> {
    event.preventDefault();
    this.createError.set(null);

    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const pesos = Number(data.get('price'));

    if (!Number.isFinite(pesos) || pesos < 0) {
      this.createError.set('el precio no es válido');
      return;
    }

    const response = await this.auth.apiFetch(`${API}/menu/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({
        name: String(data.get('name') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
        // The form takes pesos; the domain stores integer minor units.
        priceMinor: Math.round(pesos * 100),
        categoryId: String(data.get('categoryId') ?? ''),
        diets: this.dietOptions
          .filter((diet) => data.get(`diet-${diet.id}`) !== null)
          .map((diet) => diet.id),
      }),
    });

    if (!response.ok) {
      // The API says which field it rejected; repeating "no pudimos" for
      // everything left people guessing what to change.
      const detail = (await response.json().catch(() => null)) as
        | { message?: unknown; kind?: string }
        | null;
      const issues = Array.isArray(detail) ? detail : (detail?.message ?? null);
      const first = Array.isArray(issues)
        ? (issues[0] as { path?: string[] } | undefined)?.path?.[0]
        : undefined;

      this.createError.set(
        first === 'categoryId'
          ? 'Elegí una categoría'
          : first === 'name'
            ? 'Poné un nombre'
            : first === 'priceMinor'
              ? 'Revisá el precio'
              : 'No pudimos agregarlo a la carta',
      );
      return;
    }

    const created = (await response.json()) as { id?: string; name?: string };
    form.reset();
    await this.load();

    // Creating a dish and photographing it is one task, so the new dish is
    // selected straight away and the editor opens on it. Without this the
    // owner had to hunt for it in the list to add a picture.
    if (created.id !== undefined) {
      this.select(created.id);
    }

    // El modal se cierra y el aviso queda sobre la carta, donde el plato
    // recién aparece: dejarlo abierto obligaba a cerrarlo a mano para
    // comprobar que el plato estaba, que es lo único que interesa saber.
    this.modal.set(null);
    this.createdName.set(created.name ?? 'Se agregó');
    globalThis.setTimeout(() => this.createdName.set(null), 4000);
  }

  protected select(id: string): void {
    this.selected.set(id);
    this.status.set(null);
    this.editError.set(null);
    this.editSaved.set(false);
    this.modal.set('editar');

    // Sin saltar de solapa: tocar un plato abre su ficha para editarlo, y
    // saltar al editor de fotos decía "editando X" sin que nadie lo hubiera
    // pedido — la foto es una de las cosas que se le pueden cambiar, no la
    // única ni la primera.

    // Show the dish's current photo, if it has one, instead of whatever the
    // previous upload left on screen.
    const existing = this.products().find((product) => product.id === id)?.imageSet ?? null;
    this.result.set(existing);
  }

  /* ── El descuento por pagar en efectivo ── */

  /** Lo que el dueño está escribiendo ahora. */
  protected readonly descuento = signal(0);

  /** Lo último confirmado por el servidor, para saber si hay algo que guardar. */
  protected readonly descuentoGuardado = signal(0);

  protected readonly guardandoDescuento = signal(false);
  protected readonly descuentoError = signal<string | null>(null);

  /**
   * Si el panel muestra sus controles.
   *
   * No es un dato nuevo: el descuento ya se apaga poniéndolo en cero, así que
   * el interruptor lee eso y no hace falta guardar nada más. Prenderlo abre
   * los controles; apagarlo guarda cero, que es lo que apaga de verdad.
   */
  protected readonly descuentoActivo = signal(false);

  /**
   * Una mesa de veinte mil, para el ejemplo.
   *
   * Un porcentaje suelto no dice cuánto resigna el local hasta que uno hace
   * la cuenta, y esa cuenta con la calculadora del teléfono es exactamente lo
   * que este ejemplo evita.
   */
  protected readonly ejemploConsumo = { amountInMinorUnits: 2_000_000, currency: 'ARS' };

  protected readonly ejemploAhorro = computed(() => ({
    amountInMinorUnits: Math.round(this.ejemploConsumo.amountInMinorUnits * (this.descuento() / 100)),
    currency: this.ejemploConsumo.currency,
  }));

  protected readonly ejemploConDescuento = computed(() => ({
    amountInMinorUnits:
      this.ejemploConsumo.amountInMinorUnits - this.ejemploAhorro().amountInMinorUnits,
    currency: this.ejemploConsumo.currency,
  }));

  /* ── El acceso del personal ── */

  /** Qué persona está esperando su PIN, para apagar sólo ese botón. */
  protected readonly generandoPin = signal<string | null>(null);

  /** El PIN recién creado. Se ve una vez y después no existe más. */
  protected readonly pinNuevo = signal<{
    nombre: string;
    usuario: string;
    pin: string;
  } | null>(null);

  protected readonly copiado = signal(false);
  protected readonly copiadoLink = signal(false);

  /**
   * Por dónde entra el personal.
   *
   * El slug del restaurante ya es su identificador, así que el link no hay que
   * crearlo ni administrarlo: sale de lo que el local ya tiene.
   */
  protected readonly linkDelLocal = computed(() => {
    const slug = this.auth.profile()?.tenantId ?? '';
    return `${globalThis.location.origin}/${slug}`;
  });

  protected async generarPin(member: { id: string; displayName: string }): Promise<void> {
    this.generandoPin.set(member.id);
    this.copiado.set(false);

    try {
      const respuesta = await fetch(`${API}/staff/${member.id}/pin`, {
        method: 'POST',
        headers: this.auth.headers(),
      });
      if (!respuesta.ok) return;

      const { usuario, pin } = (await respuesta.json()) as { usuario: string; pin: string };
      this.pinNuevo.set({ nombre: member.displayName, usuario, pin });
    } catch {
      // Sin conexión no se generó nada: el PIN viejo sigue sirviendo.
    } finally {
      this.generandoPin.set(null);
    }
  }

  /** Los tres datos juntos, listos para mandar por WhatsApp. */
  protected async copiarAcceso(datos: {
    nombre: string;
    usuario: string;
    pin: string;
  }): Promise<void> {
    const texto = [
      `Entrá por acá: ${this.linkDelLocal()}`,
      `Usuario: ${datos.usuario}`,
      `PIN: ${datos.pin}`,
    ].join('\n');

    await this.alPortapapeles(texto, this.copiado);
  }

  protected async copiarLink(): Promise<void> {
    await this.alPortapapeles(this.linkDelLocal(), this.copiadoLink);
  }

  /**
   * Copia y avisa que copió.
   *
   * Sin el aviso nadie sabe si funcionó, y termina copiando tres veces por las
   * dudas. Vuelve solo a los dos segundos.
   */
  private async alPortapapeles(texto: string, marca: WritableSignal<boolean>): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      marca.set(true);
      setTimeout(() => marca.set(false), 2000);
    } catch {
      // Sin permiso al portapapeles, el texto está a la vista para copiarlo
      // a mano: no hay nada que avisar.
    }
  }

  /* ── Las reseñas de Google ── */

  protected readonly resenaUrl = signal('');
  protected readonly resenaGuardada = signal('');
  protected readonly guardandoResena = signal(false);
  protected readonly resenaError = signal<string | null>(null);
  protected readonly resenaOfrecidas = signal(0);
  protected readonly resenaTocadas = signal(0);

  /** Qué porcentaje de los que lo vieron lo tocó. */
  protected readonly tasaDeResenas = computed(() => {
    const vistas = this.resenaOfrecidas();
    return vistas === 0 ? 0 : Math.round((this.resenaTocadas() / vistas) * 100);
  });

  protected cambiarResena(evento: Event): void {
    this.resenaUrl.set((evento.target as HTMLInputElement).value);
    this.resenaError.set(null);
  }

  protected async guardarResena(): Promise<void> {
    this.guardandoResena.set(true);
    this.resenaError.set(null);

    try {
      const respuesta = await fetch(`${API}/ajustes/resenas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
        body: JSON.stringify({ url: this.resenaUrl() }),
      });

      if (!respuesta.ok) {
        // El error dice qué está mal con el link, no "algo falló": quien pegó
        // la dirección de su web tiene que saber que ése es el problema.
        const detalle = (await respuesta.json().catch(() => null)) as { kind?: string } | null;
        this.resenaError.set(
          detalle?.kind === 'NO_ES_DE_GOOGLE'
            ? 'Ese link no es de Google. Copialo desde tu Perfil de Empresa.'
            : detalle?.kind === 'NO_ES_UNA_URL'
              ? 'Eso no parece un link. Tiene que empezar con https://'
              : 'No pudimos guardarlo. Probá de nuevo.',
        );
        return;
      }

      const { resenaUrl } = (await respuesta.json()) as { resenaUrl: string | null };
      this.resenaGuardada.set(resenaUrl ?? '');
      this.resenaUrl.set(resenaUrl ?? '');
    } catch {
      this.resenaError.set('Sin conexión. Fijate la red y probá de nuevo.');
    } finally {
      this.guardandoResena.set(false);
    }
  }

  protected cambiarDescuento(evento: Event): void {
    const valor = Number((evento.target as HTMLInputElement).value);
    // Se acota acá y no sólo al guardar: escribir 500 y ver 500 hasta tocar
    // el botón hace pensar que se puede.
    this.descuento.set(Number.isFinite(valor) ? Math.min(50, Math.max(0, Math.trunc(valor))) : 0);
    this.descuentoError.set(null);
  }

  private async cargarDescuento(): Promise<void> {
    try {
      const respuesta = await fetch(`${API}/ajustes`, { headers: this.auth.headers() });
      if (!respuesta.ok) return;

      const ajustes = (await respuesta.json()) as {
        descuentoEfectivo: number;
        resenaUrl: string | null;
        resenaOfrecidas: number;
        resenaTocadas: number;
      };
      this.descuento.set(ajustes.descuentoEfectivo);
      this.descuentoGuardado.set(ajustes.descuentoEfectivo);
      this.descuentoActivo.set(ajustes.descuentoEfectivo > 0);
      this.resenaUrl.set(ajustes.resenaUrl ?? '');
      this.resenaGuardada.set(ajustes.resenaUrl ?? '');
      this.resenaOfrecidas.set(ajustes.resenaOfrecidas);
      this.resenaTocadas.set(ajustes.resenaTocadas);
    } catch {
      // Sin conexión el formulario queda en cero: no se anuncia un descuento
      // que no sabemos si existe.
    }
  }

  /**
   * Prender abre los controles; apagar guarda cero y los cierra.
   *
   * Prender propone 10 en vez de dejar el campo en cero, que es el valor que
   * significa apagado: el interruptor diría "prendido" y la pantalla, "no
   * aparece en ningún lado". Se propone y no se guarda — el número lo elige
   * el local, y el botón sigue siendo el que lo confirma.
   */
  protected async alternarDescuento(): Promise<void> {
    if (!this.descuentoActivo()) {
      if (this.descuento() === 0) this.descuento.set(DESCUENTO_SUGERIDO);
      this.descuentoActivo.set(true);
      return;
    }

    this.descuento.set(0);
    await this.guardarDescuento();
    if (this.descuentoError() === null) this.descuentoActivo.set(false);
  }

  protected async guardarDescuento(): Promise<void> {
    this.guardandoDescuento.set(true);
    this.descuentoError.set(null);

    try {
      const respuesta = await fetch(`${API}/ajustes/descuento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
        body: JSON.stringify({ puntos: this.descuento() }),
      });

      if (!respuesta.ok) {
        this.descuentoError.set('No pudimos guardarlo. Probá de nuevo.');
        return;
      }
      this.descuentoGuardado.set(this.descuento());
    } catch {
      this.descuentoError.set('Sin conexión. Fijate la red y probá de nuevo.');
    } finally {
      this.guardandoDescuento.set(false);
    }
  }

  protected format(price: { amountInMinorUnits: number; currency: string }): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: price.currency,
      maximumFractionDigits: 0,
    }).format(price.amountInMinorUnits / 100);
  }

  protected best(set: { variants: Array<{ url: string; width: number; format: string }> }): string {
    return set.variants.find((v) => v.width === 300 && v.format === 'webp')?.url ?? '';
  }

  /**
   * Por qué no entró la foto, con lo que el servidor haya dicho.
   *
   * Antes todo lo que no fuera "no es una imagen" salía como "no pudimos
   * procesar la imagen", y ahí terminaba: el motivo venía en la respuesta y se
   * tiraba. Con una foto que falla y nada que leer, lo único que queda es
   * probar otra a ver si esa anda.
   */
  private porQueFalloLaFoto(
    error: { kind?: string; bytes?: number; limit?: number; detail?: string } | null,
  ): string {
    if (error === null) return 'no pudimos procesar la imagen';

    switch (error.kind) {
      case 'UNSUPPORTED_TYPE':
        return 'ese archivo no es una imagen válida';
      case 'SIN_ALMACENAMIENTO':
        return 'falta configurar dónde se guardan las fotos — se perderían en el próximo despliegue';
      case 'TOO_LARGE': {
        const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);
        return error.bytes === undefined || error.limit === undefined
          ? 'la foto pesa de más'
          : `la foto pesa ${mb(error.bytes)} MB y el máximo es ${mb(error.limit)} MB`;
      }
      case 'EMPTY_FILE':
        return 'ese archivo está vacío';
      case 'INVALID_PARAMS':
        return 'el recorte quedó fuera de la foto — probá con Restablecer';
      default:
        // Lo que haya dicho el servidor, tal cual: es más útil que "algo
        // salió mal", aunque no esté escrito para el dueño del local.
        return error.detail ?? 'no pudimos procesar la imagen';
    }
  }

  /** Sends the original plus the parameters — never a rasterised canvas. */
  protected async upload(event: { params: ImageEditParams; file: File | null }): Promise<void> {
    const productId = this.selected();
    if (productId === null) return;

    // La cortina se levanta acá y se baja en el `finally`: cualquier salida
    // —éxito, error, o una excepción de red— tiene que destaparla, o el
    // editor queda inutilizable con una foto que ya se subió.
    this.subiendo.set(true);
    this.status.set(null);

    try {
      const alt = this.products().find((p) => p.id === productId)?.name ?? '';

      /*
       * Sin archivo nuevo, se reencuadra la que ya está.
       *
       * El original vive en el servidor: mandarlo de nuevo para mover el
       * recorte sería subir varios megas por un cambio de coordenadas, y el
       * dueño no tiene el archivo a mano —lo subió la semana pasada desde otro
       * teléfono—, así que exigirlo era pedirle algo que no puede dar.
       */
      const response =
        event.file === null
          ? await this.auth.apiFetch(`${API}/images/${productId}/reedit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
              body: JSON.stringify({ alt, params: event.params }),
            })
          : await this.subirElOriginal(productId, alt, event.file, event.params);

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
          kind?: string;
          bytes?: number;
          limit?: number;
          detail?: string;
        } | null;
        this.status.set(`error: ${this.porQueFalloLaFoto(detail)}`);
        return;
      }

      const created = (await response.json()) as {
        imageSet: { variants: Array<{ url: string; width: number; format: string }>; lqip: string };
      };

      // Variant URLs never change, so the browser would keep serving the
      // previous render from cache. A version marker forces a re-fetch.
      const version = Date.now();
      this.result.set({
        ...created.imageSet,
        variants: created.imageSet.variants.map((variant) => ({
          ...variant,
          url: `${variant.url}${variant.url.includes('?') ? '&' : '?'}v=${version}`,
        })),
      });

      this.avisarYBorrar('Listo · la foto ya está en la carta');
      this.photoVersion.set(version);

      // Re-read the menu so the list on the left shows the new thumbnail.
      await this.load();
    } finally {
      this.subiendo.set(false);
    }
  }

  /**
   * Manda el original y sus parámetros de recorte.
   *
   * El archivo tal cual lo eligió el dueño, nunca el canvas rasterizado: el
   * servidor tiene que poder volver a renderizar desde el original cuando se
   * cambie el encuadre, y una copia ya recortada perdería lo que quedó afuera.
   */
  private async subirElOriginal(
    productId: string,
    alt: string,
    file: File,
    params: ImageEditParams,
  ): Promise<Response> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);

    return this.auth.apiFetch(`${API}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth.headers() },
      body: JSON.stringify({ imageId: productId, alt, data: btoa(binary), params }),
    });
  }

  /**
   * El aviso de que salió bien, que se va solo.
   *
   * La foto nueva aparece en el editor y en la lista de la izquierda, así que
   * el texto sobra apenas se leyó: dejarlo hacía dudar de si correspondía a
   * esta subida o a la anterior. El error no se va, porque ahí sí hay algo que
   * decidir.
   */
  private avisarYBorrar(mensaje: string): void {
    this.status.set(mensaje);

    clearTimeout(this.borrarElAviso);
    this.borrarElAviso = setTimeout(() => {
      // Sólo si sigue siendo el mismo: un error posterior no se borra por el
      // reloj de un éxito anterior.
      if (this.status() === mensaje) this.status.set(null);
    }, SEGUNDOS_DEL_AVISO * 1000);
  }

  private borrarElAviso: ReturnType<typeof setTimeout> | undefined;
}
