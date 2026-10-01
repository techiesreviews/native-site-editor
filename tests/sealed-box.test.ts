// The sealed box GitHub needs for repository secrets, checked against
// libsodium itself: what worker/sealed-box.ts makes, libsodium's
// crypto_box_seal_open opens.
import { test } from "node:test";
import assert from "node:assert/strict";
import sodium from "libsodium-wrappers";
import { base64ToBytes, bytesToBase64, sealSecret, sealedBox } from "../worker/sealed-box.ts";

test("libsodium opens what the sealed box makes", async () => {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  for (const message of ["x", "cf-token_0123456789ABCDEFGHIJKLMNOPQRSTUV", "é€ unicode ✓", "a".repeat(5000)]) {
    const sealed = sealedBox(new TextEncoder().encode(message), pair.publicKey);
    assert.equal(sealed.length, sodium.crypto_box_SEALBYTES + new TextEncoder().encode(message).length);
    assert.equal(new TextDecoder().decode(sodium.crypto_box_seal_open(sealed, pair.publicKey, pair.privateKey)), message);
  }
});

test("sealSecret takes and gives base64, as GitHub's API does, and is different every time", async () => {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  const key = bytesToBase64(pair.publicKey);
  const first = sealSecret("secret value", key);
  const second = sealSecret("secret value", key);
  assert.notEqual(first, second);
  assert.ok(!first.includes("secret"));
  assert.equal(new TextDecoder().decode(sodium.crypto_box_seal_open(base64ToBytes(first), pair.publicKey, pair.privateKey)), "secret value");
});

test("a message sealed to one key cannot be opened with another", async () => {
  await sodium.ready;
  const right = sodium.crypto_box_keypair();
  const wrong = sodium.crypto_box_keypair();
  const sealed = sealedBox(new TextEncoder().encode("hello"), right.publicKey);
  assert.throws(() => sodium.crypto_box_seal_open(sealed, wrong.publicKey, wrong.privateKey));
});

test("a public key must be 32 bytes", () => {
  assert.throws(() => sealedBox(new Uint8Array(1), new Uint8Array(31)));
});
