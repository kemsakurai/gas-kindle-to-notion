/**
 * アプリケーション設定を表すインターフェース
 */
export interface Config {
  notionToken: string;
  notionDatabaseId: string;
  gmailLabel: string;
  notionTitleProperty?: string;  // Notion Title プロパティ名
  notionAuthorProperty?: string; // Notion 著者プロパティ名
}

/**
 * Kindleのハイライト情報を表すインターフェース
 */
export interface KindleHighlight {
  section: string;
  heading: string;
  text: string;
  highlightColor?: string;
}

/**
 * 書籍データを表すインターフェース
 */
export interface BookData {
  title: string;
  authors?: string;
  highlights: KindleHighlight[];
}

/**
 * グローバル関数を定義するインターフェース
 */
export interface Global {
  processKindleHighlights: () => void;
  setupTrigger: () => void;
  clearProcessedEmails: () => void;
}

/**
 * Notion APIブロック定義
 */
export interface NotionBlock {
  object: string;
  type: string;
  [key: string]: any;
}
