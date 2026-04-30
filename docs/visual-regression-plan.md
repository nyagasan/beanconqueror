# PR 自動スクリーンショット差分コメント機構 — 作業計画

## 目的

GitHub に Pull Request が作成・更新されたときに、実装差分の影響を受ける画面（ルート / ページ）のスクリーンショットを自動取得し、ベースブランチ（`develop` 等）との差分画像を PR のコメントに表示できるようにする。

対象リポジトリ: `nyagasan/beanconqueror`（Ionic + Angular アプリ）
初期スコープ: **フォーク（fork）からの PR 専用** で動作させる想定。

---

## 前提と技術選定（要レビュー）

- アプリは Ionic/Angular。`pnpm run build` で `www/` 等にビルド成果物が出力され、ローカルで配信可能。
- スクリーンショット取得は **Playwright** を採用予定（モバイル UA / ビューポートの再現、複数ブラウザ対応、CI 親和性）。
- 画像差分は **pixelmatch + pngjs**（軽量・依存少）で実装、しきい値超過時に diff PNG を生成。
- 「差分のある画面」の検出は段階的に強化する：
  - **MVP**: 全主要ルートを毎回撮影（撮り漏れを防ぐ。最も確実）。
  - **拡張**: PR の変更ファイルから影響ルートをマッピングし、対象を絞る（ノイズ削減）。
- ベースライン画像の保存先：本リポジトリの `tests/visual/__baselines__/` 配下に PNG をコミット（LFS は使わずまずは PNG のままで開始。サイズが問題化したら Git LFS 検討）。
- PR コメントへの画像表示：差分画像を **Artifact にアップロード** し、加えて画像をコメントに埋め込みたいので **専用ブランチ**（例: `visual-regression-reports`）に commit & push し、その raw URL をコメントに貼る方式を採用する。

### Fork PR で動作させるための重要な考慮（セキュリティ）

GitHub Actions では、fork からの `pull_request` イベントでは `GITHUB_TOKEN` が **read-only** で、PR コメント投稿や任意ブランチへの push ができません。さらに、untrusted なフォークのコードをそのままビルドして書き込み権限を渡すと **pwn request** 脆弱性につながります。

そのため、以下の **2 ワークフロー分割パターン**（GitHub 公式推奨）で設計します：

1. **`visual-regression-build.yml`**（`pull_request` トリガー）
   - fork のコードを **書き込み権限なし**でチェックアウト・ビルド・スクリーンショット撮影。
   - 結果（スクショ・diff・メタデータ JSON）を **Artifact** としてアップロード。
2. **`visual-regression-comment.yml`**（`workflow_run: completed` トリガー）
   - Artifact をダウンロードし、信頼できるベースリポジトリ側の権限で
     - 差分画像を `visual-regression-reports` ブランチへ push
     - PR にコメント投稿
   - **fork のコードは絶対に実行しない**（ダウンロードしたデータのみ扱う）。

この分離により、fork PR でも安全にコメントを書き込めます。

---

## 計画（ステップ）

### フェーズ 0: 要件確定

- [ ] **0-1.** 撮影対象の初期ルート一覧の合意（MVP 範囲の確定）
- [ ] **0-2.** 比較ベースとなるブランチの確定（`develop` を想定）
- [ ] **0-3.** ベースライン更新フロー（自動 / ラベルトリガー / 手動コミット）の確定
- [ ] **0-4.** 後述の [Question] への回答受領

### フェーズ 1: ローカルでのスクリーンショット基盤構築

- [ ] **1-1.** `playwright` と `pixelmatch`, `pngjs` を `devDependencies` に追加
- [ ] **1-2.** `tests/visual/` ディレクトリを作成し、以下を整備
  - `playwright.config.ts`（モバイルビューポート設定、`webServer` でビルド成果物を配信）
  - `screenshot.spec.ts`（撮影対象ルートの一覧を定義し、各ルートで `page.screenshot()`）
  - `routes.ts`（撮影対象ルートと表示前の準備（ダミーデータ投入等）の定義）
  - `__baselines__/`（ベースライン PNG 置き場）
  - `__diffs__/` は CI 生成物のため `.gitignore` に追加
- [ ] **1-3.** `package.json` に `test:visual`, `test:visual:update` スクリプトを追加
- [ ] **1-4.** ローカルでベースラインを生成し、初期コミット

### フェーズ 2: 差分検出とレポート生成

- [ ] **2-1.** `tools/visual-diff.mjs` を実装
  - ベースラインと最新スクショを pixelmatch で比較
  - 差分ピクセル数 / 比率を計算、しきい値超過した画面のみ diff PNG を生成
  - レポート JSON（画面名・差分率・画像パス）を出力
- [ ] **2-2.** PR の変更ファイルから影響ルートを推定する簡易マッパーを実装（任意・拡張）
  - 変更された `*.page.ts` / `*.component.ts` → ルートへのマップを生成
  - MVP では全画面撮影、マップが整ったら絞り込みに切替

### フェーズ 3: GitHub Actions ワークフロー（fork PR 対応）

- [ ] **3-1.** `.github/workflows/visual-regression-build.yml` を追加
  - トリガー: `pull_request`（fork も含む）
  - `permissions: contents: read` のみ
  - チェックアウト → `pnpm install` → `pnpm run build` → Playwright インストール → スクリーンショット撮影 → diff 計算
  - `actions/upload-artifact@v4` で `screenshots/`, `diffs/`, `report.json`, および `pr-meta.txt`（PR 番号・head SHA）をアップロード
- [ ] **3-2.** `.github/workflows/visual-regression-comment.yml` を追加
  - トリガー: `workflow_run` (`workflows: [Visual Regression Build]`, `types: [completed]`)
  - `permissions: pull-requests: write, contents: write`
  - 前段ワークフローの Artifact をダウンロード（`actions/github-script` または `dawidd6/action-download-artifact`）
  - `pr-meta.txt` から PR 番号を取得
  - `visual-regression-reports` ブランチへ `pr-<番号>/<run-id>/` 配下に画像を push
  - PR コメントを Markdown 表で投稿（screen 名 / Before / After / Diff / 差分率）
  - 既存の bot コメントがあれば更新（コメント識別マーカーを埋め込む）
- [ ] **3-3.** `visual-regression-reports` ブランチを空コミットで初期化（手動 1 回のみ）
- [ ] **3-4.** ワークフローの `concurrency` 設定で同一 PR の重複実行をキャンセル

### フェーズ 4: 検証

- [ ] **4-1.** 同一リポジトリ内 PR で動作確認（差分なし → コメントは「差分なし」表示）
- [ ] **4-2.** わざと UI を変更した PR で diff が検出され、画像付きコメントが投稿されることを確認
- [ ] **4-3.** **fork からの PR でも** コメントが正しく投稿されることを確認（最重要）
- [ ] **4-4.** Artifact 保持期間（デフォルト 90 日）と `visual-regression-reports` ブランチのサイズ管理方針を README 化

### フェーズ 5: ドキュメント

- [ ] **5-1.** `DEVELOPING.md` または `docs/visual-regression.md` に
  - ローカル実行方法（`pnpm test:visual`）
  - ベースライン更新手順
  - フォーク PR での挙動の説明
  - を追記

---

## 成果物一覧

- `docs/visual-regression-plan.md`（本ファイル）
- `docs/visual-regression.md`（運用ドキュメント）
- `playwright.config.ts`
- `tests/visual/screenshot.spec.ts` / `routes.ts` / `__baselines__/*.png`
- `tools/visual-diff.mjs`
- `.github/workflows/visual-regression-build.yml`
- `.github/workflows/visual-regression-comment.yml`
- `package.json` のスクリプト・依存関係更新

---

## 確認事項（ご回答ください）

[Question 1] 比較対象のベースブランチは `develop` で確定でしょうか？（`master` も併用しますか？）
[Answer 1]

[Question 2] MVP で撮影する画面の範囲は「主要トップ画面のみ（Home / Brews / Beans / Mill / Statistics / Settings 等）」を想定していますが、特に押さえたい画面や、逆に除外したい画面はありますか？
[Answer 2]

[Question 3] スクリーンショットのビューポートは「iPhone 13 (390x844) ライトモード 1 種」をデフォルトにしますが、ダークモード / iPad / Android 端末サイズも追加しますか？
[Answer 3]

[Question 4] アプリは起動時にダミーデータがない状態だと空画面が多いです。撮影前に Storage へ流し込むダミーデータ（豆・抽出履歴）を用意してよいですか？（テスト用 JSON を `tests/visual/fixtures/` に置く想定）
[Answer 4]

[Question 5] 差分画像のホスティング方法として「`visual-regression-reports` ブランチに push して raw URL を PR コメントに貼る」案で問題ないでしょうか？（容量肥大が懸念な場合は orphan コミット運用 or 一定期間で古い run を削除する GC ジョブを追加します）
[Answer 5]

[Question 6] ベースライン更新の運用は次のどれが望ましいですか？
- A) PR に `update-visual-baselines` ラベルを付けるとワークフローがベースラインを自動更新してコミット
- B) 開発者がローカルで `pnpm test:visual:update` を実行して手動コミット
- C) 両方提供
[Answer 6]

[Question 7] 「fork 専用」とのことですが、これは「fork からの PR でも動くようにしたい」（同一リポジトリの PR でも動く）という解釈で合っていますか？それとも「fork からの PR のときだけ実行したい」（同一リポジトリの PR では実行しない）という意図でしょうか？
[Answer 7]

---

## レビュー依頼

上記の計画と [Question] へのご回答をお願いします。承認いただいた後、フェーズ 1 から順に 1 ステップずつ実行し、各ステップ完了時に本ファイルのチェックボックスを更新してご報告します。
