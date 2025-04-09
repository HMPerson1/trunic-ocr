import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import * as rxjs from 'rxjs';
import { ManualGlyphDialogComponent, type ManualGlyphDialogInput } from '../manual-glyph-dialog/manual-glyph-dialog.component';
import { OcrManagerService, type UiGlyph } from '../ocr-manager/ocr-manager.service';
import type { Glyph, GlyphGeometry } from '../ocr-manager/worker-api';
import { OcrManualControlPanelComponent } from '../ocr-manual-control-panel/ocr-manual-control-panel.component';
import type { PronunciationSystem } from '../trunic-data';
import { TrunicGlyphComponent } from "../trunic-glyph/trunic-glyph.component";
import { OcrOverlayDetailsOpenerDirective } from './ocr-overlay-details-opener.directive';

@Component({
  selector: 'app-ocr-overlay',
  imports: [TrunicGlyphComponent, OcrOverlayDetailsOpenerDirective],
  templateUrl: './ocr-overlay.component.html',
  styleUrl: './ocr-overlay.component.scss',
  host: {
    '[style.transform]': 'viewTransform()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcrOverlayComponent {
  readonly manualPanel = input.required<OcrManualControlPanelComponent | undefined>();
  readonly pronctnSystem = input.required<PronunciationSystem>();
  readonly imgTransform = input.required<DOMMatrixReadOnly>();

  readonly geometry = computed<GlyphGeometry | undefined>(() => this.manualPanel()?.manualGlyphGeometry() ?? this.ocrManager.autoOcrState()?.recognizedGeometry?.());
  readonly glyphs = computed<ReadonlyArray<UiGlyph>>(() => this.manualPanel()?.manualGlyphsDisplay() ?? this.ocrManager.autoOcrState()?.recognizedGlyphs?.() ?? []);
  readonly viewTransform = computed(() => {
    const geometry_ = this.geometry();
    return geometry_ !== undefined ? this.imgTransform().scale(1 / geometry_.upscale).translate(-geometry_.glyph_template_origin[0], -geometry_.glyph_template_origin[1]) : undefined;
  });

  constructor(
    private readonly matDialog: MatDialog,
    private readonly ocrManager: OcrManagerService,
  ) { }

  async editGlyph(tgtGlyphId: number) {
    const manualPanel = this.manualPanel();
    if (manualPanel !== undefined) {
      manualPanel.editGlyphClick(manualPanel.manualGlyphsDisplay().findIndex(g => g.id === tgtGlyphId));
    } else {
      const autoOcrState = this.ocrManager.autoOcrState();
      if (autoOcrState?.recognizedGlyphs === undefined) return;
      const dialogInput: Partial<ManualGlyphDialogInput> = {
        isNew: false,
        geometry: autoOcrState.recognizedGeometry?.(),
        inputImage: autoOcrState.imageRenderable(),
        glyph: autoOcrState.recognizedGlyphs().find(g => g.id === tgtGlyphId),
      };
      if (dialogInput.geometry == null || dialogInput.inputImage == null || dialogInput.glyph == null) return;
      const dialogRef = this.matDialog.open(ManualGlyphDialogComponent, { data: dialogInput });
      const res: Glyph | undefined = await rxjs.firstValueFrom(dialogRef.afterClosed());
      if (res != null) {
        autoOcrState.recognizedGlyphs.update(prev => prev.with(prev.findIndex(g => g.id === tgtGlyphId), { id: tgtGlyphId, ...res }));
      }
    }
  }

  deleteGlyph(tgtGlyphId: number) {
    const manualPanel = this.manualPanel();
    if (manualPanel !== undefined) {
      manualPanel.deleteGlyphClick(manualPanel.manualGlyphsDisplay().findIndex(g => g.id === tgtGlyphId));
    } else {
      this.ocrManager.autoOcrState()?.recognizedGlyphs?.update(prev => prev.toSpliced(prev.findIndex(({ id }) => id === tgtGlyphId), 1));
    }
  }
}
