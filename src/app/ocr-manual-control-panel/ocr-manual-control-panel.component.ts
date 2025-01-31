import { ChangeDetectionStrategy, Component, computed, DestroyRef, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { CroppedImageRendererCanvasComponent } from '../cropped-image-renderer-canvas/cropped-image-renderer-canvas.component';
import { OcrManagerService } from '../ocr-manager/ocr-manager.service';
import type { GlyphGeometry } from '../ocr-manager/worker-api';
import { TrunicGlyphImageComponent } from "../trunic-glyph-image/trunic-glyph-image.component";

@Component({
  selector: 'app-ocr-manual-control-panel',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInput, TrunicGlyphImageComponent, CroppedImageRendererCanvasComponent],
  providers: [{ provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } }],
  templateUrl: './ocr-manual-control-panel.component.html',
  styleUrl: './ocr-manual-control-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcrManualControlPanelComponent {
  readonly geometryForm = fb.group({
    upscale: fb.control(3, [Validators.min(1)]),
    size: fb.control(90, [Validators.min(0)]),
    angle: fb.control(30, [Validators.min(0), Validators.max(90)]),
    upper: fb.control(0),
    lower: fb.control(0),
    stroke_width: fb.control(18, [Validators.min(1)]),
  });
  readonly manualGlyphGeometry;

  readonly previewXCtrl = fb.control(0);
  readonly previewYCtrl = fb.control(0);
  readonly previewX = toSignal(this.previewXCtrl.valueChanges, { initialValue: 0 });
  readonly previewY = toSignal(this.previewYCtrl.valueChanges, { initialValue: 0 });
  readonly previewWindowSrcPx = computed(() => {
    const geom = this.manualGlyphGeometry();
    const [offX, offY] = geom.glyph_template_origin;
    return [(this.previewX() - offX) / geom.upscale, (this.previewY() - offY) / geom.upscale] as const;
  });
  readonly glyphSizeSrcPx = computed(() => {
    const geom = this.manualGlyphGeometry();
    const [height, width] = geom.glyph_template_shape;
    return { width: width / geom.upscale, height: height / geom.upscale };
  });

  readonly inputImage;

  constructor(ocrManager: OcrManagerService, destroyRef: DestroyRef) {
    this.inputImage = computed(() => ocrManager.autoOcrState()?.imageRenderable());

    this.manualGlyphGeometry = signal(makeFullGlyphGeometry(this.geometryForm.getRawValue()));
    const subn = this.geometryForm.valueChanges.subscribe(() => this.manualGlyphGeometry.set(makeFullGlyphGeometry(this.geometryForm.getRawValue())));
    destroyRef.onDestroy(() => subn.unsubscribe());
  }
}

type GeometryFormValue = {
  upscale: number,
  size: number,
  angle: number,
  upper: number,
  lower: number,
  stroke_width: number,
}

function makeFullGlyphGeometry(val: GeometryFormValue): GlyphGeometry {
  const a = val.angle * Math.PI / 180;
  const grid_x = val.size * Math.cos(a);
  const grid_y = val.size * Math.sin(a);
  const glyph_width = grid_x * 2;
  const glyph_height = val.lower + val.upper + val.size * 2 + grid_y * 2;
  const ox = Math.floor(val.stroke_width / 2) + val.upscale;
  const oy = val.upper + val.size + grid_y + Math.floor(val.stroke_width / 2) + val.upscale;
  const pu00x = ox;
  const pu00y = oy - val.upper - val.size;
  const pu10x = ox + grid_x;
  const pu10y = pu00y - grid_y;
  const pu01x = pu10x;
  const pu01y = pu00y + grid_y;
  const pu11x = ox + grid_x * 2;
  const pu11y = pu00y;
  const pl00x = ox;
  const pl00y = oy + val.lower + val.size;
  const pl10x = ox + grid_x;
  const pl10y = pl00y - grid_y;
  const pl01x = pl10x;
  const pl01y = pl00y + grid_y;
  const pl11x = ox + grid_x * 2;
  const pl11y = pl00y;
  return {
    upscale: val.upscale,
    stroke_width: val.stroke_width,
    glyph_width,
    glyph_template_shape: [
      Math.ceil(glyph_height) + 3 * val.stroke_width + val.upscale * 2,
      Math.ceil(glyph_width) + val.stroke_width + val.upscale * 2,
    ],
    glyph_template_origin: [ox, oy],
    all_lines: [
      [[[pu01x, pu01y], [pu11x, pu11y]]],
      [[[pu10x, pu10y], [pu10x, oy]]],
      [[[pu00x, pu00y], [pu01x, pu01y]]],
      [[[pl00x, pl00y], [pl10x, pl10y]]],
      [[[pu01x, pu01y], [pu01x, oy]], [[pl10x, pl10y], [pl01x, pl01y]]],
      [[[pl10x, pl10y], [pl11x, pl11y]]],
      [[[pu10x, pu10y], [pu11x, pu11y]]],
      [[[pu00x, pu00y], [pu10x, pu10y]]],
      [[[pu00x, pu00y], [pu00x, oy]], [[pl00x, pl00y - grid_y], [pl00x, pl00y]]],
      [[[pl00x, pl00y], [pl01x, pl01y]]],
      [[[pl01x, pl01y], [pl11x, pl11y]]],
      [],
      [[[ox, oy], [ox + glyph_width, oy]]],
    ],
    circle_center: [
      pl01x,
      pl01y + val.stroke_width,
    ],
  };
}

const fb = new FormBuilder().nonNullable;
