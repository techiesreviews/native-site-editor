import init, { optimise } from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import wasm from "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url";

let ready: ReturnType<typeof init> | undefined;
export async function squeezePng(bytes: Uint8Array): Promise<Uint8Array> {
  await (ready ??= init(wasm));
  return optimise(bytes, 2, false, false);
}
