ワークスペース情報を収集しています# Kindle to Notion

## 概要

このプロジェクトはKindleのハイライトデータをNotionに送信するためのGoogle Apps Scriptアプリケーションです。Kindleからエクスポートされたハイライトデータ（HTML形式）を解析し、書籍のタイトル、著者、ハイライト内容をNotionのデータベースに登録します。

## 機能

- Kindleのハイライトデータ（HTML）のパース
- 書籍のタイトルと著者の抽出
- セクション別のハイライト内容の抽出
- ハイライトの色情報の保持
- Notionデータベースへのデータ送信

## 技術スタック

- TypeScript
- Google Apps Script
- Jest（テスト）
- esbuild（ビルド）

## 使い方

0. glaspのインストール
```
npm install -g clasp
clasp login
```

1. リポジトリをクローン
```
git clone https://github.com/kemsakurai/gas-kindle-to-notion.git
cd gas-kindle-to-notion
```

2. 依存パッケージのインストール
```
npm install
```

3. テストの実行
```
npm test
```

4. ビルド
```
npm run build
```

5. Google Apps Scriptへのデプロイ
```
npm run deploy
```


## スクリプトプロパティ設定

以下のプロパティをGoogle Apps Scriptのスクリプトプロパティに設定する必要があります：

| プロパティ名 | 説明 | デフォルト値 |
|------------|------|------------|
| `NOTION_TOKEN` | NotionのAPIインテグレーショントークン | (必須) |
| `NOTION_DATABASE_ID` | ハイライトを保存するNotionデータベースのID | (必須) |
| `GMAIL_LABEL` | 処理対象のGmailラベル | `kindle-highlights` |
| `NOTION_TITLE_PROPERTY` | Notionデータベースのタイトル用プロパティ名 | `Name` |
| `NOTION_AUTHOR_PROPERTY` | Notionデータベースの著者用プロパティ名 | `Authors` |

### スクリプトプロパティの設定方法

1. Google Apps Script エディタを開く
2. 左側のメニューから「プロジェクトの設定」をクリック
3. 「スクリプトプロパティ」タブを選択
4. 「スクリプトプロパティを追加」をクリックし、上記のプロパティを設定

## 開発

### ファイル構成

```
.clasp.json       - Google Apps Script連携用設定ファイル
esbuild.js        - ビルド設定
jest.config.cjs   - Jestテスト設定
package.json      - プロジェクト設定
tsconfig.json     - TypeScript設定
src/
  main.ts         - メインソースコード
  main.test.ts    - テストコード
```

## ライセンス

MIT