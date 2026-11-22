import { test } from "node:test";
import assert from "node:assert/strict";
import { keepOpenedProject, keepProjects, readProjects, hideProject } from "../src/project-memory.ts";
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
test("a picture over the cache limit keeps the project without the oversized picture", () => {
  const memory = store();
  keepOpenedProject(memory, "lex", repo(1), "main", "data:image/webp;base64," + "a".repeat(120000));
  const [project] = readProjects(memory, "lex");
  assert.equal(project.repo.id, 1);
  assert.equal(project.picture, undefined);
});
test("removing a project only hides its card until it is opened again", () => {
  const memory = store();
  keepProjects(memory, "lex", [repo(1)]);
  hideProject(memory, "lex", 1);
  keepProjects(memory, "lex", [repo(1)]);
  assert.equal(readProjects(memory, "lex")[0].hidden, true);
  keepOpenedProject(memory, "lex", repo(1), "main");
  assert.equal(readProjects(memory, "lex")[0].hidden, false);
});
