import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Component, input, type OnDestroy } from '@angular/core';
import type { Glyph, GlyphGeometry } from '../ocr-manager/worker-api';
import type { PronunciationSystem } from '../trunic-data';
import { TrunicGlyphDetailComponent } from '../trunic-glyph-detail/trunic-glyph-detail.component';
import { TrunicGlyphComponent } from "../trunic-glyph/trunic-glyph.component";

@Component({
  selector: 'app-ocr-overlay',
  imports: [TrunicGlyphComponent],
  templateUrl: './ocr-overlay.component.html',
  styleUrl: './ocr-overlay.component.scss'
})
export class OcrOverlayComponent implements OnDestroy {
  readonly glyphs = input.required<ReadonlyArray<Glyph>>();
  readonly geometry = input.required<GlyphGeometry>();
  readonly pronctnSystem = input.required<PronunciationSystem>();

  constructor(private readonly cdkOverlay: Overlay) { }

  #currentOverlay: [EventTarget, OverlayRef] | undefined = undefined;

  async onGlyphToggle(event: Event, glyphStrokes: number) {
    if (event.target != null && (event as ToggleEvent).newState === 'open') {
      this.#currentOverlay?.[1].dispose();
      const overlayRef = this.cdkOverlay.create({
        positionStrategy: this.cdkOverlay.position()
          .flexibleConnectedTo(event.target as Element)
          .withPositions([
            { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top' },
            { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom' },
          ])
          .withFlexibleDimensions(false),
      });
      const compRef = overlayRef.attach(new ComponentPortal(TrunicGlyphDetailComponent));
      compRef.setInput('strokesPacked', glyphStrokes);
      compRef.setInput('pronctnSystem', this.pronctnSystem());
      this.#currentOverlay = [event.target, overlayRef];
    } else if (this.#currentOverlay && event.target === this.#currentOverlay[0]) {
      this.#currentOverlay[1].dispose();
    }
  }

  ngOnDestroy(): void {
    this.#currentOverlay?.[1].dispose();
  }
}
