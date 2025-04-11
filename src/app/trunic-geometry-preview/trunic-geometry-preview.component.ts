import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CroppedImageRendererCanvasComponent } from '../cropped-image-renderer-canvas/cropped-image-renderer-canvas.component';
import type { GlyphGeometry } from '../ocr-manager/worker-api';
import { TrunicGlyphImageComponent } from '../trunic-glyph-image/trunic-glyph-image.component';

@Component({
  selector: 'app-trunic-geometry-preview',
  imports: [CroppedImageRendererCanvasComponent, TrunicGlyphImageComponent],
  templateUrl: './trunic-geometry-preview.component.html',
  styleUrl: './trunic-geometry-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrunicGeometryPreviewComponent {
  readonly inputImage = input.required<ImageBitmap | undefined>();
  readonly geometry = input.required<GlyphGeometry>();
  readonly glyphX = input.required<number>();
  readonly glyphY = input.required<number>();
  readonly strokesPacked = input.required<number>();

  readonly previewWindowSrcPx = computed(() => {
    const geom = this.geometry();
    const [offX, offY] = geom.glyph_template_origin;
    return [(this.glyphX() - offX) / geom.upscale, (this.glyphY() - offY) / geom.upscale] as const;
  });
  readonly glyphSizeSrcPx = computed(() => {
    const geom = this.geometry();
    const [height, width] = geom.glyph_template_shape;
    return { width: width / geom.upscale, height: height / geom.upscale };
  });
}
