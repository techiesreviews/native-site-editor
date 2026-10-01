// Paths the editor never changes on an agent's behalf: GitHub Actions
// workflows run with the repository's secrets, so a change to them needs the
// user's own explicit confirmation in the Publish panel
// (docs/publishing-hosts.md), never an agent's say-so.
//
// A path counts as the workflows when it is `.github/workflows`, anything
// inside it, or `.github` itself (moving or deleting that folder moves or
// deletes the workflows with it). Paths are compared as a file system would
// treat them: case-insensitively, with `.`, `..`, repeated or backward
// slashes resolved and trailing dots and spaces dropped from each name.

function segments(path: string): string[] {
  const names: string[] = [];
  for (const raw of path.split(/[\\/]+/)) {
    if (raw === "." || raw === "") continue;
    if (raw === "..") {
      names.pop();
      continue;
    }
    const name = raw.replace(/[. ]+$/, "").toLowerCase();
    if (name) names.push(name);
  }
  return names;
}

/** Whether `path` is the workflows folder, a path inside it, or a folder that holds it (`.github`). */
export function touchesWorkflows(path: string): boolean {
  const names = segments(path);
  return names[0] === ".github" && (names.length === 1 || names[1] === "workflows");
}

/**
 * Whether `path` is `.github` or anything in it. Workflows are only part of it:
 * a composite action (`.github/actions/**`), a CODEOWNERS file or a template
 * can change what an existing workflow runs, so an agent never changes any of
 * it, and a save of it needs the user's confirmation.
 */
export function touchesGithubConfig(path: string): boolean {
  return segments(path)[0] === ".github";
}

export const GITHUB_CONFIG_REFUSED = "Workflows cannot be changed through the editor, nor can anything else in .github.";

/**
 * The edits an agent's operation may make: link rewrites and redirect lines in files under `.github` are
 * left out (`left` names them), since a page move rewrites links in every text file of the site.
 */
export function splitProtectedEdits(edits: Map<string, string>): { kept: Map<string, string>; left: string[] } {
  const left = [...edits.keys()].filter(touchesGithubConfig);
  return { kept: left.length ? new Map([...edits].filter(([path]) => !touchesGithubConfig(path))) : edits, left };
}
