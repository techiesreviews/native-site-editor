function validWorkerName(worker) {
  return typeof worker === "string" &&
    worker.length >= 1 &&
    worker.length <= 24 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(worker);
}

function hash16(value) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

function cleanBranch(branch) {
  let value = String(branch ?? "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  if (!value) value = "branch";
  if (!/^[a-z]/.test(value)) value = `b-${value}`;
  return value || `branch-${hash16(String(branch ?? ""))}`;
}

export function previewAlias(branch, worker) {
  if (typeof branch !== "string" || !branch) throw new Error("Invalid branch name.");
  if (!validWorkerName(worker)) throw new Error("Invalid Cloudflare Worker name.");
  const max = 62 - worker.length;
  if (max < 18) throw new Error("Cloudflare Worker name leaves no stable preview alias budget.");
  const cleaned = cleanBranch(branch);
  if (cleaned.length <= max) return cleaned;
  const suffix = hash16(String(branch ?? ""));
  const prefix = cleaned.slice(0, max - suffix.length - 1).replace(/-+$/g, "");
  return `${prefix}-${suffix}`;
}

export function previewOrigin(config, branch) {
  return `https://${previewAlias(branch, config.worker)}-${config.worker}.${config.subdomain}`;
}
