# AgentCanvas v0.2 受け入れテスト結果

実行日: 2026-06-12
実行ワークスペース: `C:\Users\User\AppData\Local\Temp\AgentCanvas-acceptance-v02-20260612-231321`

## サマリ

| Test | 結果 |
| --- | --- |
| T1 | PASS |
| T2 | PASS |
| T3 | PASS |
| T4 | PASS |
| T5 | PASS |
| T6 | PASS |
| T7 | PASS |
| T8 | PASS |
| T9 | PASS |
| T10 | PASS |

## T1: 自動テスト一式（回帰確認） — PASS

実行コマンド:

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

証拠:

```text
pnpm typecheck: exit code 0; packages/core, apps/desktop, packages/mcp-server typecheck: Done
pnpm lint: exit code 0; eslint . --max-warnings=0
pnpm test: exit code 0
packages/core: Test Files 8 passed; Tests 42 passed
apps/desktop: Test Files 2 passed; packages/mcp-server: Test Files 1 passed; total failed/skipped 0
```

## T2: v0.1 ファイルの自動マイグレーション — PASS

実行コマンド:

```powershell
node .\_acceptance\run-acceptance-task.mjs T2
```

証拠:

```text
loadedSchemaVersion: 0.2.0
savedHasSchema020: true
savedPath: C:\Users\User\AppData\Local\Temp\agent-canvas-T2--stQFAt\design\diagrams\legacy-diagram.diagram.json
nodes: 1->1
edges: 0->0
```

## T3: 二者同時作業で提案が消えない（プロセス分離の実環境シナリオ） — PASS

実行コマンド:

```powershell
pnpm --filter @agent-canvas/mcp-server build
node .\_acceptance\run-acceptance-task.mjs T3
```

証拠:

```text
mcpOk: true
proposalId: proposal.t3-agent-note.1781273980079
proposalStatusAfterCheckedSave: pending
humanNodeExists: true
preservedProposalIds: ["proposal.t3-agent-note.1781273980079"]
```

## T4: ウォッチャー関連ユニットテストの個別再実行 — PASS

実行コマンド:

```powershell
pnpm --filter @agent-canvas/core test -- run test/diagram-watcher.test.ts test/dual-actor.test.ts test/sync.test.ts
```

証拠:

```text
exit code 0
test/sync.test.ts: 3 tests passed
test/dual-actor.test.ts: 2 tests passed
test/diagram-watcher.test.ts: 2 tests passed
Test Files 3 passed; Tests 7 passed
```

## T5: MCP 新機能（コメント・却下理由・適用拒否） — PASS

実行コマンド:

```powershell
node .\_acceptance\run-acceptance-task.mjs T5
```

証拠:

```text
commentsPersisted: 2
replyParentId: comment.agent.1781274013386
rejectedProposalStatus: rejected
rejectedReviewNote: test reason
applyRejected: true; fileUnchangedOnApply: true; refusalMessage: The proposal was created. Please approve it in the AgentCanvas app.
```

## T6: 部分承認（core API） — PASS

実行コマンド:

```powershell
node .\_acceptance\run-acceptance-task.mjs T6
```

証拠:

```text
nodeAdded: true
noteAdded: false
proposalStatus: partially_accepted
appliedOpIndexes: [0]
```

## T7: パッケージ版 MCP 同梱物の起動確認 — PASS

実行コマンド:

```powershell
Test-Path apps/desktop/release/win-unpacked/resources/mcp-server/bundle.cjs
pnpm package:dir
node .\_acceptance\run-acceptance-task.mjs T7
```

証拠:

```text
initial bundle exists: False; pnpm package:dir exit code 0
bundle: C:\Users\User\AppData\Local\Temp\AgentCanvas-acceptance-v02-20260612-231321\apps\desktop\release\win-unpacked\resources\mcp-server\bundle.cjs
tools/list toolCount: 14
hasDiagramProposePatch: true
hasDiagramAddComment: true
```

## T8: ビルド成果物 — PASS

実行コマンド:

```powershell
pnpm build
Test-Path apps/desktop/dist/renderer/index.html
```

証拠:

```text
pnpm build: exit code 0
packages/core build: Done
packages/mcp-server build: dist\bundle.cjs 537.41 KB; Done
apps/desktop build: vite built dist/renderer/index.html
INDEX_EXISTS=True
```

## T9: i18n 辞書の整合性 — PASS

実行コマンド:

```powershell
node .\_acceptance\run-acceptance-task.mjs T9
```

証拠:

```text
jaKeyCount: 152
enKeyCount: 152
jaOnlyCount: 0
enOnlyCount: 0
```

## T10: Mermaid ラウンドトリップで新フィールドが保全される — PASS

実行コマンド:

```powershell
node .\_acceptance\run-acceptance-task.mjs T10
```

証拠:

```text
importedProposalStatus: rejected
importedReviewNote: T10 review note
importedReplyParentId: comment.t10.root
mermaidBytes: 6253
```

## GUI 手動確認項目 — 未実施

- M1: 未実施（アプリ起動 → 言語トグルで日本語/英語が切り替わり、再起動後も維持される）
- M2: 未実施（アプリ表示中に外部（MCP）から提案を追加 → 手を触れずに提案パネルと活動フィードに出現する）
- M3: 未実施（提案の op ごとのチェックボックスで部分承認ができ、プレビューに反映される）
- M4: 未実施（却下時に理由を入力でき、決定済み一覧に表示される）
- M5: 未実施（コメントへの返信（スレッド）と解決が GUI でできる）
- M6: 未実施（サイドバーの「接続設定をコピー」2 種が実在パスを含む）
- M7: 未実施（PNG / HTML エクスポートが保存ダイアログ経由で出力され、HTML 単体で図が見える）
- M8: 未実施（ツールバーのリロードボタンで外部変更が反映される）
