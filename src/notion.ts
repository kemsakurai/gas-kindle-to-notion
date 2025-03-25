import { Config, BookData, KindleHighlight, NotionBlock } from './types';

/**
 * ログ記録関数
 */
function logMessage(message: string, isError: boolean = false): void {
  console.log(`${isError ? 'ERROR' : 'INFO'}: ${message}`);
}

/**
 * NotionにBookDataを送信する関数
 */
export function sendToNotion(bookData: BookData, config: Config) {
  try {
    // Notionページを作成
    const pageId = createNotionPage(bookData, config);
    logMessage(`"${bookData.title}" を ${bookData.highlights.length} 件のハイライトとともにNotionに送信しました`);
    return pageId;
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
            content: bookData.title
          }
        }
      ]
    }
  };
  
  if (bookData.authors && config.notionAuthorProperty) {
    properties[config.notionAuthorProperty] = {
      rich_text: [
        {
          text: {
            content: bookData.authors
          }
        }
      ]
    };
  }
  
  // まず空のページを作成
  const initialPayload = {
    parent: {
      database_id: config.notionDatabaseId
    },
    properties,
    children: [] // 最初は空のチルドレンで作成
  };
  
  // NotionのAPIにPOSTリクエスト（ページ作成）
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${config.notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(initialPayload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
  
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
        [{
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: sectionName
                }
              }
            ],
            color: 'default'
          }
        }], 
        config
      );
    }
    
    // ハイライトをバッチに分割
    for (let i = 0; i < sectionHighlights.length; i += MAX_BLOCKS_PER_REQUEST / 2) {
      const batchHighlights = sectionHighlights.slice(i, i + MAX_BLOCKS_PER_REQUEST / 2);
      const batchBlocks = [];
      
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
                  content: highlight.heading
                }
              }
            ],
            color: 'default'
          }
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
                  content: highlight.text
                },
                annotations: {
                  color: backgroundColor
                }
              }
            ]
          }
        });
      }
      
      // バッチをNotionに送信
      appendBlocksToNotionPage(pageId, batchBlocks, config);
      
      // APIレート制限を避けるために少し待機
      Utilities.sleep(500);
    }
  }
  
  logMessage(`ページ作成完了: ${bookData.highlights.length}件のハイライトを${pageId}に追加しました`);
  return pageId;
}

/**
 * ハイライトをセクション別に整理する
 */
function organizeHighlightsBySection(highlights: KindleHighlight[]): Record<string, KindleHighlight[]> {
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
function appendBlocksToNotionPage(pageId: string, blocks: NotionBlock[], config: Config): void {
  try {
    const payload = {
      children: blocks
    };
    
    // Notionのappend_block_children APIにリクエスト
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${config.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, options);
    
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