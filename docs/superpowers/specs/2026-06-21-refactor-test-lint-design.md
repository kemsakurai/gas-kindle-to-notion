# Design: テスト・ビルド環境のリファクタリングおよび品質管理ツールの導入

## 概要
Google Apps Script (GAS) 向けプロジェクト「gas-kindle-to-notion」の開発体験（DX）とコード品質を向上させるため、テストランナーを **Vitest** に移行し、コードの静的解析とフォーマッタとして **Biome** を導入する。

## 目的
- 壊れているテスト環境の修復（現在 `jest` 等が未登録）
- ESModules（`"type": "module"`）ネイティブ対応によるテスト設定の簡略化
- 超高速なLint/Formatter導入によるコード品質の均一化
- 将来的なコードリファクタリングを安全に行うための強固な基盤作り

## ツール構成と設計

### 1. テスト環境 (Vitest)
- **導入ツール**: `vitest`
- **設定**: ESModulesが標準で有効なため、最小限の設定ファイル (`vitest.config.ts`) を用意する。
- **変更点**:
  - `package.json` の `scripts.test` を `"vitest run"` に変更。
  - ローカル開発用に `"test:watch": "vitest"` を追加。
  - 不要になった Jest 関連の設定ファイル（`jest.config.cjs`）を削除。
  - `main.test.ts` で Jest 固有のAPI（例: `jest.fn()`, `jest.mock()` など）を使用している場合、Vitest互換API（`vi.fn()`, `vi.mock()`）へ書き換える。

### 2. 品質管理ツール (Biome)
- **導入ツール**: `@biomejs/biome`
- **設定ファイル**: `biome.json`
- **変更点**:
  - `package.json` に実行スクリプトを追加（`"lint": "biome check src/"`, `"format": "biome check --apply src/"` など）。
  - GAS特有のグローバル変数（`GmailApp`, `PropertiesService`, `ScriptApp`, `Utilities` 等）が 未定義エラー（noUndeclaredVariables）にならないよう、`biome.json` に環境設定を追加する。
  - 導入後、既存のソースコードすべてに対して初回フォーマットとLintを実行・修正する。

## 作業手順（実装計画の概要）

1. **不要ファイルの削除**
   - `jest.config.cjs` の削除
2. **ツールのインストール**
   - `vitest`, `@biomejs/biome` を `devDependencies` としてインストール
3. **Vitestの設定とテスト修正**
   - `vitest.config.ts` の作成
   - `src/main.test.ts` を修正し、テストが成功することを確認
4. **Biomeの設定と適用**
   - `biome.json` の生成とGAS向け調整
   - プロジェクト全体へのフォーマット適用とLint修正
5. **package.jsonのクリーンアップ**
   - 各種実行スクリプトの整理
