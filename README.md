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
corepack pnpm install
```

If your shell has a pnpm shim available, `pnpm install` works too. This Windows environment required `corepack pnpm`, so the internal scripts use that form.

## Development

```powershell
corepack pnpm dev
```

This builds `@agent-canvas/core`, starts the Vite renderer, watches Electron main/preload TypeScript, and launches Electron.

## Build And Test

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

Packaging is available through Electron Builder:

```powershell
corepack pnpm package
```

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

Unsupported lines are stored in `metadata.unsupportedMermaidLines` and surfaced as warning notes instead of crashing import.

## MCP Server

Build first, then run:

```powershell
corepack pnpm build
corepack pnpm mcp -- --workspace C:\path\to\workspace
```

Direct package form:

```powershell
corepack pnpm --filter @agent-canvas/mcp-server start -- --workspace C:\path\to\workspace
```

Tools:

- `workspace_get_info`
- `workspace_list_diagrams`
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

Example agent flow:

```text
1. workspace_list_diagrams
2. diagram_fetch { "diagramId": "diagram.system_overview" }
3. diagram_propose_patch with DiagramPatchOp[]
4. User reviews proposal in AgentCanvas
```

## Security Model

- Renderer has no direct filesystem access.
- Electron uses `contextIsolation: true` and `nodeIntegration: false`.
- Filesystem operations go through preload IPC and core storage helpers.
- Writes are constrained to the selected workspace with resolved path checks.
- Saves use atomic temporary-file writes.
- Git integration only runs non-destructive `git status --short`.
- MCP apply is disabled by default.
- No telemetry, cloud sync, external LLM calls, or runtime network requirement.

## Sample Workspace

Generate or refresh the bundled sample:

```powershell
corepack pnpm sample
```

The sample lives at `examples/sample-workspace` and contains the System Overview diagram with Client, Web App, API Gateway, Auth Service, User Service, Redis Cache, PostgreSQL, Job Queue, Worker, and External Payment API.

## Current Limits

- Mermaid support is intentionally a practical flowchart subset.
- Layout uses a deterministic layered/grid fallback instead of full ELK routing.
- Desktop dev flow is functional but intentionally simple for the MVP.
- Proposal partial-apply UI is not implemented; accept/reject applies the whole proposal.
- Repo scan is regex-based and not a full TypeScript AST index.

## Roadmap

- Optional ELK-based layout engine with better edge routing.
- Partial proposal apply UI.
- Richer group editing and collapse behavior.
- Deeper TypeScript symbol index and drift calibration.
- Workspace-local settings and recent workspace persistence.
- More import/export projections while keeping Diagram IR canonical.
