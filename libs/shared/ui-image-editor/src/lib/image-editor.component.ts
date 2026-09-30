import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Elegir la foto del plato. Nada más.
 *
 * Tuvo seis controles —nitidez, radio, desenfoque, brillo, saturación y un
 * punto de foco—, después quedó en recortar y mover, y ahora en elegir el
 * archivo. Lo que sacó el recorte fue que la foto ya entraba cortada al
 * editor: el cuadrado se comía los costados de una apaisada, y arrastrarla
 * sólo elegía qué mitad del plato se perdía. La foto entra entera y el
 * servidor rellena lo que le falta para ser cuadrada.
 *
 * Acá no se rasteriza nada: se manda el archivo original y el servidor
 * renderiza desde ahí.
 */
@Component({
  selector: 'itd-image-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './image-editor.component.css',
  template: `
    <div class="editor">
      @if (sourceUrl(); as url) {
        <div class="stage">
          <img class="layer" [src]="url" alt="" />
        </div>

        <!-- Dice qué se está viendo y, de paso, por qué "Aplicar" está
             apagado: esta foto ya está en la carta, y lo único que queda por
             hacer con ella es reemplazarla. -->
        @if (showingExisting()) {
          <p class="existing-note" role="status">
            Ésta es la foto guardada · subí otra para reemplazarla
          </p>
        }

        <div class="actions">
          <label class="ghost file-swap">
            {{ showingExisting() ? 'Subir otra foto' : 'Cambiar foto' }}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              (change)="onFile($event)"
            />
          </label>
          <button type="button" class="primary" [disabled]="showingExisting()" (click)="emit()">
            Aplicar
          </button>
        </div>
      } @else {
        <label class="dropzone">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" (change)="onFile($event)" />
          <span class="dropzone-title">elegí una foto</span>
          <span class="dropzone-hint">JPG, PNG, WebP o AVIF · hasta 15 MB</span>
        </label>
      }
    </div>
  `,
})
export class ImageEditorComponent {
  /** Changing this clears the editor: a new dish must not inherit the last photo. */
  readonly subjectId = input<string>('');

  /** Photo the subject already has, shown so the editor opens on real content. */
  readonly existingUrl = input<string | null>(null);

  readonly applied = output<{ file: File }>();

  protected readonly sourceUrl = signal<string | null>(null);
  /** True while showing the stored photo: there is nothing to apply. */
  protected readonly showingExisting = signal(false);

  private file: File | null = null;
  private objectUrl: string | null = null;

  constructor() {
    effect(() => {
      // Depend on both inputs so switching dishes wipes the previous photo
      // and falls back to whatever the new dish already has.
      this.subjectId();
      const existing = this.existingUrl();

      this.clear();
      if (existing !== null && existing !== '') {
        this.sourceUrl.set(existing);
        this.showingExisting.set(true);
      }
    });
  }

  /** Drops the loaded photo. */
  private clear(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.file = null;
    this.sourceUrl.set(null);
    this.showingExisting.set(false);
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (picked === undefined) return;

    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.file = picked;
    const url = URL.createObjectURL(picked);
    this.objectUrl = url;
    this.sourceUrl.set(url);
    this.showingExisting.set(false);
  }

  protected emit(): void {
    const file = this.file;
    if (file === null) return;
    this.applied.emit({ file });
  }
}
