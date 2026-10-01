// libsodium's sealed box (crypto_box_seal), which GitHub requires for
// repository secrets: the message is encrypted to the repository's public key
// with a fresh ephemeral key pair, so nobody, the sender included, can read it
// again. Output is ephemeral_public_key (32) || crypto_box(message), where the
// nonce is BLAKE2b-24(ephemeral_public_key || recipient_public_key).
//
// Built from tweetnacl (X25519 + XSalsa20-Poly1305) and blakejs, both small
// and pure JavaScript, so it runs in a Worker without WebAssembly. Tests open
// the result with libsodium itself (tests/sealed-box.test.ts).
import nacl from "tweetnacl";
import { blake2b } from "blakejs";

export function sealedBox(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  if (recipientPublicKey.length !== nacl.box.publicKeyLength) throw new Error("A public key is 32 bytes.");
  const ephemeral = nacl.box.keyPair();
  try {
    const joined = new Uint8Array(nacl.box.publicKeyLength * 2);
    joined.set(ephemeral.publicKey);
    joined.set(recipientPublicKey, nacl.box.publicKeyLength);
    const nonce = blake2b(joined, undefined, nacl.box.nonceLength);
    const box = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);
    const sealed = new Uint8Array(ephemeral.publicKey.length + box.length);
    sealed.set(ephemeral.publicKey);
    sealed.set(box, ephemeral.publicKey.length);
    return sealed;
  } finally {
    ephemeral.secretKey.fill(0);
  }
}

export function base64ToBytes(value: string): Uint8Array {
  const text = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

/** `value` sealed to a base64 public key (GitHub's `key`), as base64 (GitHub's `encrypted_value`). */
export function sealSecret(value: string, base64PublicKey: string): string {
  return bytesToBase64(sealedBox(new TextEncoder().encode(value), base64ToBytes(base64PublicKey)));
}
