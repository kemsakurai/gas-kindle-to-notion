import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getExistingHighlightTexts,
  queryNotionDatabase,
  sendToNotion,
} from './notion';
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
  notionDuplicateMode: 'skip',
  gmailMaxThreads: 50,
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

describe('queryNotionDatabase', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('タイトルが一致するページのIDを返す', () => {
    mockFetch.mockReturnValue(
      mockSuccessResponse({
        results: [{ id: 'existing-page-id' }],
      }),
    );

    const result = queryNotionDatabase('Test Book', testConfig);
    expect(result).toBe('existing-page-id');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/databases/test-db-id/query');
    expect(options.method).toBe('post');

    const payload = JSON.parse(options.payload);
    expect(payload.filter.property).toBe('Name');
    expect(payload.filter.title.equals).toBe('Test Book');
  });

  test('一致するページがなければnullを返す', () => {
    mockFetch.mockReturnValue(mockSuccessResponse({ results: [] }));

    const result = queryNotionDatabase('Nonexistent Book', testConfig);
    expect(result).toBeNull();
  });
});

describe('getExistingHighlightTexts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('既存ページのparagraphテキストをSetで返す', () => {
    mockFetch.mockReturnValue(
      mockSuccessResponse({
        results: [
          {
            type: 'paragraph',
            paragraph: {
              rich_text: [{ text: { content: 'existing highlight' } }],
            },
          },
          {
            type: 'heading_3',
            heading_3: {
              rich_text: [{ text: { content: 'heading text' } }],
            },
          },
          {
            type: 'paragraph',
            paragraph: {
              rich_text: [{ text: { content: 'another highlight' } }],
            },
          },
        ],
        has_more: false,
      }),
    );

    const result = getExistingHighlightTexts('page-123', testConfig);
    expect(result).toEqual(
      new Set(['existing highlight', 'another highlight']),
    );
  });

  test('ブロックがなければ空のSetを返す', () => {
    mockFetch.mockReturnValue(
      mockSuccessResponse({ results: [], has_more: false }),
    );

    const result = getExistingHighlightTexts('page-123', testConfig);
    expect(result).toEqual(new Set());
  });
});

describe('sendToNotion', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSleep.mockReset();
    mockFetch.mockReturnValue(mockSuccessResponse());
  });

  test('重複なしの場合、新規ページを作成し「成功」を返す', () => {
    mockFetch
      .mockReturnValueOnce(mockSuccessResponse({ results: [] }))
      .mockReturnValue(mockSuccessResponse({ id: 'page-123' }));

    const result = sendToNotion(testBookData, testConfig);
    expect(result.status).toBe('成功');
    expect(result.pageId).toBe('page-123');
  });

  test('skipモードで重複がある場合、スキップする', () => {
    mockFetch.mockReturnValueOnce(
      mockSuccessResponse({ results: [{ id: 'existing-page' }] }),
    );

    const skipConfig = {
      ...testConfig,
      notionDuplicateMode: 'skip' as const,
    };
    const result = sendToNotion(testBookData, skipConfig);
    expect(result.status).toBe('スキップ（重複）');
    expect(result.pageId).toBe('existing-page');
    // ページ作成APIは呼ばれない（DB検索の1回のみ）
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('mergeモードで新規ハイライトがある場合、追記する', () => {
    mockFetch
      .mockReturnValueOnce(
        mockSuccessResponse({ results: [{ id: 'existing-page' }] }),
      )
      .mockReturnValueOnce(
        mockSuccessResponse({
          results: [
            {
              type: 'paragraph',
              paragraph: {
                rich_text: [{ text: { content: 'old highlight' } }],
              },
            },
          ],
          has_more: false,
        }),
      )
      .mockReturnValue(mockSuccessResponse());

    const mergeConfig = {
      ...testConfig,
      notionDuplicateMode: 'merge' as const,
    };
    const result = sendToNotion(testBookData, mergeConfig);
    expect(result.status).toBe('マージ');
    expect(result.pageId).toBe('existing-page');
  });

  test('mergeモードで全ハイライトが重複している場合、スキップする', () => {
    mockFetch
      .mockReturnValueOnce(
        mockSuccessResponse({ results: [{ id: 'existing-page' }] }),
      )
      .mockReturnValueOnce(
        mockSuccessResponse({
          results: [
            {
              type: 'paragraph',
              paragraph: {
                rich_text: [{ text: { content: 'Highlight text' } }],
              },
            },
          ],
          has_more: false,
        }),
      );

    const mergeConfig = {
      ...testConfig,
      notionDuplicateMode: 'merge' as const,
    };
    const result = sendToNotion(testBookData, mergeConfig);
    expect(result.status).toBe('スキップ（重複）');
  });

  test('Notion APIにページ作成リクエストを送信する', () => {
    mockFetch
      .mockReturnValueOnce(mockSuccessResponse({ results: [] }))
      .mockReturnValue(mockSuccessResponse({ id: 'page-123' }));

    sendToNotion(testBookData, testConfig);

    // 2回目の呼び出しがページ作成（1回目はDB検索）
    const [url, options] = mockFetch.mock.calls[1];
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(options.method).toBe('post');

    const payload = JSON.parse(options.payload);
    expect(payload.parent.database_id).toBe('test-db-id');
    expect(payload.properties.Name.title[0].text.content).toBe('Test Book');
  });

  test('著者プロパティをペイロードに含める', () => {
    mockFetch
      .mockReturnValueOnce(mockSuccessResponse({ results: [] }))
      .mockReturnValue(mockSuccessResponse({ id: 'page-123' }));

    sendToNotion(testBookData, testConfig);

    const [, options] = mockFetch.mock.calls[1];
    const payload = JSON.parse(options.payload);
    expect(payload.properties.Authors.rich_text[0].text.content).toBe(
      'Test Author',
    );
  });

  test('ページ作成APIエラー時に例外を投げる', () => {
    mockFetch
      .mockReturnValueOnce(mockSuccessResponse({ results: [] }))
      .mockReturnValue(mockErrorResponse(400, 'Bad Request'));

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

    mockFetch
      .mockReturnValueOnce(mockSuccessResponse({ results: [] }))
      .mockReturnValue(mockSuccessResponse({ id: 'page-456' }));

    sendToNotion(bookWithoutAuthor, testConfig);

    const [, options] = mockFetch.mock.calls[1];
    const payload = JSON.parse(options.payload);
    expect(payload.properties.Authors).toBeUndefined();
  });
});
