import { test } from "node:test";
import assert from "node:assert/strict";
import { agentRemovalPaths, agentKeptRemovalProblem } from "../src/page-builder/agent-media-removal";
import { parseMediaRecords } from "../shared/media-records";

test("agent family removal expands copies and originals, deduplicates, and preserves unrelated files", () => {
  const paths = ["images/photo.webp", "images/photo-480.webp", "media/originals/photo.jpg", "files/menu.pdf", "images/other.webp"];
  assert.deepEqual(agentRemovalPaths([paths[1], paths[2], paths[0], paths[3]], paths), paths.slice(0, 4));
  const records = parseMediaRecords(undefined);
  records.files[paths[2]] = { alwaysKeep: true };
  assert.match(agentKeptRemovalProblem([paths[1]], paths, records)!, /media\/originals\/photo.jpg.*Always keep/);
  assert.equal(agentKeptRemovalProblem([paths[3]], paths, records), undefined);
});

test("agents removing a video's still or subtitles take the whole video family (slice 59)", async () => {
  const { agentRemovalPaths } = await import("../src/page-builder/agent-media-removal");
  const paths = ["media/videos/clip.mp4", "media/videos/clip.webp", "media/videos/clip.vtt", "index.html"];
  assert.deepEqual(agentRemovalPaths(["media/videos/clip.webp"], paths), ["media/videos/clip.mp4", "media/videos/clip.webp", "media/videos/clip.vtt"]);
});
