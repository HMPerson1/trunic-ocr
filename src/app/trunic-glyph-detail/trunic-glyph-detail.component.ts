import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import * as trunic_data from '../trunic-data';

@Component({
  selector: 'app-trunic-glyph-detail',
  standalone: true,
  imports: [MatCardModule, NgTemplateOutlet],
  templateUrl: './trunic-glyph-detail.component.html',
  styleUrl: './trunic-glyph-detail.component.scss'
})
export class TrunicGlyphDetailComponent {
  readonly strokesPacked = input.required<number>();
  readonly pronctnSystem = input.required<trunic_data.PronunciationSystem>();

  readonly _dataC = computed(() => {
    const cnsnt_i = trunic_data.CNSNT_LUT[this.strokesPacked() & 0x3F];
    console.log(cnsnt_i);
    if (cnsnt_i < 0) return cnsnt_i === -128 ? undefined : '???' as const;
    return [this.pronctnSystem().consonants[cnsnt_i], trunic_data.CONSONANTS_EXAMPLES[cnsnt_i]] as const;
  });
  readonly _dataV = computed(() => {
    const vowel_i = trunic_data.VOWEL_LUT[(this.strokesPacked() >> 6) & 0x1F];
    console.log(vowel_i);
    if (vowel_i < 0) return vowel_i === -128 ? undefined : '???' as const;
    return [this.pronctnSystem().vowels[vowel_i], trunic_data.VOWELS_EXAMPLES[vowel_i]] as const;
  });
  readonly _textFlip = computed(() => (this.strokesPacked() & (1 << 11)) !== 0);
  readonly _data = computed(() => this._textFlip() ? [this._dataV(), this._dataC()] : [this._dataC(), this._dataV()]);
}
