import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureWithinWorkspace, pathExists, resolveWorkspacePath } from "../storage/workspace.js";

export interface RepoSymbol {
  name: string;
  kind: "class" | "function" | "const";
  path: string;
  line: number;
  exported: boolean;
}

export interface PackageManifestSummary {
  path: string;
  name?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface RepoScanResult {
  files: string[];
  packageManifests: PackageManifestSummary[];
  symbols: RepoSymbol[];
}

const DEFAULT_INCLUDE = ["package.json", "src", "lib", "app", "server", "tests"];
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".vite", "release"]);

export async function scanRepo(
  workspacePath: string,
  options: { include?: string[] } = {},
): Promise<RepoScanResult> {
  const root = resolveWorkspacePath(workspacePath);
  const include = options.include?.length ? options.include : DEFAULT_INCLUDE;
  const files = new Set<string>();

  for (const item of include) {
    const absolute = ensureWithinWorkspace(root, item);
    if (!(await pathExists(absolute))) {
      continue;
    }
    const itemStat = await stat(absolute);
    if (itemStat.isDirectory()) {
      for (const file of await walk(root, absolute)) {
        files.add(file);
      }
    } else {
      files.add(path.relative(root, absolute).replace(/\\/g, "/"));
    }
  }

  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b));
  const packageManifests: PackageManifestSummary[] = [];
  const symbols: RepoSymbol[] = [];

  for (const relativePath of sortedFiles) {
    const absolute = ensureWithinWorkspace(root, relativePath);
    if (path.basename(relativePath) === "package.json") {
      packageManifests.push(await readPackageManifest(root, absolute));
    }
    if (CODE_EXTENSIONS.has(path.extname(relativePath))) {
      symbols.push(...(await scanSymbols(root, absolute)));
    }
  }

  return {
    files: sortedFiles,
    packageManifests,
    symbols,
  };
}

async function walk(root: string, directory: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      result.push(...(await walk(root, absolute)));
    } else if (path.basename(relative) === "package.json" || CODE_EXTENSIONS.has(path.extname(relative))) {
      result.push(relative);
    }
  }

  return result;
}

async function readPackageManifest(root: string, filePath: string): Promise<PackageManifestSummary> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return {
    path: path.relative(root, filePath).replace(/\\/g, "/"),
    ...(parsed.name ? { name: parsed.name } : {}),
    dependencies: parsed.dependencies ?? {},
    devDependencies: parsed.devDependencies ?? {},
  };
}

async function scanSymbols(root: string, filePath: string): Promise<RepoSymbol[]> {
  const relative = path.relative(root, filePath).replace(/\\/g, "/");
  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);
  const symbols: RepoSymbol[] = [];

  lines.forEach((line, index) => {
    const candidates: Array<{ regex: RegExp; kind: RepoSymbol["kind"] }> = [
      { regex: /\b(export\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: "class" },
      { regex: /\b(export\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: "function" },
      { regex: /\bexport\s+const\s+([A-Za-z_$][\w$]*)/, kind: "const" },
      { regex: /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/, kind: "function" },
    ];

    for (const candidate of candidates) {
      const match = line.match(candidate.regex);
      const name = match?.[2] ?? match?.[1];
      if (name && name !== "export ") {
        symbols.push({
          name,
          kind: candidate.kind,
          path: relative,
          line: index + 1,
          exported: /\bexport\b/.test(line),
        });
        break;
      }
    }
  });

  return symbols;
}
