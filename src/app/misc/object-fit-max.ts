export function objectFitMax(obj: { width: number, height: number }, bounds: ResizeObserverSize): DOMMatrixReadOnly;
export function objectFitMax(
  { width: objWidth, height: objHeight }: { width: number, height: number },
  { blockSize: height, inlineSize: width }: ResizeObserverSize,
): DOMMatrixReadOnly {
  const widthScale = width / objWidth;
  const heightScale = height / objHeight;
  const scale = Math.min(widthScale, heightScale);
  const finalWidth = objWidth * scale;
  const finalHeight = objHeight * scale;
  return new DOMMatrixReadOnly([scale, 0, 0, scale, (width - finalWidth) / 2, (height - finalHeight) / 2]);
}
