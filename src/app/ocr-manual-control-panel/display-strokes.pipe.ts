import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'displayStrokes'
})
export class DisplayStrokesPipe implements PipeTransform {
  transform(value: number) {
    const ret: string[] = Array.from({ length: 12 }, (_v, i) => (value & (1 << i)) ? '1' : '0');
    ret.splice(11, 0, '_');
    ret.splice(6, 0, '_');
    return ret.join('');
  }
}
