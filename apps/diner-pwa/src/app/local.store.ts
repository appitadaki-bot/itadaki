import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from './api-client';

/**
 * Cómo se llama el restaurante donde está sentado el comensal.
 *
 * Aparte de `SessionStore`, que es de la mesa: el nombre del local no cambia
 * cuando alguien se une, se va o cierra la cuenta.
 *
 * Vive acá y no en cada pantalla porque lo quieren varias —la bienvenida y la
 * carta hoy— y cada una pidiéndolo por su cuenta son dos viajes contra una
 * API que en el plan gratis puede estar despertándose. Se pide una vez por
 * visita y las demás reusan lo que ya llegó.
 */
@Injectable({ providedIn: 'root' })
export class LocalStore {
  private readonly api = inject(ApiClient);

  /** Null hasta que llegue, y también si no llega. */
  readonly nombre = signal<string | null>(null);

  private pedido: Promise<void> | null = null;

  /** Pide el nombre si nadie lo pidió todavía. Llamarlo de más no cuesta. */
  cargar(): void {
    this.pedido ??= this.pedir();
  }

  /**
   * Un fallo lo deja en null, que es el mismo estado que tiene alguien que
   * abrió la app sin escanear el QR: la pantalla ya sabe vivir sin nombre.
   * Nunca un error a la vista — ninguna de las pantallas que lo usan es
   * lugar para contarle un problema a un comensal.
   */
  private async pedir(): Promise<void> {
    try {
      const respuesta = await this.api.fetch('/ajustes/publicos');
      if (!respuesta.ok) return;

      const ajustes = (await respuesta.json()) as { nombre: string | null };
      this.nombre.set(ajustes.nombre);
    } catch {
      // Queda sin nombre.
    }
  }
}
