import { ImageExtToMimeTypePipe } from './image-ext-to-mime-type.pipe';

describe('ImageExtToMimeTypePipe', () => {
  it('create an instance', () => {
    const pipe = new ImageExtToMimeTypePipe();
    expect(pipe).toBeTruthy();
  });
});
