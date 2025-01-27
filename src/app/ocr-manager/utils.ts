import * as Channel from 'effect/Channel';
import * as E from 'effect/Effect';

export const bitmapResource = E.acquireRelease((b: ImageBitmap) => E.succeed(b.close()));

export const iotaChannel = (start: number, end: number): Channel.Channel<number> =>
  start < end
    ? Channel.zipRight(Channel.write(start), iotaChannel(start + 1, end))
    : Channel.void
