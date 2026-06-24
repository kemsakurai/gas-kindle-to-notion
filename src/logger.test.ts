import { beforeEach, describe, expect, test, vi } from 'vitest';
import { writeResults } from './logger';
import type { ProcessingResult } from './types';

// GAS グローバルのモック
const mockSetValues = vi.fn();
const mockGetRange = vi.fn().mockReturnValue({ setValues: mockSetValues });
const mockGetLastRow = vi.fn().mockReturnValue(1);
const mockSheet = {
  getRange: mockGetRange,
  getLastRow: mockGetLastRow,
};
const mockGetSheetByName = vi.fn();
const mockInsertSheet = vi.fn().mockReturnValue(mockSheet);
const mockSpreadsheet = {
  getSheetByName: mockGetSheetByName,
  insertSheet: mockInsertSheet,
};

(globalThis as Record<string, unknown>).SpreadsheetApp = {
  getActiveSpreadsheet: vi.fn().mockReturnValue(mockSpreadsheet),
};

const testResults: ProcessingResult[] = [
  {
    timestamp: new Date('2026-06-22T08:00:00'),
    title: 'Test Book',
    authors: 'Test Author',
    highlightCount: 5,
    status: '成功',
    notionPageUrl: 'https://notion.so/page123',
    errorDetail: '',
  },
];

describe('writeResults', () => {
  beforeEach(() => {
    mockGetSheetByName.mockReset();
    mockInsertSheet.mockReset().mockReturnValue(mockSheet);
    mockGetRange.mockReset().mockReturnValue({ setValues: mockSetValues });
    mockGetLastRow.mockReset().mockReturnValue(1);
    mockSetValues.mockReset();
  });

  test('既存シートにログを書き込む', () => {
    mockGetSheetByName.mockReturnValue(mockSheet);

    writeResults(testResults);

    expect(mockGetSheetByName).toHaveBeenCalledWith('ProcessingLog');
    expect(mockGetRange).toHaveBeenCalledWith(2, 1, 1, 7);
    expect(mockSetValues).toHaveBeenCalled();
  });

  test('シートがなければ自動作成してヘッダーを書き込む', () => {
    mockGetSheetByName.mockReturnValue(null);

    writeResults(testResults);

    expect(mockInsertSheet).toHaveBeenCalledWith('ProcessingLog');
    // ヘッダー書き込み + データ書き込みで2回
    expect(mockGetRange).toHaveBeenCalledTimes(2);
  });

  test('空の結果配列では何もしない', () => {
    writeResults([]);

    expect(mockGetSheetByName).not.toHaveBeenCalled();
  });
});
