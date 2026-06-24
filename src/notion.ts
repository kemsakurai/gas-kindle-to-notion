import type {
  BookData,
  Config,
  KindleHighlight,
  NotionBlock,
  ProcessingStatus,
} from './types';

/**
 * ログ記録関数
 */
function logMessage(message: string, isError: boolean = false): void {
  console.log(`${isError ? 'ERROR' : 'INFO'}: ${message}`);
}

/**
 * Notion DBをタイトルで検索し、既存ページIDを返す（なければnull）
 */
export function queryNotionDatabase(
  title: string,
  config: Config,
): string | null {
  const payload = {
    filter: {
      property: config.notionTitleProperty || 'Name',
      title: {
        equals: title,
      },
    },
    page_size: 1,
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(
    `https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`,
    options,
  );

  if (response.getResponseCode() !== 200) {
    logMessage(`Notion DB検索エラー: ${response.getContentText()}`, true);
    return null;
  }

  const data = JSON.parse(response.getContentText());
  if (data.results && data.results.length > 0) {
    return data.results[0].id;
  }
  return null;
}

/**
 * 既存ページのparagraphブロックのテキストをSetで返す
 */
export function getExistingHighlightTexts(
  pageId: string,
  config: Config,
): Set<string> {
  const texts = new Set<string>();
  let hasMore = true;
  let nextCursor: string | undefined;

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'get',
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      'Notion-Version': '2022-06-28',
    },
    muteHttpExceptions: true,
  };

  while (hasMore) {
    let url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`;
    if (nextCursor) {
      url += `&start_cursor=${nextCursor}`;
    }

    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() !== 200) {
      logMessage(`ブロック取得エラー: ${response.getContentText()}`, true);
      break;
    }

    const data = JSON.parse(response.getContentText());
    for (const block of data.results) {
      if (
        block.type === 'paragraph' &&
        block.paragraph?.rich_text?.length > 0
      ) {
        texts.add(block.paragraph.rich_text[0].text.content);
      }
    }

    hasMore = data.has_more;
    nextCursor = data.next_cursor;
  }

  return texts;
}

/**
 * NotionにBookDataを送信する関数
 * 重複チェック（skip/merge）に対応
 */
export function sendToNotion(
  bookData: BookData,
  config: Config,
): { pageId: string; status: ProcessingStatus } {
  try {
    // 重複チェック: タイトルで既存ページを検索
    const existingPageId = queryNotionDatabase(bookData.title, config);

    if (existingPageId) {
      if (config.notionDuplicateMode === 'skip') {
        logMessage(
          `"${bookData.title}" は既にNotionに存在するためスキップします`,
        );
        return { pageId: existingPageId, status: 'スキップ（重複）' };
      }

      // merge モード: 既存ページにハイライトを追記
      const existingTexts = getExistingHighlightTexts(existingPageId, config);
      const newHighlights = bookData.highlights.filter(
        (h) => !existingTexts.has(h.text),
      );

      if (newHighlights.length === 0) {
        logMessage(
          `"${bookData.title}" の全ハイライトが既に存在するためスキップします`,
        );
        return { pageId: existingPageId, status: 'スキップ（重複）' };
      }

      appendHighlightsToPage(existingPageId, newHighlights, config);
      logMessage(
        `"${bookData.title}" に ${newHighlights.length} 件の新規ハイライトを追記しました`,
      );
      return { pageId: existingPageId, status: 'マージ' };
    }

    // 新規ページを作成
    const pageId = createNotionPage(bookData, config);
    logMessage(
      `"${bookData.title}" を ${bookData.highlights.length} 件のハイライトとともにNotionに送信しました`,
    );
    return { pageId, status: '成功' };
  } catch (error) {
    logMessage(`Notionへの送信エラー: ${error.message}`, true);
    throw error;
  }
}

/**
 * NotionページをAPI経由で作成する
 */
function createNotionPage(bookData: BookData, config: Config): string {
  // ページプロパティを設定
  const properties = {
    [config.notionTitleProperty || 'Name']: {
      title: [
        {
          text: {
            content: bookData.title,
          },
        },
      ],
    },
  };

  if (bookData.authors && config.notionAuthorProperty) {
    properties[config.notionAuthorProperty] = {
      rich_text: [
        {
          text: {
            content: bookData.authors,
          },
        },
      ],
    };
  }

  // まず空のページを作成
  const initialPayload = {
    parent: {
      database_id: config.notionDatabaseId,
    },
    properties,
    children: [], // 最初は空のチルドレンで作成
  };

  // NotionのAPIにPOSTリクエスト（ページ作成）
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(initialPayload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(
    'https://api.notion.com/v1/pages',
    options,
  );

  if (response.getResponseCode() !== 200) {
    throw new Error(`Notion APIエラー: ${response.getContentText()}`);
  }

  const responseData = JSON.parse(response.getContentText());
  const pageId = responseData.id;

  // コンテンツをバッチ処理するための準備
  const MAX_BLOCKS_PER_REQUEST = 90; // 安全マージンを持たせて90に設定
  const sections = organizeHighlightsBySection(bookData.highlights);

  // セクションごとにブロックを追加
  for (const [sectionName, sectionHighlights] of Object.entries(sections)) {
    // セクションヘッダーを追加
    if (sectionName) {
      appendBlocksToNotionPage(
        pageId,
        [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: sectionName,
                  },
                },
              ],
              color: 'default',
            },
          },
        ],
        config,
      );
    }

    // ハイライトをバッチに分割
    for (
      let i = 0;
      i < sectionHighlights.length;
      i += MAX_BLOCKS_PER_REQUEST / 2
    ) {
      const batchHighlights = sectionHighlights.slice(
        i,
        i + MAX_BLOCKS_PER_REQUEST / 2,
      );
      const batchBlocks: NotionBlock[] = [];

      // バッチ内の各ハイライトのブロックを作成
      for (const highlight of batchHighlights) {
        // ハイライトの見出しを追加
        batchBlocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: highlight.heading,
                },
              },
            ],
            color: 'default',
          },
        });

        // ハイライトのテキストを追加（色付き）
        const backgroundColor = mapHighlightColor(highlight.highlightColor);

        batchBlocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: highlight.text,
                },
                annotations: {
                  color: backgroundColor,
                },
              },
            ],
          },
        });
      }

      // バッチをNotionに送信
      appendBlocksToNotionPage(pageId, batchBlocks, config);

      // APIレート制限を避けるために少し待機
      Utilities.sleep(500);
    }
  }

  logMessage(
    `ページ作成完了: ${bookData.highlights.length}件のハイライトを${pageId}に追加しました`,
  );
  return pageId;
}

/**
 * 既存ページにハイライトブロックを追記する（mergeモード用）
 */
function appendHighlightsToPage(
  pageId: string,
  highlights: KindleHighlight[],
  config: Config,
): void {
  const MAX_BLOCKS_PER_REQUEST = 90;
  const sections = organizeHighlightsBySection(highlights);

  for (const [sectionName, sectionHighlights] of Object.entries(sections)) {
    if (sectionName) {
      appendBlocksToNotionPage(
        pageId,
        [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: sectionName },
                },
              ],
              color: 'default',
            },
          },
        ],
        config,
      );
    }

    for (
      let i = 0;
      i < sectionHighlights.length;
      i += MAX_BLOCKS_PER_REQUEST / 2
    ) {
      const batchHighlights = sectionHighlights.slice(
        i,
        i + MAX_BLOCKS_PER_REQUEST / 2,
      );
      const batchBlocks: NotionBlock[] = [];

      for (const highlight of batchHighlights) {
        batchBlocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: { content: highlight.heading },
              },
            ],
            color: 'default',
          },
        });

        const backgroundColor = mapHighlightColor(highlight.highlightColor);
        batchBlocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: highlight.text },
                annotations: { color: backgroundColor },
              },
            ],
          },
        });
      }

      appendBlocksToNotionPage(pageId, batchBlocks, config);
      Utilities.sleep(500);
    }
  }
}

/**
 * ハイライトをセクション別に整理する
 */
function organizeHighlightsBySection(
  highlights: KindleHighlight[],
): Record<string, KindleHighlight[]> {
  const sections: Record<string, KindleHighlight[]> = {};

  for (const highlight of highlights) {
    const sectionName = highlight.section || '未分類';

    if (!sections[sectionName]) {
      sections[sectionName] = [];
    }

    sections[sectionName].push(highlight);
  }

  return sections;
}

/**
 * Notionページに追加のブロックを追加する
 */
function appendBlocksToNotionPage(
  pageId: string,
  blocks: NotionBlock[],
  config: Config,
): void {
  try {
    const payload = {
      children: blocks,
    };

    // Notionのappend_block_children APIにリクエスト
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'patch',
      headers: {
        Authorization: `Bearer ${config.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      options,
    );

    if (response.getResponseCode() !== 200) {
      throw new Error(`ブロック追加エラー: ${response.getContentText()}`);
    }

    logMessage(`${blocks.length}個のブロックをページに追加しました`);
  } catch (error) {
    logMessage(`ブロック追加エラー: ${error.message}`, true);
    throw error;
  }
}

/**
 * ハイライトの色をNotionの色形式に変換
 */
function mapHighlightColor(color?: string): string {
  switch (color) {
    case 'yellow':
      return 'yellow_background';
    case 'blue':
      return 'blue_background';
    case 'pink':
      return 'pink_background';
    case 'orange':
      return 'orange_background';
    default:
      return 'default';
  }
}
// 既存のコードの最後に追加
const notionModule = { sendToNotion };
export default notionModule;
