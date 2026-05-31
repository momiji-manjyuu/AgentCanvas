import path from "node:path";
import type { DiagramDocument } from "../schema/diagram.js";
import { ensureWithinWorkspace, pathExists, resolveWorkspacePath } from "../storage/workspace.js";
import { scanRepo, type RepoScanResult } from "./scanRepo.js";

export type DriftSeverity = "info" | "warning" | "error";
export type DriftIssueType = "missing_file" | "missing_symbol" | "unlinked_code_candidate";

export interface DriftIssue {
  type: DriftIssueType;
  severity: DriftSeverity;
  message: string;
  nodeId?: string;
  path: string;
  symbol?: string;
}

export interface DriftResult {
  issues: DriftIssue[];
  scan: RepoScanResult;
}

export async function detectDrift(
  workspacePath: string,
  document: DiagramDocument,
): Promise<DriftResult> {
  const root = resolveWorkspacePath(workspacePath);
  const scan = await scanRepo(root);
  const issues: DriftIssue[] = [];
  const linkedFiles = new Set<string>();

  for (const node of document.nodes) {
    for (const codeRef of node.codeRefs ?? []) {
      const absolute = ensureWithinWorkspace(root, codeRef.path);
      const relative = path.relative(root, absolute).replace(/\\/g, "/");
      linkedFiles.add(relative);

      if (!(await pathExists(absolute))) {
        issues.push({
          type: "missing_file",
          severity: "error",
          message: `${node.label} references missing file ${relative}`,
          nodeId: node.id,
          path: relative,
          ...(codeRef.symbol ? { symbol: codeRef.symbol } : {}),
        });
        continue;
      }

      if (codeRef.symbol) {
        const found = scan.symbols.some(
          (symbol) => symbol.path === relative && symbol.name === codeRef.symbol,
        );
        if (!found) {
          issues.push({
            type: "missing_symbol",
            severity: "warning",
            message: `${node.label} references missing symbol ${codeRef.symbol} in ${relative}`,
            nodeId: node.id,
            path: relative,
            symbol: codeRef.symbol,
          });
        }
      }
    }
  }

  for (const file of scan.files) {
    if (!/^src\/.+\.(ts|tsx|js|jsx)$/.test(file)) {
      continue;
    }
    if (!linkedFiles.has(file)) {
      issues.push({
        type: "unlinked_code_candidate",
        severity: "info",
        message: `${file} is present in src but not linked from the diagram`,
        path: file,
      });
    }
  }

  return { issues, scan };
}
