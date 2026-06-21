# Design: 運用堅牢性と利便性の向上

## 概要

gas-kindle-to-notion の運用面を強化する3つの機能を追加する。
OSSとして他のユーザーにも使ってもらうことを前提に、信頼性の高い動作を目指す。

## 目的

- 同じ書籍のハイライトが重複してNotionに登録されるのを防ぐ
- 1回の実行で溜まったメールを全件処理できるようにする
- 処理結果をスプレッドシートで確認できるようにする

## 前提条件

- **デプロイ形式**: コンテナバインドスクリプト（スプレッドシートに紐付けたGASプロジェクト）
  - `SpreadsheetApp.getActiveSpreadsheet()` でログ先を取得する
  - `.clasp.json` の `rootDir` や `parentId` はユーザーが設定する前提

---

## 機能1: 重複チェック

### スクリプトプロパティ

| プロパティ名 | 説明 | デフォルト値 |
|---|---|---|
| `NOTION_DUPLICATE_MODE` | 重複時の動作。`skip`（スキップ）または `merge`（既存ページに追記） | `skip` |

### 処理フロー

1. `sendToNotion` の前に、Notion Database Query API でタイトルが一致するページを検索する
2. ヒットした場合:
   - `skip`: ログに「スキップ（重複）」と記録し、次のメールへ進む
   - `merge`: 既存ページのブロックを取得し、paragraphブロックのテキスト内容をSetに収集する。新しいハイライトのうち、Setに含まれないもののみをページに追記する
3. ヒットしなかった場合: 通常通り新規ページを作成する

### 新規関数

- `queryNotionDatabase(title: string, config: Config): string | null` — タイトルでNotion DBを検索し、ヒットすればページIDを返す
- `getExistingHighlightTexts(pageId: string, config: Config): Set<string>` — 既存ページのparagraphブロックのテキストを収集してSetで返す

### ファイル変更

- `src/types.ts`: `Config` に `notionDuplicateMode: 'skip' | 'merge'` を追加
- `src/notion.ts`: `queryNotionDatabase`、`getExistingHighlightTexts` を追加。`sendToNotion` に重複チェックロジックを組み込む
- `src/main.ts`: `getConfig()` に `NOTION_DUPLICATE_MODE` の読み取りを追加

---

## 機能2: 処理件数の拡大

### 変更内容

1. `GmailApp.search(..., 0, 1)` → `GmailApp.search(..., 0, maxThreads)` に変更
2. メッセージの `slice(0, 3)` 制限を撤廃し、スレッド内の全メッセージを処理する
3. 既存の5分タイムアウト（`MAX_EXECUTION_TIME`）は維持する。制限に達したら残りは次回の実行で処理される
4. `GMAIL_MAX_THREADS` スクリプトプロパティでバッチサイズを設定可能にする（デフォルト: 50）

### ファイル変更

- `src/types.ts`: `Config` に `gmailMaxThreads: number` を追加
- `src/main.ts`: 検索パラメータとメッセージ処理ループを変更

---

## 機能3: Google Sheetsへのログ記録

### デプロイ形式

コンテナバインドスクリプト前提。`SpreadsheetApp.getActiveSpreadsheet()` でスプレッドシートを取得する。

### スプレッドシート構造

シート名: `ProcessingLog`（存在しなければ自動作成）

| 列 | 内容 |
|---|---|
| タイムスタンプ | 処理日時 |
| 書籍タイトル | パースした書籍名 |
| 著者 | パースした著者名 |
| ハイライト数 | 送信したハイライトの件数 |
| ステータス | 成功 / スキップ（重複） / マージ / エラー |
| NotionページURL | 作成または追記したページのURL（`https://notion.so/{pageId}`） |
| エラー詳細 | エラー発生時のメッセージ |

### 処理フロー

1. `main.ts` で各メール処理の結果を `ProcessingResult[]` に蓄積する
2. 全処理完了後、`logger.writeResults(results)` を1回呼び出す
3. スプレッドシートへの書き込みに失敗しても、メイン処理は中断しない（ログ書き込みエラーは `console.log` に記録）

### 新規ファイル

- `src/logger.ts`: スプレッドシートへのログ書き込み関数
  - `writeResults(results: ProcessingResult[]): void`
  - `ensureLogSheet(): GoogleAppsScript.Spreadsheet.Sheet` — シートの存在確認と自動作成

### 新規型定義

```typescript
type ProcessingStatus = '成功' | 'スキップ（重複）' | 'マージ' | 'エラー';

interface ProcessingResult {
  timestamp: Date;
  title: string;
  authors: string;
  highlightCount: number;
  status: ProcessingStatus;
  notionPageUrl: string;
  errorDetail: string;
}
```

### ファイル変更

- `src/types.ts`: `ProcessingResult` と `ProcessingStatus` を追加
- `src/main.ts`: 処理結果の収集と `logger.writeResults` の呼び出しを追加

---

## Config 型の最終形

```typescript
interface Config {
  notionToken: string;
  notionDatabaseId: string;
  gmailLabel: string;
  notionTitleProperty: string;
  notionAuthorProperty: string;
  notionDuplicateMode: 'skip' | 'merge';
  gmailMaxThreads: number;
}
```

## スクリプトプロパティ一覧（更新後）

| プロパティ名 | 説明 | デフォルト値 |
|---|---|---|
| `NOTION_TOKEN` | Notion APIトークン | (必須) |
| `NOTION_DATABASE_ID` | NotionデータベースID | (必須) |
| `GMAIL_LABEL` | 処理対象Gmailラベル | `kindle-highlights` |
| `NOTION_TITLE_PROPERTY` | タイトル用プロパティ名 | `Name` |
| `NOTION_AUTHOR_PROPERTY` | 著者用プロパティ名 | `Authors` |
| `NOTION_DUPLICATE_MODE` | 重複時動作（`skip` / `merge`） | `skip` |
| `GMAIL_MAX_THREADS` | 1回の実行で処理する最大スレッド数 | `50` |

## テスト計画

- `notion.test.ts`: `queryNotionDatabase` と `getExistingHighlightTexts` のモックテスト追加
- `notion.test.ts`: `sendToNotion` の重複チェック（skip/merge）のテスト追加
- `logger.test.ts`: スプレッドシートへの書き込みモックテスト
- 既存テストがすべて引き続きパスすること
