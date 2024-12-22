import { Component, computed, input } from '@angular/core';
import type { GlyphGeometry } from '../pywork.service';

@Component({
  selector: 'app-trunic-glyph-image',
  imports: [],
  templateUrl: './trunic-glyph-image.component.html',
  styleUrl: './trunic-glyph-image.component.scss'
})
export class TrunicGlyphImageComponent {
  readonly geometry = input.required<GlyphGeometry>();
  readonly strokesPacked = input.required<number>();
  readonly _g = this.geometry;
  readonly _renderData = computed(() =>
    this._g().all_lines
      .filter((_v, i) => i === 12 || ((this.strokesPacked() & (1 << i)) !== 0))
      .map(stroke => stroke.map(v => `${v[0][0]} ${v[0][1]} ${v[1][0]} ${v[1][1]}`))
  );
}
