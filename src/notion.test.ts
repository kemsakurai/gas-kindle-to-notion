import { beforeEach, describe, expect, test, vi } from 'vitest';
import { sendToNotion } from './notion';
import type { BookData, Config } from './types';

// GAS グローバルのモック
const mockFetch = vi.fn();
const mockSleep = vi.fn();

(globalThis as Record<string, unknown>).UrlFetchApp = { fetch: mockFetch };
(globalThis as Record<string, unknown>).Utilities = { sleep: mockSleep };

const testConfig: Config = {
  notionToken: 'test-token',
  notionDatabaseId: 'test-db-id',
  gmailLabel: 'kindle-highlights',
  notionTitleProperty: 'Name',
  notionAuthorProperty: 'Authors',
};

const testBookData: BookData = {
  title: 'Test Book',
  authors: 'Test Author',
  highlights: [
    {
      section: 'Chapter 1',
      heading: 'Highlight heading',
      text: 'Highlight text',
      highlightColor: 'yellow',
    },
  ],
};

function mockSuccessResponse(
  body: Record<string, unknown> = { id: 'page-123' },
) {
  return {
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify(body),
  };
}

function mockErrorResponse(code: number, message: string) {
  return {
    getResponseCode: () => code,
    getContentText: () => JSON.stringify({ message }),
  };
}

describe('sendToNotion', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSleep.mockReset();
    // デフォルトで全リクエスト成功
    mockFetch.mockReturnValue(mockSuccessResponse());
  });

  test('Notion APIにページ作成リクエストを送信する', () => {
    sendToNotion(testBookData, testConfig);

    // 最初の呼び出しがページ作成
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(options.method).toBe('post');

    const payload = JSON.parse(options.payload);
    expect(payload.parent.database_id).toBe('test-db-id');
    expect(payload.properties.Name.title[0].text.content).toBe('Test Book');
  });

  test('著者プロパティをペイロードに含める', () => {
    sendToNotion(testBookData, testConfig);

    const [, options] = mockFetch.mock.calls[0];
    const payload = JSON.parse(options.payload);
    expect(payload.properties.Authors.rich_text[0].text.content).toBe(
      'Test Author',
    );
  });

  test('ハイライトブロックをページに追加する', () => {
    sendToNotion(testBookData, testConfig);

    // 2回目以降の呼び出しがブロック追加（セクションヘッダー + ハイライト）
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1);

    // セクションヘッダーのブロック追加
    const [sectionUrl] = mockFetch.mock.calls[1];
    expect(sectionUrl).toContain('/blocks/page-123/children');
  });

  test('Authorizationヘッダーにトークンを設定する', () => {
    sendToNotion(testBookData, testConfig);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(options.headers['Notion-Version']).toBe('2022-06-28');
  });

  test('ページ作成APIエラー時に例外を投げる', () => {
    mockFetch.mockReturnValue(mockErrorResponse(400, 'Bad Request'));

    expect(() => sendToNotion(testBookData, testConfig)).toThrow(
      'Notion APIエラー',
    );
  });

  test('著者なしの書籍データでもページ作成できる', () => {
    const bookWithoutAuthor: BookData = {
      title: 'No Author Book',
      highlights: [
        {
          section: '',
          heading: 'Heading',
          text: 'Text',
          highlightColor: 'default',
        },
      ],
    };

    sendToNotion(bookWithoutAuthor, testConfig);

    const [, options] = mockFetch.mock.calls[0];
    const payload = JSON.parse(options.payload);
    expect(payload.properties.Authors).toBeUndefined();
  });

  test('ページIDを返す', () => {
    const result = sendToNotion(testBookData, testConfig);
    expect(result).toBe('page-123');
  });
});
