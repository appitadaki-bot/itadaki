import { type ElementRef, type Signal, effect } from '@angular/core';

/**
 * Cuánto aire dejarle al timbre por encima del pie.
 *
 * Pegado al borde, el timbre se lee como parte de la barra.
 */
const AIRE = 12;

/**
 * Publica el alto del pie para que el timbre se pare encima y no lo tape.
 *
 * Se mide en vez de fijarlo: el pie de una pantalla tiene un botón o dos según
 * lo que la mesa haya hecho, y un valor fijo tapa algo en uno de los casos o
 * deja un hueco en el otro. Con `ResizeObserver` también acierta cuando el
 * texto se parte en dos líneas, que es lo que pasa en pantallas angostas.
 *
 * Escribe en la raíz del documento y no en el `:host` de la pantalla: el
 * timbre lo monta el componente raíz, fuera de la página, así que no hereda
 * nada de ella. Las dos declaraciones que había en los `:host` no hacían nada
 * por ese motivo — el timbre se paraba donde le indicaba su valor por defecto,
 * y en el carrito eso caía sobre el segundo botón.
 */
export function medirElPie(pie: Signal<ElementRef<HTMLElement> | undefined>): void {
  effect((onCleanup) => {
    const elemento = pie()?.nativeElement;
    if (elemento === undefined) return;

    const raiz = elemento.ownerDocument.documentElement;

    const medir = (): void => {
      const alto = elemento.getBoundingClientRect().height;
      raiz.style.setProperty('--itadaki-call-offset', `${Math.round(alto) + AIRE}px`);
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);

    onCleanup(() => {
      observador.disconnect();
      // Al salir de la pantalla se suelta: la siguiente puede no tener pie, y
      // dejar el valor puesto le deja al timbre un hueco que no corresponde.
      raiz.style.removeProperty('--itadaki-call-offset');
    });
  });
}
