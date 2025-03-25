// GASアプリケーションのメインファイル
// Gmailをポーリングし、特定のラベルが付いたメールを取得して処理する

import { Config } from './types';
import * as notion from './notion';
import * as kindleParser from './kindle-parser';

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
            
            const bookData = kindleParser.parseKindleHighlights(htmlContent);
            if (bookData && bookData.highlights.length > 0) {
              notion.sendToNotion(bookData, config);
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

// メンテナンス用関数を追加
function clearProcessedEmails() {
  const config = getConfig();
  const threads = GmailApp.search(`label:${config.gmailLabel}`);
  for (const thread of threads) {
    thread.moveToTrash();
  }
  logMessage(`${threads.length}件のメールをゴミ箱に移動しました`);
}


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

global.processKindleHighlights = processKindleHighlights;
global.setupTrigger = _setupTrigger;
global.clearProcessedEmails = clearProcessedEmails;

