import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'imageExtToMimeType'
})
export class ImageExtToMimeTypePipe implements PipeTransform {
  transform(value: string) {
    switch (value) {
      case '.avif':
        return 'image/avif';
      case '.jxl':
        return 'image/jxl';
      case '.webp':
        return 'image/webp';
      case '.jpg':
        return 'image/jpeg';
      default:
        throw new Error(`unknown image ext: ${value}`);
    }
  }
}
