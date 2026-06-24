import type { ProcessingResult } from './types';

const LOG_SHEET_NAME = 'ProcessingLog';
const HEADERS = [
  'タイムスタンプ',
  '書籍タイトル',
  '著者',
  'ハイライト数',
  'ステータス',
  'NotionページURL',
  'エラー詳細',
];

/**
 * 処理結果をスプレッドシートに書き込む
 */
export function writeResults(results: ProcessingResult[]): void {
  if (results.length === 0) {
    return;
  }

  try {
    const sheet = ensureLogSheet();
    const lastRow = sheet.getLastRow();

    const rows = results.map((r) => [
      r.timestamp,
      r.title,
      r.authors,
      r.highlightCount,
      r.status,
      r.notionPageUrl,
      r.errorDetail,
    ]);

    sheet.getRange(lastRow + 1, 1, rows.length, HEADERS.length).setValues(rows);
  } catch (error) {
    console.log(`ERROR: ログ書き込みエラー: ${error.message}`);
  }
}

/**
 * ログシートの存在確認と自動作成
 */
function ensureLogSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  return sheet;
}
