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
}
