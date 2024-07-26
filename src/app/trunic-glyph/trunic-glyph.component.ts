import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GlyphGeometry } from '../pywork.service';

@Component({
  selector: 'app-trunic-glyph',
  standalone: true,
  imports: [],
  templateUrl: './trunic-glyph.component.svg',
  styleUrl: './trunic-glyph.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrunicGlyphComponent {
  readonly geometry = input.required<GlyphGeometry>();
  readonly strokesPacked = input.required<number>();
  readonly renderScale = input.required<number>();
  readonly _g = this.geometry;
  readonly _transformStr = computed(() => `scale(${this.renderScale()})`);
  readonly _renderData = computed(() =>
    this._g().all_lines
      .filter((_v, i) => i === 12 || ((this.strokesPacked() & (1 << i)) !== 0))
      .map(stroke => stroke.map(v => `${v[0][0]} ${v[0][1]} ${v[1][0]} ${v[1][1]}`))
  );
  readonly _fontsize = computed(() => (this._g().glyph_template_shape[1] - this._g().stroke_width) / 3);
  readonly _text = computed(() => {
    const c = CONSONANTS[this.strokesPacked() & 0x3F][0];
    const v = VOWELS[(this.strokesPacked() >> 6) & 0x1F][0];
    return (this.strokesPacked() & (1 << 11)) === 0 ? c + v : v + c;
  })
}

const VOWELS: Array<[string, string[]]> = [
  ['', []],
  ['aɪ', []],
  ['eɪ', []],
  ['ə', ['ʌ']],
  ['?', []],
  ['?', []],
  ['ɒ', ['ɑː']],
  ['æ', []],
  ['ɔɪ', []],
  ['?', []],
  ['?', []],
  ['?', []],
  ['ʊ', ['u']],
  ['?', []],
  ['?', []],
  ['uː', ['u']],
  ['aʊ', []],
  ['?', []],
  ['?', []],
  ['?', []],
  ['ɛər', ['ɛr', 'ær']],
  ['?', []],
  ['ɪər', ['ɪr']],
  ['ʊər', ['ʊr', 'ɔːr']],
  ['ɪ', ['i']],
  ['?', []],
  ['?', []],
  ['ɒr', ['ɑːr']],
  ['ɛ', ['e']],
  ['ər', ['ʌr', 'ɜːr']],
  ['iː', ['i']],
  ['oʊ', []],
];

const CONSONANTS: Array<[string]> = [
  [''],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['w'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['dʒ'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['p'],
  ['l'],
  ['r'],
  ['tʃ'],
  ['t'],
  ['j'],
  ['θ'],
  ['?'],
  ['f'],
  ['?'],
  ['s'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['?'],
  ['b'],
  ['k'],
  ['?'],
  ['?'],
  ['v'],
  ['?'],
  ['m'],
  ['?'],
  ['d'],
  ['?'],
  ['n'],
  ['?'],
  ['?'],
  ['ʒ'],
  ['?'],
  ['ɡ'],
  ['h'],
  ['?'],
  ['?'],
  ['?'],
  ['z'],
  ['?'],
  ['?'],
  ['?'],
  ['ð'],
  ['?'],
  ['?'],
  ['ʃ'],
  ['?'],
  ['ŋ'],
];
