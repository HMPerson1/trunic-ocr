import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Directive, ElementRef, input, output, type OnDestroy } from '@angular/core';
import type { UiGlyph } from '../ocr-manager/ocr-manager.service';
import type { PronunciationSystem } from '../trunic-data';
import { TrunicGlyphDetailComponent } from '../trunic-glyph-detail/trunic-glyph-detail.component';

@Directive({
  selector: 'details[appOcrOverlayDetailsOpener]',
  host: {
    '(toggle)': 'onToggle($event)',
  },
})
export class OcrOverlayDetailsOpenerDirective implements OnDestroy {
  readonly glyph = input.required<UiGlyph>();
  readonly pronctnSystem = input.required<PronunciationSystem>();
  readonly editClick = output<number>();
  readonly deleteClick = output<number>();

  constructor(
    private readonly hostElem: ElementRef<HTMLDetailsElement>,
    private readonly cdkOverlay: Overlay,
  ) { }

  #currentOverlay: OverlayRef | undefined = undefined;

  onToggle(event: ToggleEvent) {
    this.#currentOverlay?.dispose();
    this.#currentOverlay = undefined;
    if (event.newState === 'open') {
      const overlayRef = this.cdkOverlay.create({
        positionStrategy: this.cdkOverlay.position()
          .flexibleConnectedTo(this.hostElem)
          .withPositions([
            { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top' },
            { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom' },
          ])
          .withFlexibleDimensions(false),
      });
      this.#currentOverlay = overlayRef;
      const compRef = overlayRef.attach(new ComponentPortal(TrunicGlyphDetailComponent));
      const glyph = this.glyph(); // capture value at popover opening time
      compRef.setInput('strokesPacked', glyph.strokes);
      compRef.setInput('pronctnSystem', this.pronctnSystem());
      compRef.instance.editClick.subscribe(() => {
        this.hostElem.nativeElement.open = false;
        this.editClick.emit(glyph.id);
      });
      compRef.instance.deleteClick.subscribe(() => {
        this.hostElem.nativeElement.open = false;
        this.deleteClick.emit(glyph.id);
      });
    }
  }

  ngOnDestroy(): void {
    this.#currentOverlay?.dispose();
  }
}
