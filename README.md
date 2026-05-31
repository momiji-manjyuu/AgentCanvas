# AgentCanvas

AgentCanvas is a local-first desktop design canvas for developers and AI coding agents. It lets humans edit architecture diagrams, code references, tasks, comments, and decisions in a Whimsical-style graph UI while agents collaborate through proposal-first MCP tools.

The canonical source of truth is **Diagram IR** (`*.diagram.json`). Mermaid is intentionally treated as an import/export projection because Mermaid cannot preserve GUI coordinates, tasks, review comments, proposal state, or code drift metadata.

## Features

- Cross-platform Electron desktop MVP for Windows, macOS, and Ubuntu-style Linux.
- React + Vite renderer with `@xyflow/react` canvas editing.
- Diagram IR v0.1 with Zod validation and TypeScript types.
- Mermaid flowchart import/export for the main practical subset.
- Git-friendly JSON output with stable key sorting and two-space indentation.
- Atomic writes for `.diagram.json`, `.mmd`, and `.md`.
- Proposal Patch workflow with preview, accept, reject, and fixed Redis sample proposal.
- Local MCP stdio server for agent reads and proposal creation.
- Repo scan and drift detection for missing files, missing symbols, and unlinked source files.
- No cloud sync, telemetry, authentication, or external AI API calls.

## Install

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

If `corepack enable` cannot write global shims on Windows, create a user-local shim directory and put it on `PATH`, then run the same `pnpm` commands:

```powershell
$shim = Join-Path $env:LOCALAPPDATA "CorepackShims"
New-Item -ItemType Directory -Force $shim | Out-Null
corepack enable --install-directory $shim
$env:PATH = "$shim;$env:PATH"
pnpm install
```

## Development

```powershell
pnpm dev
```

This builds `@agent-canvas/core`, starts the Vite renderer, bundles/watches Electron main and preload with tsup, and launches Electron.

Browser preview fallback is explicit only:

```powershell
$env:VITE_AGENTCANVAS_BROWSER_PREVIEW = "1"
pnpm --filter @agent-canvas/desktop build:renderer
```

Normal desktop startup requires the preload IPC bridge. If `window.agentCanvas` is missing, the app shows a bridge initialization error instead of silently using the preview fallback.

## Build And Test

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Packaging is available through Electron Builder:

```powershell
pnpm package
pnpm package:dir
```

`package:dir` runs `electron-builder --dir` and is the fastest packaging sanity check. Main and preload are bundled so packaged apps do not depend on monorepo workspace symlinks for `@agent-canvas/core`.

CI runs install, typecheck, lint, test, and build on Ubuntu, macOS, and Windows.

## Workspace Layout

An AgentCanvas workspace is any local folder. Diagram files live under:

```text
design/
  diagrams/
    system-overview.diagram.json
    system-overview.mmd
    system-overview.md
```

`*.diagram.json` is canonical. Save updates all three files:

- `*.diagram.json`: Diagram IR source of truth.
- `*.mmd`: clean Mermaid flowchart export.
- `*.md`: title, description, Mermaid block, tasks, notes, and comments.

## Diagram IR

Diagram IR v0.1 stores:

- nodes, edges, groups, notes, tasks, and comments
- code references
- canvas layout and viewport
- pending and historical proposals
- import warnings and metadata

The Zod schema lives in `packages/core/src/schema/diagram.ts`.

## Mermaid Import/Export

Supported Mermaid subset:

- `flowchart` / `graph` with `LR`, `TD`, `TB`, `RL`, `BT`
- common node declarations such as `A[Label]`, `A("Label")`, `A(("Label"))`, `A[("Label")]`, and `A>Label]`
- `-->`, labeled `-- label -->`, labeled `-->|label|`, `-.->`, and `==>`
- simple `subgraph ... end`
- comments as preserved metadata
- line-end semicolons, simple multi-statement lines, and inline `%%` comments outside quoted labels

Unsupported lines are stored in `metadata.unsupportedMermaidLines` and surfaced as warning notes instead of crashing import.

AgentCanvas export separates Mermaid-safe aliases from canonical IR ids. When an id such as `node.redis_cache` would be unsafe or collide after aliasing, the exporter emits restoration comments:

```mermaid
%% agentcanvas:id node_redis_cache node.redis_cache
%% agentcanvas:data ...
```

On import, AgentCanvas reads those comments to restore original node/group ids, edge ids, target ids, layout keys, and proposal/comment/task metadata. Mermaid files without AgentCanvas comments still import normally using their Mermaid ids as IR ids.

## MCP Server

Build first, then run:

```powershell
pnpm build
pnpm mcp -- --workspace C:\path\to\workspace
```

Direct package form:

```powershell
pnpm --filter @agent-canvas/mcp-server start -- --workspace C:\path\to\workspace
```

Tools:

- `workspace_get_info`
- `workspace_list_diagrams`
- `workspace_create_sample`
- `diagram_fetch`
- `diagram_export_mermaid`
- `diagram_import_mermaid`
- `diagram_propose_patch`
- `diagram_preview_patch`
- `diagram_apply_proposal`
- `diagram_reject_proposal`
- `diagram_detect_drift`
- `repo_scan`
- `workspace_git_status`

`diagram_apply_proposal` refuses by default unless `AGENTCANVAS_ALLOW_MCP_APPLY=1` is set. The normal model is: agents propose, humans approve in the app.

`workspace_get_info` and `workspace_list_diagrams` are read-only and do not create sample files in an empty workspace. Use `workspace_create_sample` when sample generation is desired.

Patch inputs are validated at the MCP boundary with Zod. Invalid op shapes, missing edge endpoints, duplicate ids, or invalid targets return structured `{ ok: false, errors: [...] }` responses and do not save proposals.

Example agent flow:

```text
1. workspace_list_diagrams
2. diagram_fetch { "diagramId": "diagram.system_overview" }
3. diagram_propose_patch with DiagramPatchOp[]
4. User reviews proposal in AgentCanvas
```

## Security Model

- Renderer has no direct filesystem access.
- Electron uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Filesystem operations go through a narrow preload IPC bridge and core storage helpers.
- IPC inputs for diagram save, import, auto-layout, proposal preview/apply/reject, drift detection, and diagram creation are Zod-validated before reaching core logic.
- External window opens are restricted to `http:`, `https:`, and `mailto:`. `file:`, `javascript:`, and `data:` external opens are denied, and external navigation is blocked.
- Production renderer HTML includes a restrictive CSP compatible with the Vite dev server.
- Writes are constrained to the selected workspace with resolved path checks.
- Saves use atomic temporary-file writes.
- Git integration only runs non-destructive `git status --short`.
- MCP apply is disabled by default.
- No telemetry, cloud sync, external LLM calls, or runtime network requirement.

## Sample Workspace

Generate or refresh the bundled sample:

```powershell
pnpm sample
```

The sample lives at `examples/sample-workspace` and contains the System Overview diagram with Client, Web App, API Gateway, Auth Service, User Service, Redis Cache, PostgreSQL, Job Queue, Worker, and External Payment API.

## Current Limits

- Mermaid support is intentionally a practical flowchart subset.
- Layout uses a deterministic layered/grid fallback instead of full ELK routing.
- Proposal partial-apply UI is not implemented; accept/reject applies the whole proposal.
- Repo scan is regex-based and not a full TypeScript AST index.
- Repo scan has safety limits for maximum file count and file size; skipped or malformed files are reported as warnings.
- Fully signed installers still depend on OS signing/notarization setup; use `package:dir` for unsigned packaging verification.

## Roadmap

- Optional ELK-based layout engine with better edge routing.
- Partial proposal apply UI.
- Richer group editing and collapse behavior.
- Deeper TypeScript symbol index and drift calibration.
- Workspace-local settings.
- More import/export projections while keeping Diagram IR canonical.
