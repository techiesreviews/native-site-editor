// A small animated GIF for specs (media adding, the Social image popup).
/** Two 64 × 32 GIF frames, each 200 ms, with clear codes keeping LZW at three bits. */
export function animatedGif() {
  const header = Buffer.from([71, 73, 70, 56, 57, 97, 64, 0, 32, 0, 128, 0, 0, 255, 0, 0, 0, 0, 255]);
  const frame = (colour: number) => {
    const codes = Array.from({ length: 64 * 32 }, () => [4, colour]).flat(); codes.push(5);
    const pixels: number[] = []; let bits = 0, count = 0;
    for (const code of codes) { bits |= code << count; count += 3; while (count >= 8) { pixels.push(bits & 255); bits >>= 8; count -= 8; } }
    if (count) pixels.push(bits & 255);
    const blocks: number[] = [];
    for (let offset = 0; offset < pixels.length; offset += 255) { const block = pixels.slice(offset, offset + 255); blocks.push(block.length, ...block); }
    return Buffer.from([33, 249, 4, 0, 20, 0, 0, 0, 44, 0, 0, 0, 0, 64, 0, 32, 0, 0, 2, ...blocks, 0]);
  };
  return Buffer.concat([header, frame(0), frame(1), Buffer.from([59])]);
}
