import { KindleHighlight, BookData } from './types';

/**
 * ログ記録関数
 */
function logMessage(message: string, isError: boolean = false): void {
  console.log(`${isError ? 'ERROR' : 'INFO'}: ${message}`);
}

/**
 * HTMLからKindleハイライト情報を抽出する
 */
export function parseKindleHighlights(htmlContent: string): BookData {
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
    extractHighlightsUsingMultiplePatterns(htmlContent, highlights);
    
    // ハイライトが1つも抽出できなかった場合は、より汎用的な方法を試す
    if (highlights.length === 0) {
      extractHighlightsFallbackMethod(htmlContent, highlights);
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
function extractHighlightsUsingMultiplePatterns(htmlContent: string, highlights: KindleHighlight[]): void {
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
          extractHighlightsFromSection(sectionContent, sectionName, highlights);
        }
      }
    } else {
      // セクションがない場合は全体を処理
      extractHighlightsFromSection(htmlContent, '', highlights);
    }
  } catch (error) {
    logMessage(`パターン1でのハイライト抽出エラー: ${error.message}`, true);
  }
}

/**
 * フォールバック方法でハイライトを抽出する
 */
function extractHighlightsFallbackMethod(htmlContent: string, highlights: KindleHighlight[]): void {
  try {
    // パターン2: noteHeading & noteText 直接検索
    const noteRegex = /<div[^>]*class="noteHeading"[^>]*>(.*?)<\/div>\s*<div[^>]*class="noteText"[^>]*>(.*?)<\/div>/gs;
    let noteMatch;
    
    while ((noteMatch = noteRegex.exec(htmlContent)) !== null) {
      const heading = noteMatch[1].trim();
      const text = noteMatch[2].trim();
      
      highlights.push({
        section: '',
        heading: stripHtml(heading),
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
function extractHighlightsFromSection(sectionContent: string, sectionName: string, highlights: KindleHighlight[]): void {
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
                heading: stripHtml(heading),
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
            heading: stripHtml(heading),
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
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
// 既存のコードの最後に追加
const kindleParserModule = { parseKindleHighlights };
export default kindleParserModule;
