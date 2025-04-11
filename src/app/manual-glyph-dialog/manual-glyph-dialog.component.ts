import { ChangeDetectionStrategy, Component, computed, DestroyRef, Inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { Glyph, GlyphGeometry } from '../ocr-manager/worker-api';
import { TrunicGeometryPreviewComponent } from "../trunic-geometry-preview/trunic-geometry-preview.component";


@Component({
  selector: 'app-manual-glyph-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInput, MatCheckbox, MatButton, TrunicGeometryPreviewComponent],
  providers: [{ provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } }],
  templateUrl: './manual-glyph-dialog.component.html',
  styleUrl: './manual-glyph-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualGlyphDialogComponent {
  readonly glyphForm = fb.group({
    x: this.data.glyph.origin[0],
    y: this.data.glyph.origin[1],
    sc1: !!(this.data.glyph.strokes & (1 << 0)),
    sc2: !!(this.data.glyph.strokes & (1 << 1)),
    sc3: !!(this.data.glyph.strokes & (1 << 2)),
    sc4: !!(this.data.glyph.strokes & (1 << 3)),
    sc5: !!(this.data.glyph.strokes & (1 << 4)),
    sc6: !!(this.data.glyph.strokes & (1 << 5)),
    sv1: !!(this.data.glyph.strokes & (1 << 6)),
    sv2: !!(this.data.glyph.strokes & (1 << 7)),
    sv3: !!(this.data.glyph.strokes & (1 << 8)),
    sv4: !!(this.data.glyph.strokes & (1 << 9)),
    sv5: !!(this.data.glyph.strokes & (1 << 10)),
    sf: !!(this.data.glyph.strokes & (1 << 11)),
  });

  readonly #glyphFormValue;

  readonly glyphX = toSignal(this.glyphForm.get('x')!.valueChanges, { initialValue: this.glyphForm.getRawValue().x });
  readonly glyphY = toSignal(this.glyphForm.get('y')!.valueChanges, { initialValue: this.glyphForm.getRawValue().y });

  readonly glyphStrokes = computed(() => {
    const fv = this.#glyphFormValue();
    return [fv.sc1, fv.sc2, fv.sc3, fv.sc4, fv.sc5, fv.sc6, fv.sv1, fv.sv2, fv.sv3, fv.sv4, fv.sv5, fv.sf].reduce((acc, v, i) => acc | (+v << i), 0);
  });

  readonly glyphResult = computed<Glyph>(() => {
    return {
      origin: [this.glyphX(), this.glyphY()],
      strokes: this.glyphStrokes(),
    };
  });

  constructor(@Inject(MAT_DIALOG_DATA) readonly data: ManualGlyphDialogInput, destroyRef: DestroyRef) {
    this.#glyphFormValue = signal(this.glyphForm.getRawValue());
    const subn = this.glyphForm.valueChanges.subscribe(() => this.glyphForm.valid && this.#glyphFormValue.set(this.glyphForm.getRawValue()));
    destroyRef.onDestroy(() => subn.unsubscribe());
  }
}

export type ManualGlyphDialogInput = {
  isNew: boolean;
  geometry: GlyphGeometry;
  inputImage: ImageBitmap;
  glyph: Glyph;
}

const fb = new FormBuilder().nonNullable;
