// GASアプリケーションのメインファイル
// Gmailをポーリングし、特定のラベルが付いたメールを取得して処理する

interface Config {
  notionToken: string;
  notionDatabaseId: string;
  gmailLabel: string;
  notionTitleProperty?: string;  // Notion Title プロパティ名
  notionAuthorProperty?: string; // Notion 著者プロパティ名
}

interface KindleHighlight {
  section: string;
  heading: string;
  text: string;
  highlightColor?: string;
}

interface BookData {
  title: string;
  authors?: string;
  highlights: KindleHighlight[];
}

interface Global {
  processKindleHighlights: () => void;
  setupTrigger: () => void;
  clearProcessedEmails: () => void;
}

/**
 * 設定を取得する
 */
function getConfig(): Config {
  const properties = PropertiesService.getScriptProperties();
  return {
    notionToken: properties.getProperty('NOTION_TOKEN') || '',
    notionDatabaseId: properties.getProperty('NOTION_DATABASE_ID') || '',
    gmailLabel: properties.getProperty('GMAIL_LABEL') || 'kindle-highlights',
    notionTitleProperty: properties.getProperty('NOTION_TITLE_PROPERTY') || 'Name',
    notionAuthorProperty: properties.getProperty('NOTION_AUTHOR_PROPERTY') || 'Authors'
  };
}

/**
 * ログ記録関数
 */
function logMessage(message: string, isError: boolean = false): void {
  console.log(`${isError ? 'ERROR' : 'INFO'}: ${message}`);
}

/**
 * メイン実行関数
 */
function processKindleHighlights() {
  try {
    const config = getConfig();
    logMessage('Kindleハイライト処理を開始します');
    
    // Gmailから特定ラベルのついたメールを検索（最大5件に制限）
    const threads = GmailApp.search(`label:${config.gmailLabel}`, 0, 1);
    logMessage(`ラベル「${config.gmailLabel}」が付いたメールスレッドが${threads.length}件見つかりました`);
    
    if (threads.length === 0) {
      logMessage('処理するメールがありません');
      return;
    }
    
    // 実行開始時間を記録
    const startTime = new Date().getTime();
    const MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5分（GASの上限は6分）
    
    // 各スレッドを処理
    for (const thread of threads) {
      try {
        // 実行時間をチェック、制限に近づいたら処理を中断
        if (new Date().getTime() - startTime > MAX_EXECUTION_TIME) {
          logMessage('実行時間制限に近づいたため、処理を中断します');
          break;
        }
        
        processThread(thread, config);
        
        // メモリ解放のためにスレッド処理後に少し待機
        Utilities.sleep(1000);
      } catch (error) {
        logMessage(`スレッド処理エラー (ID: ${thread.getId()}): ${error.message}`, true);
      }
    }
    
    logMessage('処理が正常に完了しました');
  } catch (error) {
    logMessage(`致命的なエラーが発生しました: ${error.message}`, true);
  }
}

/**
 * メールスレッド処理関数
 */
function processThread(thread: GoogleAppsScript.Gmail.GmailThread, config: Config) {
  const messages = thread.getMessages();
  logMessage(`スレッド(${thread.getId()})の処理を開始: ${messages.length}件のメールを確認します`);
  
  // 一度に処理するメールを制限
  const maxMessagesToProcess = 3;
  const messagesToProcess = messages.slice(0, maxMessagesToProcess);
  
  for (const message of messagesToProcess) {
    try {
      const attachments = message.getAttachments();
      
      if (attachments.length === 0) {
        logMessage(`メール(${message.getId()})には添付ファイルがありません`);
        continue;
      }
      
      logMessage(`メール(${message.getId()})の添付ファイル数: ${attachments.length}`);
      
      let processedAnyAttachment = false;
      
      for (const attachment of attachments) {
        try {
          const fileName = attachment.getName();
          
          // HTMLファイルのみを処理
          if (fileName.toLowerCase().endsWith('.html')) {
            logMessage(`メール(${message.getId()})の添付HTML「${fileName}」を処理します`);
            
            // 添付ファイルの内容を取得
            const htmlContent = attachment.getDataAsString();
            
            // 大きなHTMLファイルの場合は処理をスキップ
            const MAX_HTML_SIZE = 1000000; // 約1MBの制限
            if (htmlContent.length > MAX_HTML_SIZE) {
              logMessage(`添付ファイル「${fileName}」がサイズ制限(${MAX_HTML_SIZE}文字)を超えています。スキップします。`, true);
              continue;
            }
            
            const bookData = _parseKindleHighlights(htmlContent);
            if (bookData && bookData.highlights.length > 0) {
              _sendToNotion(bookData, config);
              processedAnyAttachment = true;
              logMessage(`添付ファイル「${fileName}」を正常に処理しました`);
            } else {
              // ハイライト抽出に失敗した場合、デバッグ用にHTMLサンプルを保存
              _saveHtmlSample(htmlContent, message.getId());
              logMessage(`メール(${message.getId()})の添付ファイルからハイライトを抽出できませんでした`, true);
            }
          }
        } catch (error) {
          logMessage(`添付ファイル処理エラー: ${error.message}`, true);
        }
      }
      
      // 処理完了したメールを削除（何かしらの添付ファイルを処理した場合のみ）
      if (processedAnyAttachment) {
        message.moveToTrash();
        logMessage(`メール(${message.getId()})を正常に処理しゴミ箱に移動しました`);
      }
      
    } catch (error) {
      logMessage(`メール処理エラー (ID: ${message.getId()}): ${error.message}`, true);
    }
  }
}

/**
 * HTMLからKindleハイライト情報を抽出する
 */
function _parseKindleHighlights(htmlContent: string): BookData {
  try {
    // デバッグ情報を記録
    logMessage(`HTMLコンテンツサイズ: ${htmlContent.length} 文字`);
    
    // 書籍タイトルを取得（複数のパターンを試行）
    let title = '不明なタイトル';
    const titlePatterns = [
      /<div class="bookTitle">\s*(.*?)\s*<\/div>/s,
      /<h2 class="bookTitle">\s*(.*?)\s*<\/h2>/s,
      /<h1>\s*(.*?)\s*<\/h1>/s
    ];
    
    for (const pattern of titlePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        title = match[1].trim();
        break;
      }
    }
    
    // 著者名を取得（複数のパターンを試行）
    let authors = undefined;
    const authorPatterns = [
      /<div class="authors">\s*(.*?)\s*<\/div>/s,
      /<h3 class="authors">\s*(.*?)\s*<\/h3>/s,
      /<div class="author">\s*(.*?)\s*<\/div>/s
    ];
    
    for (const pattern of authorPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        authors = match[1].trim();
        break;
      }
    }
    
    // ハイライトデータを格納する配列
    const highlights: KindleHighlight[] = [];
    
    // 複数のセクション抽出パターンを試す
    _extractHighlightsUsingMultiplePatterns(htmlContent, highlights);
    
    // ハイライトが1つも抽出できなかった場合は、より汎用的な方法を試す
    if (highlights.length === 0) {
      _extractHighlightsFallbackMethod(htmlContent, highlights);
    }
    
    // デバッグ情報
    logMessage(`抽出したハイライト数: ${highlights.length}`);
    
    return {
      title,
      authors,
      highlights
    };
  } catch (error) {
    logMessage(`HTMLパース中にエラーが発生しました: ${error.message}`, true);
    // 最低限の情報を返す
    return {
      title: '解析エラー',
      highlights: []
    };
  }
}

/**
 * 複数のパターンを使用してハイライトを抽出する
 */
function _extractHighlightsUsingMultiplePatterns(htmlContent: string, highlights: KindleHighlight[]): void {
  // パターン1: セクションヘッダーで分割
  try {
    const sections = htmlContent.split(/<div class="sectionHeading">/);
    
    // 最初の部分はセクションヘッダーがない可能性があるので特別処理
    if (sections.length > 1) {
      // 2番目の要素から処理（最初はセクション前の内容）
      for (let i = 1; i < sections.length; i++) {
        const sectionParts = sections[i].split('</div>');
        if (sectionParts.length > 0) {
          const sectionName = sectionParts[0].trim();
          const sectionContent = sectionParts.slice(1).join('</div>');
          _extractHighlightsFromSection(sectionContent, sectionName, highlights);
        }
      }
    } else {
      // セクションがない場合は全体を処理
      _extractHighlightsFromSection(htmlContent, '', highlights);
    }
  } catch (error) {
    logMessage(`パターン1でのハイライト抽出エラー: ${error.message}`, true);
  }
}

/**
 * フォールバック方法でハイライトを抽出する
 */
function _extractHighlightsFallbackMethod(htmlContent: string, highlights: KindleHighlight[]): void {
  try {
    // パターン2: noteHeading & noteText 直接検索
    const noteRegex = /<div[^>]*class="noteHeading"[^>]*>(.*?)<\/div>\s*<div[^>]*class="noteText"[^>]*>(.*?)<\/div>/gs;
    let noteMatch;
    
    while ((noteMatch = noteRegex.exec(htmlContent)) !== null) {
      const heading = noteMatch[1].trim();
      const text = noteMatch[2].trim();
      
      highlights.push({
        section: '',
        heading: _stripHtml(heading),
        text: text,
        highlightColor: 'default'
      });
    }
    
    // パターン3: さらに柔軟なパターン (div内テキスト)
    if (highlights.length === 0) {
      const divRegex = /<div[^>]*>(.*?)<\/div>/gs;
      let divMatches = [];
      let divMatch;
      
      while ((divMatch = divRegex.exec(htmlContent)) !== null) {
        divMatches.push(divMatch[1].trim());
      }
      
      // 連続する2つのdivをハイライトとして解釈
      for (let i = 0; i < divMatches.length - 1; i++) {
        const heading = divMatches[i];
        const text = divMatches[i + 1];
        
        // 有効な文字列のみをハイライトとして追加
        if (heading.length > 5 && text.length > 10 && 
            !heading.includes('<') && !text.includes('<')) {
          highlights.push({
            section: '',
            heading: heading,
            text: text,
            highlightColor: 'default'
          });
          i++; // 次のペアを処理
        }
      }
    }
    
    logMessage(`フォールバック抽出結果: ${highlights.length}件のハイライト`);
  } catch (error) {
    logMessage(`フォールバックでのハイライト抽出エラー: ${error.message}`, true);
  }
}

/**
 * セクション内のハイライトを抽出する補助関数
 */
function _extractHighlightsFromSection(sectionContent: string, sectionName: string, highlights: KindleHighlight[]): void {
  try {
    // 複数のパターンを試行
    const extractionMethods = [
      // パターン1: div class="noteHeading" で分割
      () => {
        const parts = sectionContent.split('<div class="noteHeading">');
        // 最初の部分はヘッダーがないので飛ばす
        for (let i = 1; i < parts.length; i++) {
          const headingParts = parts[i].split('</div>');
          if (headingParts.length > 1) {
            const heading = headingParts[0].trim();
            
            // noteTextを探す
            const textMatch = headingParts.slice(1).join('</div>').match(/<div class="noteText">(.*?)<\/div>/s);
            if (textMatch && textMatch[1]) {
              const text = textMatch[1].trim();
              
              // ハイライトの色を取得
              let highlightColor = 'default';
              const colorMatch = heading.match(/<span class="highlight_(.*?)">.*?<\/span>/);
              
              if (colorMatch) {
                highlightColor = colorMatch[1].trim();
              }
              
              highlights.push({
                section: sectionName,
                heading: _stripHtml(heading),
                text: text,
                highlightColor: highlightColor
              });
            }
          }
        }
      },
      
      // パターン2: 正規表現でペアを直接検索
      () => {
        const noteRegex = /<div class="noteHeading">(.*?)<\/div>\s*<div class="noteText">(.*?)<\/div>/gs;
        let noteMatch;
        
        while ((noteMatch = noteRegex.exec(sectionContent)) !== null) {
          const heading = noteMatch[1].trim();
          const text = noteMatch[2].trim();
          
          // ハイライトの色を取得
          let highlightColor = 'default';
          const colorMatch = heading.match(/<span class="highlight_(.*?)">.*?<\/span>/);
          
          if (colorMatch) {
            highlightColor = colorMatch[1].trim();
          }
          
          highlights.push({
            section: sectionName,
            heading: _stripHtml(heading),
            text: text,
            highlightColor: highlightColor
          });
        }
      }
    ];
    
    // 各抽出メソッドを試す
    for (const method of extractionMethods) {
      const initialCount = highlights.length;
      method();
      
      // ハイライトが抽出できたら終了
      if (highlights.length > initialCount) {
        break;
      }
    }
  } catch (error) {
    logMessage(`セクション処理エラー: ${(error as Error).message}`, true);
  }
}

/**
 * HTMLタグを取り除く補助関数
 */
function _stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * NotionにBookDataを送信する関数
 */
function _sendToNotion(bookData: BookData, config: Config) {
  try {
    // Notionページを作成
    const pageId = _createNotionPage(bookData, config);
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
function _createNotionPage(bookData: BookData, config: Config): string {
  // ページプロパティを設定
  const properties = {
    'Name': {
      title: [
        {
          text: {
            content: bookData.title
          }
        }
      ]
    }
  };
  
  if (bookData.authors) {
    properties['Authors'] = {
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
  const sections = _organizeHighlightsBySection(bookData.highlights);
  
  // セクションごとにブロックを追加
  for (const [sectionName, sectionHighlights] of Object.entries(sections)) {
    // セクションヘッダーを追加
    if (sectionName) {
      _appendBlocksToNotionPage(
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
        const backgroundColor = _mapHighlightColor(highlight.highlightColor);
        
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
      _appendBlocksToNotionPage(pageId, batchBlocks, config);
      
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
function _organizeHighlightsBySection(highlights: KindleHighlight[]): Record<string, KindleHighlight[]> {
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
function _appendBlocksToNotionPage(pageId: string, blocks: any[], config: Config): void {
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
function _mapHighlightColor(color?: string): string {
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

/**
 * 定期実行トリガーを設定する
 */
function _setupTrigger() {
  // 既存のトリガーをすべて削除
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'processKindleHighlights') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // 新しいトリガーを設定（1時間ごとに実行）
  ScriptApp.newTrigger('processKindleHighlights')
    .timeBased()
    .everyHours(1)
    .create();
  
  logMessage('トリガーを設定しました: processKindleHighlights 関数が1時間ごとに実行されます');
}


global.processKindleHighlights = processKindleHighlights;
global.setupTrigger = _setupTrigger;

// メンテナンス用関数を追加
function clearProcessedEmails() {
  const config = getConfig();
  const threads = GmailApp.search(`label:${config.gmailLabel}`);
  for (const thread of threads) {
    thread.moveToTrash();
  }
  logMessage(`${threads.length}件のメールをゴミ箱に移動しました`);
}

global.clearProcessedEmails = clearProcessedEmails;

/**
 * 問題のファイルの一部をデバッグ用にスクリプトプロパティに保存
 */
function _saveHtmlSample(htmlContent: string, messageId: string): void {
  try {
    // ファイルサイズが大きすぎる場合は先頭の一部だけを保存
    const MAX_SAMPLE_SIZE = 10000;
    const sample = htmlContent.length > MAX_SAMPLE_SIZE 
      ? htmlContent.substring(0, MAX_SAMPLE_SIZE) + "..."
      : htmlContent;
    
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty('DEBUG_HTML_SAMPLE', sample);
    properties.setProperty('DEBUG_MESSAGE_ID', messageId);
    logMessage(`デバッグ用にHTMLサンプルを保存しました (メールID: ${messageId})`);
  } catch (error) {
    logMessage(`HTMLサンプル保存エラー: ${error.message}`, true);
  }
}
