import { test } from "node:test";
import assert from "node:assert/strict";
import { keepOpenedProject, keepProjects, readProjects } from "../src/project-memory.ts";
import type { Repository } from "../shared/types.ts";

const repo = (id: number): Repository => ({ id, name: `site-${id}`, full_name: `lex/site-${id}`, private: true,
  default_branch: "main", owner: { login: "lex", type: "User" } });
function store() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test("the listing keeps every project and retains an opened site beyond the first hundred", () => {
  const memory = store(), list = Array.from({ length: 150 }, (_, index) => repo(index + 1));
  keepOpenedProject(memory, "lex", list[120], "draft", "data:image/webp;base64,YQ==");
  keepProjects(memory, "lex", list);
  assert.equal(readProjects(memory, "lex").length, 150);
  assert.equal(readProjects(memory, "lex").find(project => project.repo.id === 121)?.branch, "draft");
  assert.equal(readProjects(memory, "lex").find(project => project.repo.id === 121)?.picture, "data:image/webp;base64,YQ==");
});
test("malformed memory cannot inject a picture or hide the valid project beside it", () => {
  const memory = store();
  memory.setItem("native-site-editor:projects:v1:lex", JSON.stringify([null, {}, { repo: repo(1), branch: "main", picture: "javascript:alert(1)" }]));
  assert.deepEqual(readProjects(memory, "lex"), [{ repo: repo(1), branch: "main" }]);
});
