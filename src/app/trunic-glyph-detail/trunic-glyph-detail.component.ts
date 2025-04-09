import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { GlyphGeometry } from '../ocr-manager/worker-api';
import * as trunic_data from '../trunic-data';
import { TrunicGlyphImageComponent } from "../trunic-glyph-image/trunic-glyph-image.component";
import * as defaultGlyphGeometry from './default-glyph-geometry.json';

@Component({
  selector: 'app-trunic-glyph-detail',
  imports: [MatCardModule, NgTemplateOutlet, TrunicGlyphImageComponent, MatIconModule, MatIconButton],
  templateUrl: './trunic-glyph-detail.component.html',
  styleUrl: './trunic-glyph-detail.component.scss'
})
export class TrunicGlyphDetailComponent {
  readonly strokesPacked = input.required<number>();
  readonly pronctnSystem = input.required<trunic_data.PronunciationSystem>();
  readonly editClick = output<void>();
  readonly deleteClick = output<void>();

  readonly _dataC = computed(() => {
    const strokesC = this.strokesPacked() & 0x3F;
    const cnsnt_i = trunic_data.CNSNT_LUT[strokesC];
    if (cnsnt_i < 0) return cnsnt_i === -128 ? undefined : [strokesC, '???'] as const;
    return [strokesC, this.pronctnSystem().consonants[cnsnt_i], trunic_data.CONSONANTS_EXAMPLES[cnsnt_i]] as const;
  });
  readonly _dataV = computed(() => {
    const strokesV = (this.strokesPacked() >> 6) & 0x1F;
    const vowel_i = trunic_data.VOWEL_LUT[strokesV];
    if (vowel_i < 0) return vowel_i === -128 ? undefined : [strokesV << 6, '???'] as const;
    return [strokesV << 6, this.pronctnSystem().vowels[vowel_i], trunic_data.VOWELS_EXAMPLES[vowel_i]] as const;
  });
  readonly _textFlip = computed(() => (this.strokesPacked() & (1 << 11)) !== 0);
  readonly _data = computed(() =>
    (this._textFlip() ? [this._dataV(), this._dataC()] : [this._dataC(), this._dataV()])
      .filter(v => v !== undefined)
  );

  readonly _DEFAULT_GLYPH_GEOMETRY = defaultGlyphGeometry as unknown as GlyphGeometry;
}
