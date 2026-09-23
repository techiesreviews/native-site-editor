export interface WorkspaceLocation {
  repoId: number;
  branch: string;
  path?: string;
}
const key = (account: string) =>
  `astro-site-editor:workspace:v1:${account.toLowerCase()}`;
export function readWorkspace(account: string): WorkspaceLocation | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(account)) ?? "null");
    if (
      value &&
      Number.isSafeInteger(value.repoId) &&
      typeof value.branch === "string" &&
      value.branch.length <= 255 &&
      (value.path === undefined ||
        (typeof value.path === "string" &&
          value.path.length <= 1024 &&
          value.path
            .split("/")
            .every((part: string) => part && part !== "." && part !== "..")))
    )
      return value;
  } catch {
    /* Remembering navigation is optional when browser storage is disabled. */
  }
}
export function rememberWorkspace(account: string, value: WorkspaceLocation) {
  const params = new URLSearchParams({
    repo: String(value.repoId),
    branch: value.branch,
  });
  if (value.path) params.set("file", value.path);
  const url = new URL(location.href);
  url.hash = params.toString();
  history.replaceState(null, "", url);
  try {
    localStorage.setItem(key(account), JSON.stringify(value));
  } catch {
    /* Editing remains available. */
  }
}

// Fragments keep repository/file navigation out of HTTP requests and referrers.
export function readWorkspaceUrl(): WorkspaceLocation | undefined {
  const params = new URLSearchParams(location.hash.slice(1));
  const repoId = Number(params.get("repo"));
  const branch = params.get("branch");
  const path = params.get("file") ?? undefined;
  if (
    !Number.isSafeInteger(repoId) ||
    repoId <= 0 ||
    !branch ||
    branch.length > 255
  )
    return;
  if (
    path !== undefined &&
    (!path ||
      path.length > 1024 ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === ".."))
  )
    return;
  return { repoId, branch, path };
}
const pendingKey = "astro-site-editor:pending-link";
export function retainWorkspaceLink() {
  try {
    if (readWorkspaceUrl()) sessionStorage.setItem(pendingKey, location.hash);
  } catch {
    /* Login still works without optional browser storage. */
  }
}
export function resumeWorkspaceLink() {
  try {
    const pending = sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    if (!location.hash && pending) history.replaceState(null, "", pending);
  } catch {
    /* Navigation memory is optional. */
  }
}
