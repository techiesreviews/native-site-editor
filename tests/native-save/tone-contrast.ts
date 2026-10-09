import { contrastRatio, type Rgb } from "../../shared/tone.ts";

export type Pixel = { colour: string; rgba: [number, number, number, number] };
export type ContrastSample = {
  band: string;
  tone: string;
  brand: string;
  scheme: string;
  element: string;
  check: "text" | "fill";
  foreground: Pixel;
  // Nearest first, ending with the browser's opaque Canvas colour.
  backgrounds: Pixel[];
};

export function composite(front: Pixel["rgba"], back: Pixel["rgba"]): Pixel["rgba"] {
  const alpha = front[3] + back[3] * (1 - front[3]);
  if (alpha === 0) return [0, 0, 0, 0];
  const channel = (index: number) => (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha;
  return [channel(0), channel(1), channel(2), alpha];
}

export function sampleContrast(sample: Pick<ContrastSample, "foreground" | "backgrounds">): {
  ratio: number; foreground: Rgb; background: Rgb;
} {
  const background = sample.backgrounds.reduceRight((back, front) => composite(front.rgba, back), [0, 0, 0, 0] as Pixel["rgba"]);
  if (background[3] !== 1) throw new Error("Contrast needs an opaque canvas background");
  const foreground = composite(sample.foreground.rgba, background);
  const rgb = (pixel: Pixel["rgba"]): Rgb => ({ r: pixel[0], g: pixel[1], b: pixel[2] });
  return { ratio: contrastRatio(rgb(foreground), rgb(background)), foreground: rgb(foreground), background: rgb(background) };
}
