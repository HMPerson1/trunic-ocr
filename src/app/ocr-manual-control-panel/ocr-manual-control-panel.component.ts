import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, DestroyRef, signal, type TrackByFunction } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import * as rxjs from 'rxjs';
import { CroppedImageRendererCanvasComponent } from '../cropped-image-renderer-canvas/cropped-image-renderer-canvas.component';
import { ManualGlyphDialogComponent, type ManualGlyphDialogInput } from '../manual-glyph-dialog/manual-glyph-dialog.component';
import { makeFullGlyphGeometry, OcrManagerService } from '../ocr-manager/ocr-manager.service';
import type { Glyph } from '../ocr-manager/worker-api';
import { TrunicGlyphImageComponent } from "../trunic-glyph-image/trunic-glyph-image.component";
import { DisplayStrokesPipe } from './display-strokes.pipe';

@Component({
  selector: 'app-ocr-manual-control-panel',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInput, TrunicGlyphImageComponent, CroppedImageRendererCanvasComponent, MatTableModule, DisplayStrokesPipe, MatIconButton, MatButton, MatIcon],
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

  constructor(
    private readonly matDialog: MatDialog,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly ocrManager: OcrManagerService,
    destroyRef: DestroyRef,
  ) {
    this.inputImage = computed(() => ocrManager.autoOcrState()?.imageRenderable());

    this.manualGlyphGeometry = signal(makeFullGlyphGeometry(this.geometryForm.getRawValue()));
    const subn = this.geometryForm.valueChanges.subscribe(() => {
      if (!this.geometryForm.valid) return;
      const geom = makeFullGlyphGeometry(this.geometryForm.getRawValue());
      this.manualGlyphGeometry.set(geom);
      ocrManager.autoOcrState()?.recognizedGeometry.set(geom);
    });
    destroyRef.onDestroy(() => subn.unsubscribe());
  }

  readonly manualGlyphs = new MatTableDataSource<Glyph & { readonly id: number }>();
  #lastGlyphId = 0;

  async addGlyphClick() {
    const inputImage = this.inputImage();
    if (inputImage === undefined) return;
    const geometry = this.manualGlyphGeometry();
    const dialogInput: ManualGlyphDialogInput = {
      isNew: true,
      geometry,
      inputImage,
      glyph: { origin: [this.previewX(), this.previewY()], strokes: 0 },
    };
    const dialogRef = this.matDialog.open(ManualGlyphDialogComponent, { data: dialogInput });
    const res: Glyph | undefined = await rxjs.firstValueFrom(dialogRef.afterClosed());
    if (res != null) {
      const glyphs = [...this.manualGlyphs.data, { id: this.#lastGlyphId++, ...res }];
      this.manualGlyphs.data = glyphs;
      this.ocrManager.autoOcrState()?.recognizedGlyphs.set(
        glyphs.map(({ origin, strokes }) => ({
          // TODO: uuuhhh this doesn't work when geom changes
          origin: [origin[0] - geometry.glyph_template_origin[0], origin[1] - geometry.glyph_template_origin[1]],
          strokes,
        }))
      );
    }
  }

  async editGlyphClick(index: number) {
    const inputImage = this.inputImage();
    if (inputImage === undefined) return;
    const geometry = this.manualGlyphGeometry();
    const origGlyph = this.manualGlyphs.data[index];
    const dialogInput: ManualGlyphDialogInput = {
      isNew: false,
      geometry,
      inputImage,
      glyph: origGlyph,
    };
    const dialogRef = this.matDialog.open(ManualGlyphDialogComponent, { data: dialogInput });
    const res: Glyph | undefined = await rxjs.firstValueFrom(dialogRef.afterClosed());
    if (res != null) {
      const glyphs = this.manualGlyphs.data.with(index, { id: origGlyph.id, ...res });
      this.manualGlyphs.data = glyphs;
      // apparently mdc table doesn't trigger change detection on data source emissions
      this.changeDetectorRef.markForCheck();
      this.ocrManager.autoOcrState()?.recognizedGlyphs.set(
        glyphs.map(({ origin, strokes }) => ({
          // TODO: uuuhhh this doesn't work when geom changes
          origin: [origin[0] - geometry.glyph_template_origin[0], origin[1] - geometry.glyph_template_origin[1]],
          strokes,
        }))
      );
    }
  }

  deleteGlyphClick(index: number) {
    const geometry = this.manualGlyphGeometry();
    const glyphs = this.manualGlyphs.data.toSpliced(index, 1);
    this.manualGlyphs.data = glyphs;
    this.ocrManager.autoOcrState()?.recognizedGlyphs.set(
      glyphs.map(({ origin, strokes }) => ({
        // TODO: uuuhhh this doesn't work when geom changes
        origin: [origin[0] - geometry.glyph_template_origin[0], origin[1] - geometry.glyph_template_origin[1]],
        strokes,
      }))
    );
  }

  readonly manualGlyphsTableTrackBy: TrackByFunction<{ readonly id: number; }> = (_i, { id }) => id;
}

const fb = new FormBuilder().nonNullable;
