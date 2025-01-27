import * as S from "effect/Schema";
import * as Transferable from "@effect/platform/Transferable";

const Transferable_ImageBitmap = Transferable.schema(S.instanceOf(ImageBitmap), b => [b])

const GlyphSchema = S.Struct({ strokes: S.Number, origin: S.Tuple(S.Number, S.Number), });
export type Glyph = S.Schema.Type<typeof GlyphSchema>;

const GlyphGeometrySchema = S.Struct({
  upscale: S.Number,
  stroke_width: S.Number,
  glyph_width: S.Number,
  glyph_template_shape: S.Tuple(S.Number, S.Number),
  glyph_template_origin: S.Tuple(S.Number, S.Number),
  all_lines: S.Array(S.Array(S.Tuple(S.Tuple(S.Number, S.Number), S.Tuple(S.Number, S.Number)))),
  circle_center: S.Tuple(S.Number, S.Number),
});
export type GlyphGeometry = S.Schema.Type<typeof GlyphGeometrySchema>;

const PyWorkRefSchema = S.Number.pipe(S.brand('PyWorkRef'));
export type PyWorkRef = S.Schema.Type<typeof PyWorkRefSchema>;
const PyWorkImageRefSchema = PyWorkRefSchema.pipe(S.brand('EPyWorkImageRef'));
export type PyWorkImageRef = S.Schema.Type<typeof PyWorkImageRefSchema>;

export class DecodeImage extends S.TaggedRequest<DecodeImage>()('decodeImage', {
  failure: S.Undefined,
  success: PyWorkImageRefSchema,
  payload: { blob: S.instanceOf(Blob) },
}) { }

export class Decoded2Bitmap extends S.TaggedRequest<Decoded2Bitmap>()('decoded2bitmap', {
  failure: S.Never,
  success: Transferable_ImageBitmap,
  payload: { imgRef: PyWorkImageRefSchema },
}) { }

export class LoadBitmap extends S.TaggedRequest<LoadBitmap>()('loadBitmap', {
  failure: S.Never,
  success: PyWorkImageRefSchema,
  payload: { imgBmp: S.instanceOf(ImageBitmap) }, // don't transfer
}) { }

export const OneshotRecognizeProgressData = S.Union(
  S.TaggedStruct('a', { v: GlyphGeometrySchema }),
  S.TaggedStruct('b', { v: GlyphSchema }),
  S.Undefined,
);
export type OneshotRecognizeProgressData = S.Schema.Type<typeof OneshotRecognizeProgressData>;
export const OneshotRecognizeProgress = S.Tuple(S.Number, OneshotRecognizeProgressData);
export type OneshotRecognizeProgress = S.Schema.Type<typeof OneshotRecognizeProgress>;
export class OneshotRecognize extends S.TaggedRequest<OneshotRecognize>()('oneshotRecognize', {
  failure: S.Never,
  success: OneshotRecognizeProgress,
  payload: { imgRef: PyWorkImageRefSchema },
}) { }

export class Destroy extends S.TaggedRequest<Destroy>()('destroy', {
  failure: S.Never,
  success: S.Void,
  payload: { ref: PyWorkRefSchema },
}) { }

export const WorkerMessage = S.Union(DecodeImage, Decoded2Bitmap, LoadBitmap, OneshotRecognize, Destroy);
export type WorkerMessage = S.Schema.Type<typeof WorkerMessage>;
