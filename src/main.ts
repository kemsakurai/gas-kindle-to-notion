// GASアプリケーションのメインファイル
// Gmailをポーリングし、特定のラベルが付いたメールを取得して処理する

import * as kindleParser from './kindle-parser';
import * as notion from './notion';
import type { Config, ProcessingResult } from './types';

/**
 * 設定を取得する
 */
function getConfig(): Config {
  const properties = PropertiesService.getScriptProperties();
  const duplicateMode = properties.getProperty('NOTION_DUPLICATE_MODE');
  return {
    notionToken: properties.getProperty('NOTION_TOKEN') || '',
    notionDatabaseId: properties.getProperty('NOTION_DATABASE_ID') || '',
    gmailLabel: properties.getProperty('GMAIL_LABEL') || 'kindle-highlights',
    notionTitleProperty:
      properties.getProperty('NOTION_TITLE_PROPERTY') || 'Name',
    notionAuthorProperty:
      properties.getProperty('NOTION_AUTHOR_PROPERTY') || 'Authors',
    notionDuplicateMode: duplicateMode === 'merge' ? 'merge' : 'skip',
    gmailMaxThreads: Number(properties.getProperty('GMAIL_MAX_THREADS')) || 50,
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
function processKindleHighlights(): ProcessingResult[] {
  const results: ProcessingResult[] = [];

  try {
    const config = getConfig();
    logMessage('Kindleハイライト処理を開始します');

    const threads = GmailApp.search(
      `label:${config.gmailLabel}`,
      0,
      config.gmailMaxThreads,
    );
    logMessage(
      `ラベル「${config.gmailLabel}」が付いたメールスレッドが${threads.length}件見つかりました`,
    );

    if (threads.length === 0) {
      logMessage('処理するメールがありません');
      return results;
    }

    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 5 * 60 * 1000;

    for (const thread of threads) {
      try {
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          logMessage('実行時間制限に近づいたため、処理を中断します');
          break;
        }

        const threadResults = processThread(thread, config);
        results.push(...threadResults);

        Utilities.sleep(1000);
      } catch (error) {
        logMessage(
          `スレッド処理エラー (ID: ${thread.getId()}): ${error.message}`,
          true,
        );
      }
    }

    logMessage(`処理が正常に完了しました（${results.length}件処理）`);
  } catch (error) {
    logMessage(`致命的なエラーが発生しました: ${error.message}`, true);
  }

  return results;
}

/**
 * メールスレッド処理関数
 */
function processThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  config: Config,
): ProcessingResult[] {
  const results: ProcessingResult[] = [];
  const messages = thread.getMessages();
  logMessage(
    `スレッド(${thread.getId()})の処理を開始: ${messages.length}件のメールを確認します`,
  );

  for (const message of messages) {
    try {
      const attachments = message.getAttachments();

      if (attachments.length === 0) {
        logMessage(`メール(${message.getId()})には添付ファイルがありません`);
        continue;
      }

      logMessage(
        `メール(${message.getId()})の添付ファイル数: ${attachments.length}`,
      );

      let processedAnyAttachment = false;

      for (const attachment of attachments) {
        try {
          const fileName = attachment.getName();

          if (fileName.toLowerCase().endsWith('.html')) {
            logMessage(
              `メール(${message.getId()})の添付HTML「${fileName}」を処理します`,
            );

            const htmlContent = attachment.getDataAsString();

            const MAX_HTML_SIZE = 1000000;
            if (htmlContent.length > MAX_HTML_SIZE) {
              logMessage(
                `添付ファイル「${fileName}」がサイズ制限(${MAX_HTML_SIZE}文字)を超えています。スキップします。`,
                true,
              );
              results.push({
                timestamp: new Date(),
                title: fileName,
                authors: '',
                highlightCount: 0,
                status: 'エラー',
                notionPageUrl: '',
                errorDetail: `サイズ制限超過(${htmlContent.length}文字)`,
              });
              continue;
            }

            const bookData = kindleParser.parseKindleHighlights(htmlContent);
            if (bookData && bookData.highlights.length > 0) {
              const { pageId, status } = notion.sendToNotion(bookData, config);
              processedAnyAttachment = true;
              results.push({
                timestamp: new Date(),
                title: bookData.title,
                authors: bookData.authors || '',
                highlightCount: bookData.highlights.length,
                status,
                notionPageUrl: `https://notion.so/${pageId.replace(/-/g, '')}`,
                errorDetail: '',
              });
              logMessage(`添付ファイル「${fileName}」を正常に処理しました`);
            } else {
              _saveHtmlSample(htmlContent, message.getId());
              results.push({
                timestamp: new Date(),
                title: bookData?.title || '不明',
                authors: bookData?.authors || '',
                highlightCount: 0,
                status: 'エラー',
                notionPageUrl: '',
                errorDetail: 'ハイライトを抽出できませんでした',
              });
              logMessage(
                `メール(${message.getId()})の添付ファイルからハイライトを抽出できませんでした`,
                true,
              );
            }
          }
        } catch (error) {
          logMessage(`添付ファイル処理エラー: ${error.message}`, true);
          results.push({
            timestamp: new Date(),
            title: '不明',
            authors: '',
            highlightCount: 0,
            status: 'エラー',
            notionPageUrl: '',
            errorDetail: error.message,
          });
        }
      }

      if (processedAnyAttachment) {
        message.moveToTrash();
        logMessage(
          `メール(${message.getId()})を正常に処理しゴミ箱に移動しました`,
        );
      }
    } catch (error) {
      logMessage(
        `メール処理エラー (ID: ${message.getId()}): ${error.message}`,
        true,
      );
    }
  }

  return results;
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

  logMessage(
    'トリガーを設定しました: processKindleHighlights 関数が1時間ごとに実行されます',
  );
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
    const sample =
      htmlContent.length > MAX_SAMPLE_SIZE
        ? `${htmlContent.substring(0, MAX_SAMPLE_SIZE)}...`
        : htmlContent;

    const properties = PropertiesService.getScriptProperties();
    properties.setProperty('DEBUG_HTML_SAMPLE', sample);
    properties.setProperty('DEBUG_MESSAGE_ID', messageId);
    logMessage(
      `デバッグ用にHTMLサンプルを保存しました (メールID: ${messageId})`,
    );
  } catch (error) {
    logMessage(`HTMLサンプル保存エラー: ${error.message}`, true);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: GAS requires global function registration via esbuild-gas-plugin
declare const global: Record<string, any>;

global.processKindleHighlights = processKindleHighlights;
global.setupTrigger = _setupTrigger;
global.clearProcessedEmails = clearProcessedEmails;
