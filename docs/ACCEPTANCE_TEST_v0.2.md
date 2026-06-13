# AgentCanvas v0.2 受け入れテスト仕様書（Codex 実行用）

この文書は v0.2 実装（ブランチ `feature/v0.2-collaboration`）の受け入れテスト手順を定める。
実行者（Codex）は T1〜T10 を**順番に**実行し、結果を `docs/TEST_RESULTS_v0.2.md` に記録する。

## 実行ルール

- これは**検証専用**の実行である。製品コード・既存テストコードの修正は禁止
- テストが失敗しても**修正せず**、FAIL として証拠（コマンド出力の要点）を記録し、次のテストへ進む
- 使い捨てスクリプト・一時ワークスペースは OS の一時ディレクトリ（`$env:TEMP` 配下）に作成する。リポジトリ内には何も追加しない（唯一の例外: `docs/TEST_RESULTS_v0.2.md`）
- git 操作（commit / branch / merge）は一切不要
- 各テストの記録形式:
  ```
  ## T<n>: <名称> — PASS / FAIL
  実行コマンド: ...
  証拠: <出力の要点 1〜5 行>
  ```
- すべて終えたら冒頭にサマリ表（T1〜T10 の PASS/FAIL 一覧）を書く

## 前提

- 作業ディレクトリ: リポジトリルート。ブランチ `feature/v0.2-collaboration` がチェックアウト済み
- `pnpm` が PATH にある（なければ `$env:LOCALAPPDATA\CorepackShims` を PATH に追加）
- 一部テストは `@agent-canvas/core` の公開 API を使う使い捨て Node スクリプトを書く。正確な export 名は `packages/core/src/index.ts` を確認して合わせること。スクリプトは `packages/core/dist`（ビルド済み JS）を import するか、`pnpm --filter @agent-canvas/core build` 後に行うこと

---

## T1: 自動テスト一式（回帰確認）

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`

**合格基準**: 3 コマンドすべて exit code 0。test は全件 passed（failed / skipped が 0）。

## T2: v0.1 ファイルの自動マイグレーション

1. 一時ワークスペース `W` を作り、`W/design/diagrams/legacy.diagram.json` に `packages/core/test/fixtures/legacy-v0.1.diagram.json` の内容をコピー
2. 使い捨てスクリプトで core の読み込み API（`loadDiagram` 相当）により読み込む
3. 続けて保存 API（`saveDiagramBundle` 相当）で保存する

**合格基準**:
- 読み込みがエラーにならない
- 保存後のファイル内容に `"schemaVersion": "0.2.0"` が含まれる
- 元の nodes / edges が失われていない（件数一致）

## T3: 二者同時作業で提案が消えない（プロセス分離の実環境シナリオ）

ユニットテストではなく、**実際の MCP サーバープロセス**を経由して検証する。

1. 一時ワークスペース `W` を作成し、スクリプトから core API で sample diagram を保存（または MCP の `workspace_create_sample` を使用）
2. 「人間役」スクリプト: 図を読み込み、`baseHash`（content hash）を控え、メモリ上でノードを 1 つ追加した document を作る（まだ保存しない）
3. 「エージェント役」: `packages/mcp-server/dist/index.js`（または bundle.cjs）を `--workspace W` で**別プロセスとして起動**し、stdio JSON-RPC で `initialize` → `tools/call` `diagram_propose_patch`（add_note 1 op 程度）を送る。レスポンスが `ok: true` であること
4. 「人間役」スクリプト: 手順 2 の document を古い `baseHash` のまま checked save API（`saveDiagramChecked` 相当）で保存
5. 保存後の `*.diagram.json` を読み、検証する

**合格基準**:
- 手順 3 の MCP レスポンスが成功し、ファイルに提案が書かれている
- 手順 4 の保存後も、**エージェントの提案が `pending` のまま残っている**
- 人間役が追加したノードも存在する
- checked save の戻り値（または同等の情報）に、ディスクから保全した提案 id が含まれる

## T4: ウォッチャー関連ユニットテストの個別再実行

1. `pnpm --filter @agent-canvas/core test -- run test/diagram-watcher.test.ts test/dual-actor.test.ts test/sync.test.ts`
   （vitest の引数指定方法は package.json を確認して適宜調整可）

**合格基準**: 対象テストすべて passed。

## T5: MCP 新機能（コメント・却下理由・適用拒否）

T3 と同様に実 MCP サーバープロセスへ stdio JSON-RPC で順に実行:

1. `diagram_add_comment` `{ diagramId, text: "agent comment", targetId: <既存ノードid> }` → 成功
2. 返ってきたコメント id を親として `diagram_add_comment` `{ ..., parentId: <親id> }` → 成功
3. 既存 pending 提案（T3 のもの等）に `diagram_reject_proposal` `{ diagramId, proposalId, reason: "test reason" }` → 成功
4. 新しい pending 提案を 1 件作成し、環境変数 `AGENTCANVAS_ALLOW_MCP_APPLY` を**設定せずに** `diagram_apply_proposal` → 拒否されること

**合格基準**:
- ファイル上にコメント 2 件（author が "agent"、2 件目に parentId）が永続化されている
- 却下した提案の status が "rejected" になり、reviewNote に "test reason" が保存されている
- 手順 4 が適用されず（ファイル不変）、英語の拒否メッセージを返す

## T6: 部分承認（core API）

使い捨てスクリプトで:

1. document に 2 ops（`add_node` と `add_note`）の提案を追加
2. core の部分適用 API（export 名は index.ts で確認。例: `applyProposalPartial`）で **op[0] のみ**適用

**合格基準**:
- ノードは追加され、ノートは追加されていない
- 提案 status が "partially_accepted"
- 適用済み op の記録（`appliedOpIndexes` 等）に `[0]` が残る

## T7: パッケージ版 MCP 同梱物の起動確認

1. `apps/desktop/release/win-unpacked/resources/mcp-server/bundle.cjs` が存在すること（なければ `pnpm package:dir` を実行してから確認）
2. 一時ワークスペースを指定して `node <bundle.cjs> --workspace <W>` を起動し、stdio で `initialize` → `tools/list` を送る

**合格基準**: プロセスがクラッシュせず、`tools/list` のレスポンスに `diagram_propose_patch` と `diagram_add_comment` が含まれる。

## T8: ビルド成果物

1. `pnpm build`

**合格基準**: exit code 0。`apps/desktop/dist/renderer/index.html` が生成されている。

## T9: i18n 辞書の整合性

使い捨てスクリプト（または既存の手段）で `apps/desktop/src/renderer/i18n/ja.ts` と `en.ts` のキー集合を比較する（tsx での import か、正規表現抽出でも可）。

**合格基準**: ja と en のキー集合が完全一致（片方にだけ存在するキーが 0 件）。

## T10: Mermaid ラウンドトリップで新フィールドが保全される

使い捨てスクリプトで:

1. reviewNote 付きの却下済み提案、parentId 付きコメントを含む document を作る
2. `exportMermaid` → `importMermaid` で往復させる

**合格基準**: 往復後の document に、却下済み提案の reviewNote と、コメントの parentId が保持されている。

---

## GUI 手動確認項目（Codex の対象外・記録のみ）

以下は画面操作が必要なため Codex は実行しない。`docs/TEST_RESULTS_v0.2.md` の末尾に「未実施（GUI 手動確認項目）」として一覧を転記すること。

- M1: アプリ起動 → 言語トグルで日本語/英語が切り替わり、再起動後も維持される
- M2: アプリ表示中に外部（MCP）から提案を追加 → 手を触れずに提案パネルと活動フィードに出現する
- M3: 提案の op ごとのチェックボックスで部分承認ができ、プレビューに反映される
- M4: 却下時に理由を入力でき、決定済み一覧に表示される
- M5: コメントへの返信（スレッド）と解決が GUI でできる
- M6: サイドバーの「接続設定をコピー」2 種が実在パスを含む
- M7: PNG / HTML エクスポートが保存ダイアログ経由で出力され、HTML 単体で図が見える
- M8: ツールバーのリロードボタンで外部変更が反映される
