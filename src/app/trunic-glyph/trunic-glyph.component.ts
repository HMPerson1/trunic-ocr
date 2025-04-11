import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GlyphGeometry } from '../ocr-manager/worker-api';
import * as trunic_data from '../trunic-data';
import { TrunicGlyphImageComponent } from "../trunic-glyph-image/trunic-glyph-image.component";

@Component({
  selector: 'app-trunic-glyph',
  imports: [NgTemplateOutlet, TrunicGlyphImageComponent],
  templateUrl: './trunic-glyph.component.html',
  styleUrl: './trunic-glyph.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrunicGlyphComponent {
  readonly geometry = input.required<GlyphGeometry>();
  readonly strokesPacked = input.required<number>();
  readonly pronctnSystem = input.required<trunic_data.PronunciationSystem>();
  readonly _fontsize = computed(() =>
    (this.geometry().glyph_template_shape[1] - this.geometry().stroke_width) / 3
  );
  readonly _textC = computed(() => {
    const cnsnt_i = trunic_data.CNSNT_LUT[this.strokesPacked() & 0x3F];
    return cnsnt_i === -128 ? "" : cnsnt_i < 0 ? null : this.pronctnSystem().consonants[cnsnt_i][0];
  });
  readonly _textV = computed(() => {
    const vowel_i = trunic_data.VOWEL_LUT[(this.strokesPacked() >> 6) & 0x1F];
    return vowel_i === -128 ? "" : vowel_i < 0 ? null : this.pronctnSystem().vowels[vowel_i][0];
  });
  readonly _textFlip = computed(() => (this.strokesPacked() & (1 << 11)) !== 0);
}
