/**
 * Fresh module import — busts Node.js module cache via query param.
 *
 * Use in eval cells and test harnesses where `await import()` would otherwise
 * return a cached (stale) module from a previous cell evaluation.
 *
 * Paths are resolved relative to the project root (ATerm/).
 *
 * Usage in eval cells:
 *   const { freshImport } = await import('./src/test/import-fresh.ts');
 *   const { distill } = await freshImport<typeof import('./src/intel/distill.ts')>('./src/intel/distill.ts');
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

export async function freshImport<T>(modulePath: string): Promise<T> {
  const absolute = path.resolve(REPO_ROOT, modulePath);
  // Dynamic import from an absolute file:// URL works in ESM
  const url = pathToFileURL(absolute).href;
  return import(url + "?t=" + Date.now()) as Promise<T>;
}
