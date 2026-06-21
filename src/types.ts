/**
 * アプリケーション設定を表すインターフェース
 */
export interface Config {
  notionToken: string;
  notionDatabaseId: string;
  gmailLabel: string;
  notionTitleProperty?: string; // Notion Title プロパティ名
  notionAuthorProperty?: string; // Notion 著者プロパティ名
  notionDuplicateMode: 'skip' | 'merge'; // 重複時の動作
  gmailMaxThreads: number; // 1回の実行で処理する最大スレッド数
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
 * Notion APIのリッチテキスト要素
 */
export interface NotionRichText {
  type: 'text';
  text: {
    content: string;
  };
  annotations?: {
    color?: string;
  };
}

/**
 * Notion APIブロック定義（heading_2, heading_3, paragraph を使用）
 */
export type NotionBlock =
  | {
      object: 'block';
      type: 'heading_2';
      heading_2: {
        rich_text: NotionRichText[];
        color: string;
      };
    }
  | {
      object: 'block';
      type: 'heading_3';
      heading_3: {
        rich_text: NotionRichText[];
        color: string;
      };
    }
  | {
      object: 'block';
      type: 'paragraph';
      paragraph: {
        rich_text: NotionRichText[];
      };
    };

/**
 * 処理結果のステータス
 */
export type ProcessingStatus =
  | '成功'
  | 'スキップ（重複）'
  | 'マージ'
  | 'エラー';

/**
 * 各書籍の処理結果を表すインターフェース
 */
export interface ProcessingResult {
  timestamp: Date;
  title: string;
  authors: string;
  highlightCount: number;
  status: ProcessingStatus;
  notionPageUrl: string;
  errorDetail: string;
}
