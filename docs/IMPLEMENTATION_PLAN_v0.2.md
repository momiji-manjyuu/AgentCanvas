# AgentCanvas v0.2 「協調キャンバス」実装計画書（Codex 向け通し実装指示）

この文書は、AgentCanvas v0.2 の設計決定と実装手順を定めた唯一の指示書である。
実装者（Codex）は本書を上から順に読み、**Phase 1 から Phase 10 までを順番に、各 Phase のゲートを通過させながら完成まで**実装すること。

---

## 0. ミッションと完了の定義

### ミッション

AgentCanvas は「人間は GUI で、エージェントは構造化テキスト（MCP）で、同一のシステム図を相互に編集し理解を深める」ためのツールである。v0.1 (現状) は片方向ずつは動くが、**両者が同時に作業すると壊れる**。v0.2 のミッションは次の3本柱：

- **A. ライブ同期**: GUI とエージェントが同じファイルを安全に共有する（変更監視・消失しない保存・活動フィード）
- **B. 対話ループ**: 却下理由・コメントスレッド・部分承認で、人間⇔エージェントの往復対話を成立させる
- **C. 導入しやすさ**: 日本語UI・MCP接続の簡単設定・図の共有用エクスポート

### 完了の定義 (Definition of Done)

1. Phase 1〜10 がすべて完了し、フェーズごとにコミットされている
2. リポジトリルートで以下がすべて成功する:
   ```powershell
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   pnpm package:dir
   ```
3. 「二者同時作業シナリオ」の自動テスト（Phase 10）が、修正前なら失敗し、修正後は合格する内容になっている
4. README.md が v0.2 の機能・制限を反映している
5. `docs/BLOCKERS.md` が存在しない（= 未解決の行き詰まりがない）

### 作業ルール

- ブランチ `feature/v0.2-collaboration` を main から切って作業する。**main へのマージは行わず**、完了報告で停止する
- 1 Phase = 1 コミット以上。コミットメッセージは既存スタイル（短い英語の命令形）に合わせる
- 各 Phase の最後に **ゲート**: `pnpm typecheck && pnpm lint && pnpm test` をすべて green にしてからコミット・次へ進む
- 同じエラーへの修正を3回試みて解決しない場合は、`docs/BLOCKERS.md` に「エラー内容・試したこと・推定原因・提案」を記録して**停止**する
- エラーを握りつぶす実装（catch して無視、`any` での回避、テストの skip）は禁止

### 守るべき既存の不変条件（壊してはならないもの）

- `*.diagram.json`（Diagram IR）が唯一の正本。Mermaid/Markdown は投影（projection）にすぎない
- Electron セキュリティ設定: `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`（`apps/desktop/src/main/security.ts`）
- すべての IPC 入力は `apps/desktop/src/main/ipc-validation.ts` で Zod 検証してから core に渡す
- すべてのファイル書き込みは `atomicWrite`（一時ファイル経由）を使い、ワークスペース内に限定（`ensureWithinWorkspace`）。例外は Phase 9 のエクスポート（ユーザーが保存ダイアログで明示選択したパスのみ）
- JSON 出力は `stableJson`（キーのソート + 2スペースインデント + 末尾改行）を維持。**コンテンツハッシュはこの安定性に依存する**
- テレメトリ・クラウド同期・外部 LLM API 呼び出しを追加しない
- MCP の `diagram_apply_proposal` は `AGENTCANVAS_ALLOW_MCP_APPLY=1` がない限り拒否（エージェントは提案のみ、承認は人間）の原則を維持
- コード識別子・コードコメントは英語。UI 文字列は Phase 7 以降 i18n 辞書経由

---

## 1. 現状の問題（なぜこの設計か）

### 1-1. 消失する提案（lost update）— 最重要バグ

- GUI は起動時にファイルを読み、以後メモリ上のコピーを編集する（`apps/desktop/src/renderer/state/workspace-store.ts`）
- MCP サーバーは**別プロセス**として同じ `*.diagram.json` に直接書き込む（`packages/mcp-server/src/tools.ts` の `diagram_propose_patch` → `saveDiagramBundle`）
- GUI の保存（`saveWorkspaceDiagram` in `apps/desktop/src/main/workspace-service.ts`）はメモリ内容で**ファイル全体を無条件上書き**する
- → GUI を開いている間にエージェントが追加した提案・コメントは、人間の次の Ctrl+S で**警告なく消える**

### 1-2. 変更に気づけない

- デスクトップアプリにはファイル監視（file watcher）が存在しない。エージェントの書き込みは、サイドバーで図をクリックし直さない限り画面に反映されない

### 1-3. 対話が一往復で終わる

- 却下（reject）に理由を添えられない。コメントに返信（スレッド）できない。提案は全採用 or 全却下の二択

---

## 2. 設計決定（D1〜D9）

### D1. スキーマ v0.2.0 とマイグレーション

`packages/core/src/schema/diagram.ts` を拡張する:

- `DiagramCommentSchema` に追加:
  - `parentId: z.string().min(1).optional()` — 返信スレッド用（親コメント id）
  - `authorKind: z.enum(["human", "agent"]).optional()` — 表示用。未指定時は `author === "agent"` なら agent とみなす
- `DiagramProposalSchema` に追加:
  - `reviewNote: z.string().optional()` — 承認/却下時の人間からのメッセージ
  - `reviewedAt: z.string().datetime().optional()`
  - `appliedOpIndexes: z.array(z.number().int().nonnegative()).optional()` — 部分承認で適用された ops のインデックス
- `schemaVersion`: `z.enum(["0.1.0", "0.2.0"])` を受理し、`SCHEMA_VERSION = "0.2.0"` として常に最新で書き出す
- 新規モジュール `packages/core/src/schema/migrate.ts`:
  - `migrateDiagram(raw: unknown): DiagramDocument` — 0.1.0 の生 JSON を受け取り、新フィールドの既定値を補って 0.2.0 として parse して返す。未知バージョンは明確なエラー
  - `readDiagramFile`（`packages/core/src/storage/workspace.ts`）は `migrateDiagram` を通すように変更
- 既存の 0.1.0 ファイル（`examples/sample-workspace` 含む）がそのまま開けることをテストで保証する

### D2. コンテンツハッシュと「消失しない保存」(checked save)

新規モジュール `packages/core/src/sync/contentHash.ts`:

- `diagramFileContent(document): string` — `stableJson(validated) + "\n"`（= 実際にファイルへ書く文字列）を返す。`saveDiagramBundle` もこれを使うようリファクタ
- `computeContentHash(content: string): string` — `node:crypto` の sha256 hex

新規モジュール `packages/core/src/sync/mergeDiagram.ts`（**純関数・renderer からも使うので browser エントリにも export**）:

```ts
mergeExternalChanges(diskDoc: DiagramDocument, memoryDoc: DiagramDocument): {
  merged: DiagramDocument;
  preservedFromDisk: { proposals: string[]; comments: string[]; tasks: string[]; notes: string[] };
}
```

マージ規則（id ベースの和集合）:

- `proposals`: id で和集合。両方に同じ id がある場合、status が `pending` でない方（= 人間の決定済み）を優先。両方決定済みで食い違う場合は memory 優先
- `comments`: id で和集合。同 id は memory 優先、ただし `resolved` は OR（どちらかが解決済みなら解決済み）
- `tasks` / `notes`: id で和集合。同 id は memory 優先
- それ以外（nodes / edges / groups / layout / viewport / direction / title / description / metadata）: **memory 優先**（人間がキャンバスで編集中のものが正）
- `updatedAt`: 現在時刻

新規モジュール `packages/core/src/sync/checkedSave.ts`:

```ts
saveDiagramChecked(workspacePath: string, document: DiagramDocument, baseHash: string | null): Promise<{
  result: SaveDiagramResult;
  contentHash: string;          // 書き込んだ内容のハッシュ
  preservedFromDisk: ... | null; // マージが発生した場合のみ
}>
```

処理: ディスクの現ファイルを読みハッシュ比較 → `baseHash` と一致（または ファイル新規）ならそのまま書く → 不一致なら `migrateDiagram` でディスク版を読み、`mergeExternalChanges` でマージしてから書く。

配線:

- `apps/desktop/src/main/workspace-service.ts` の保存経路を `saveDiagramChecked` に置換。読み込み系 API（snapshot / loadDiagram）は `contentHash` を一緒に返す
- renderer の `workspace-store.ts` に `baseHash: string | null` を追加。読込・保存・外部変更反映のたびに更新。保存後、`preservedFromDisk` があればトースト（例: 「外部の提案2件を保持して保存しました」）
- IPC スキーマ（`ipc-validation.ts`）と preload（`preload.ts`）、`electron-api.ts` を対応させる
- **手動リロードボタン**を `Toolbar.tsx` に追加（現在の図をディスクから読み直す。`dirty` のときは確認ダイアログ）

### D3. ファイル監視と外部変更イベント

新規モジュール `packages/core/src/watch/diagramWatcher.ts`（Node 専用。**browser エントリに含めない**）:

- 依存に `chokidar` を core へ追加
- `createDiagramWatcher(workspacePath, handler)` — `design/diagrams/*.diagram.json` を監視。`awaitWriteFinish`（または 200ms デバウンス）で原子的書き込みの途中を読まない。`close()` を返す
- handler に渡すイベント: `{ kind: "created" | "changed" | "removed" | "invalid", path, slug, diagramId?, document?, contentHash?, error? }`
  - 読み込み・検証に失敗したら `invalid`（クラッシュさせない）

配線（`apps/desktop/src/main/` に `diagram-watcher-bridge.ts` などを新設）:

- ワークスペースを開いたら監視開始、閉じる/切替で `close()`
- **自己エコー抑制**: main は自分が書いた `contentHash` を diagram path ごとに記録し、同一ハッシュのイベントは無視する
- それ以外のイベントは `webContents.send("agentcanvas:externalChange", payload)` で renderer へ push。preload に `onExternalChange(cb)` を追加（チャネル名は既存の命名に合わせる）

renderer 側の受信処理（`workspace-store.ts`）:

- 表示中の図のイベントで `dirty === false` → ドキュメントを差し替え、`baseHash` 更新（選択状態は id が残っていれば維持）
- `dirty === true` → `mergeExternalChanges(外部doc, メモリdoc)` の `merged` をメモリに反映（undo スタックには積む）し、トーストで通知
- `created` / `removed` → サイドバーの図一覧を更新
- `invalid` → 活動フィードに警告として記録（D4）

### D4. 活動フィード（Activity Feed）

- `workspace-store.ts` に `activity: ActivityItem[]`（最大 50 件、セッション内のみ・永続化しない）:
  ```ts
  { id: string; at: string; kind: "proposal" | "comment" | "diagram" | "save" | "decision" | "warning";
    message: string; diagramId?: string; proposalId?: string }
  ```
- 記録するもの:
  - 外部変更イベント受信時、直前のドキュメントと比較して具体的に: 「エージェントが提案『◯◯』を追加」「コメントが◯件追加」「図『◯◯』が作成された」
  - ローカル操作: 保存 / 提案の承認・部分承認・却下
  - `invalid` イベント: 警告
- 新規コンポーネント `apps/desktop/src/renderer/components/ActivityPanel.tsx` を右レール（`App.tsx` の `right-rail`）に追加。`proposalId` 付きエントリのクリックで該当提案をハイライト（ProposalPanel の `active` 既存スタイルを流用）

### D5. レビュー対話ループ（却下理由・コメントスレッド・エージェントコメント）

core（`packages/core/src/patch/applyPatch.ts`）:

- `rejectProposal(document, proposalId, reviewNote?: string)` — `reviewNote` / `reviewedAt` を保存
- `applyProposal` も `reviewedAt` を記録

GUI:

- ProposalPanel の Reject 押下時に理由入力（テキストエリア付きの小さなインライン フォームで良い。空でも却下可）
- 決定済み提案の表示に `reviewNote` を表示
- コメント UI（`Inspector.tsx` 内の既存コメント表示）をスレッド化: `parentId` でグルーピングし、ルートごとに返信ボックス。author/authorKind で「人間 / エージェント」のバッジ表示

MCP（`packages/mcp-server/src/tools.ts` / `server.ts`）:

- `diagram_reject_proposal` に optional `reason` を追加（→ `reviewNote`）
- 新ツール `diagram_add_comment`: `{ diagramId, text, targetId?, parentId? }`、author は `"agent"`、authorKind `"agent"`。コメント追加もファイル保存（→ watcher 経由で GUI に出る）
- 既存の日本語エラーメッセージ（`diagram_apply_proposal` の拒否文）は英語に統一する（エージェント向け文言は英語で統一）

### D6. 部分承認（partial apply）

core:

- `applyProposalPartial(document, proposalId, opIndexes: number[]): DiagramDocument`
  - 選択 ops のみ適用。全選択なら `accepted`、一部なら `partially_accepted` + `appliedOpIndexes` を記録
  - 適用結果は必ず `DiagramDocumentSchema` で再検証（既存 `applyProposal` と同等の検証経路）
- ops の人間可読な説明ヘルパー `describeOp(op, document): string`（例: `add_node` → 「ノード追加: Redis Cache」）。i18n を考慮し、renderer 側で訳す形でも良い（実装裁量。ただし UI に生の `op.op` だけを見せない）

GUI（ProposalPanel）:

- 各 op にチェックボックス（既定: 全チェック）
- Preview は**チェックされた subset** を `previewPatch` に渡す（既存 `api.previewProposal` を ops 引数対応に拡張）
- 依存エラー（例: `add_edge` が未チェックの `add_node` に依存）は previewPatch の検証エラーがそのまま出るので、エラー表示と Accept 無効化（既存の仕組みを流用）
- Accept はチェック subset で `applyProposalPartial` 経由

IPC / preload / electron-api / ipc-validation を一式対応。

### D7. 日本語 UI（i18n）

- 軽量自作で良い（ライブラリ追加不要）: `apps/desktop/src/renderer/i18n/` に `ja.ts` / `en.ts` / `index.ts`
  - `t(key, params?)` 関数 + React 用フック。store のトースト文字列からも使えるようにモジュールレベルでも参照可能にする
- 言語選択: 初期値は `navigator.language` が `ja` 始まりなら日本語。サイドバー下部に切替トグル。選択は `localStorage` に保存
- 対象: renderer の全 UI 文字列・トースト・確認ダイアログ。**MCP/エージェント向け文字列は英語のまま**
- ついでの小修正: サイドバーの更新日時を `toLocaleDateString` → 日時表示（`toLocaleString`）に

### D8. MCP 接続の簡単設定 + 同梱

main に `getMcpSetupInfo()` を追加し、サイドバーの MCP セクションを置き換える:

- 「Claude Code 用コマンドをコピー」: `claude mcp add agentcanvas -- node <mcp-serverへの絶対パス> --workspace <現在のワークスペース絶対パス>`
- 「JSON 設定をコピー」: `mcpServers` 形式の JSON スニペット
- パスは開発時（リポジトリ内 `packages/mcp-server/dist/index.js`）とパッケージ版で出し分ける

パッケージ版同梱:

- `packages/mcp-server` に tsup での単一ファイルバンドル（`dist/bundle.cjs`、`@agent-canvas/core` と MCP SDK を `noExternal` で同梱）を追加し、`node dist/bundle.cjs --workspace <dir>` で動作することを確認
- `apps/desktop/electron-builder.yml` の `extraResources` で `bundle.cjs` を同梱し、パッケージ版の `getMcpSetupInfo()` は `process.resourcesPath` 配下のパスを返す
- **注意**: MCP SDK のバンドルが困難な場合は、`docs/BLOCKERS.md` に記録した上で「開発パスのみ対応・パッケージ版は今後」として Phase を完了して良い（他 Phase を巻き込まない）

### D9. 共有用エクスポート（PNG / HTML）

- renderer 依存に `html-to-image` を追加
- Toolbar に「PNG エクスポート」: React Flow の viewport 要素（`.react-flow__viewport`）を `toPng` で画像化 → 新 IPC `exportFile` で main に渡し、`dialog.showSaveDialog` → ユーザー選択パスへ書き込み（バイナリ）。**この書き込みだけはワークスペース外を許可**（ユーザー明示選択のため）。README のセキュリティ節にこの例外を明記
- 「HTML エクスポート」: 自己完結 HTML 1 ファイル（PNG を data URI で埋め込み + タイトル / 説明 / タスク / ノート / コメントをテキストで併記）。テンプレートは新規モジュールに分離（例: `apps/desktop/src/renderer/lib/export-html.ts`）

---

## 3. フェーズ別実装手順

> 各 Phase 末尾のゲート: `pnpm typecheck && pnpm lint && pnpm test` green → コミット。

### Phase 1: スキーマ v0.2.0 + マイグレーション（D1）

- 触る場所: `packages/core/src/schema/diagram.ts`、新規 `schema/migrate.ts`、`storage/workspace.ts`（readDiagramFile）、`samples/`、`packages/core/src/index.ts` / `browser.ts` の export、関連テスト
- 受入条件:
  - 0.1.0 のサンプル JSON（fixture として保存）が `migrateDiagram` 経由で開け、0.2.0 として保存される
  - Mermaid ラウンドトリップテストが green（`%% agentcanvas:data` 経由で新フィールドが落ちないこと）
  - `pnpm sample` 再生成で `examples/sample-workspace` が 0.2.0 になる

### Phase 2: checked save + 手動リロード（D2）

- 触る場所: 新規 `packages/core/src/sync/`（contentHash / mergeDiagram / checkedSave）、`storage/workspace.ts`、`apps/desktop/src/main/workspace-service.ts`・`ipc.ts`・`ipc-validation.ts`、`preload.ts`、`electron-api.ts`、`workspace-store.ts`、`Toolbar.tsx`
- 受入条件（core テスト必須）:
  - ディスクにだけ存在する pending 提案・コメント・タスク・ノートが、メモリ版の保存後も**ファイルに残る**
  - 同一 id の提案: 決定済み > pending の優先規則がテストで保証される
  - baseHash 一致時は素通し（マージ処理が走らない）
  - リロードボタンで外部変更が画面に反映される

### Phase 3: ファイル監視 + 自動反映（D3）

- 触る場所: core 新規 `watch/diagramWatcher.ts`（+ chokidar 依存）、`apps/desktop/src/main/`（watcher ブリッジ、main.ts）、`preload.ts`、`electron-api.ts`、`workspace-store.ts`
- 受入条件:
  - core テスト: 一時ディレクトリで watcher を起動し、`saveDiagramBundle` 書き込みでイベントが届く / 壊れた JSON は `invalid` になる（タイムアウトに余裕を持たせ、CI でも安定する書き方にする）
  - 自己エコー抑制: GUI 保存で自分のイベントを拾わない
  - GUI 起動中に別プロセス（テストでは core 関数直呼び）が提案を書き込むと、クリーン状態なら自動反映される

### Phase 4: 活動フィード（D4)

- 触る場所: `workspace-store.ts`、新規 `ActivityPanel.tsx`、`App.tsx`、`styles.css`
- 受入条件: 外部の提案追加・コメント追加・図作成、ローカルの保存・承認・却下がフィードに出る。クリックで該当提案がハイライトされる

### Phase 5: レビュー対話ループ（D5）

- 触る場所: `applyPatch.ts`、`ProposalPanel.tsx`、`Inspector.tsx`、`workspace-store.ts`、`packages/mcp-server/src/tools.ts`・`server.ts`、IPC 一式、テスト
- 受入条件:
  - 却下理由がファイルに永続化され、`diagram_fetch` でエージェントから読める（mcp-server テスト）
  - `diagram_add_comment` で追加したコメントが GUI のスレッド表示に出る
  - parentId による返信スレッドの表示・返信投稿・解決が動く

### Phase 6: 部分承認（D6）

- 触る場所: `applyPatch.ts`（applyProposalPartial）、`previewPatch.ts`（必要なら）、`ProposalPanel.tsx`、IPC 一式、core テスト
- 受入条件:
  - ops の一部のみ適用 → `partially_accepted` + `appliedOpIndexes` がファイルに記録される（core テスト）
  - 依存欠落（edge だけチェック等）は preview 検証エラーになり Accept が無効化される
  - チェック状態がプレビュー表示（キャンバスの diff ハイライト）に反映される

### Phase 7: 日本語 UI（D7）

- 触る場所: 新規 `renderer/i18n/`、renderer 全コンポーネント、`workspace-store.ts`（トースト）、`Sidebar.tsx`（トグル）
- 受入条件: 言語トグルで全 UI が ja/en 切替・再起動後も維持。ハードコード文字列の残りがないこと（目視 + grep）

### Phase 8: MCP 簡単設定 + 同梱（D8）

- 触る場所: `packages/mcp-server`（tsup バンドル）、`workspace-service.ts` or 新規モジュール、`Sidebar.tsx`、`electron-builder.yml`、IPC 一式
- 受入条件:
  - 開発環境でコピーされたコマンド/JSON がそのまま動く（パスが実在する）
  - `pnpm package:dir` 後、`release/win-unpacked/resources/` 配下に bundle.cjs が存在し、`node <そのパス> --workspace <tmp>` で MCP サーバーが起動する
  - SDK バンドル不能時の代替条件は D8 の注意書きに従う

### Phase 9: エクスポート（D9）

- 触る場所: Toolbar、新規 `export-html.ts`、IPC 一式、`package.json`（html-to-image）
- 受入条件: PNG / HTML が保存ダイアログ経由で出力でき、HTML は単体で開いて図と本文が見える。レンダラーから直接 fs に触れていないこと

### Phase 10: 二者同時作業テスト + ドキュメント + 総仕上げ

- 新規テスト（例: `packages/core/test/dual-actor.test.ts`）— 統合シナリオ:
  1. 一時ワークスペースに図を作成し、GUI 相当として読み込み（baseHash 取得）
  2. メモリ上で人間相当の編集（ノード追加）
  3. その間に「エージェント相当」として `addProposal` + `saveDiagramBundle` で別経路の書き込み
  4. `saveDiagramChecked` で保存 → **提案が残っており**、人間の編集も反映されていることを assert
  5. watcher 経由で外部変更イベントが届くことも別ケースで assert
- README.md 更新: Features / MCP Tools（`diagram_add_comment`、reject の reason）/ Security（エクスポートの例外）/ Current Limits / Roadmap を v0.2 に合わせる
- 最終ゲート: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm package:dir`

---

## 4. 実装上の注意（ハマりどころ）

- **chokidar は core の Node エントリのみ**。`packages/core/src/browser.ts` から watcher を export すると renderer のバンドルが壊れる
- Windows ではファイル変更イベントが重複・遅延しやすい。デバウンス + ハッシュ比較（内容が同じなら無視）で冪等にする
- `atomicWrite` は rename を使うため、watcher には `add`/`change` の両方が来る可能性がある。kind の判定はファイルの存在と既知一覧で行う
- renderer は `@agent-canvas/core` の **browser エントリ**経由で純関数のみ import できる（既存: Toolbar が exportMermaid を import している）。mergeExternalChanges はここに追加する
- IPC のイベント push（main→renderer）は初。preload では `ipcRenderer.on` をラップし、リスナー解除関数を返す形にする（コールバックを直接 expose しない）
- `pnpm dev` での動作確認は Electron 起動を伴う。自動テストは headless で完結させ、Electron 依存（`app`, `dialog`）を core のテスト対象に持ち込まない
- 既存テストのフィクスチャ（schemaVersion "0.1.0" を直書きしている箇所）は Phase 1 で更新が必要になる

---

## 5. 完了報告フォーマット

すべて完了したら、以下の形式で報告して停止する（main にはマージしない）:

```
✅ v0.2 実装完了（ブランチ: feature/v0.2-collaboration）
変更内容: Phase ごとの1行サマリ
検証結果: typecheck / lint / test / build / package:dir の結果
確認方法: 人間が GUI + MCP で試す手順（5ステップ以内）
既知の制限: あれば
```
