import type { BookData, KindleHighlight } from './types';

/**
 * HTMLからKindleハイライト情報を抽出する
 */
export function parseKindleHighlights(htmlContent: string): BookData {
  const title = extractTitle(htmlContent);
  const authors = extractAuthors(htmlContent);
  const highlights = extractHighlights(htmlContent);

  return { title, authors, highlights };
}

/**
 * 書籍タイトルを抽出する
 */
function extractTitle(html: string): string {
  const match = html.match(/<div class="bookTitle">\s*(.*?)\s*<\/div>/s);
  return match ? match[1].trim() : '不明なタイトル';
}

/**
 * 著者名を抽出する
 */
function extractAuthors(html: string): string | undefined {
  const match = html.match(/<div class="authors">\s*(.*?)\s*<\/div>/s);
  return match ? match[1].trim() : undefined;
}

/**
 * 全ハイライトをセクション付きで抽出する
 */
function extractHighlights(html: string): KindleHighlight[] {
  const highlights: KindleHighlight[] = [];
  const sections = html.split(/<div class="sectionHeading">/);

  // 最初の要素はセクションヘッダーより前の内容なので飛ばす
  for (let i = 1; i < sections.length; i++) {
    const closingDivIndex = sections[i].indexOf('</div>');
    if (closingDivIndex === -1) continue;

    const sectionName = sections[i].substring(0, closingDivIndex).trim();
    const sectionContent = sections[i].substring(closingDivIndex);

    const noteRegex =
      /<div class="noteHeading">(.*?)<\/div>\s*<div class="noteText">(.*?)<\/div>/gs;

    for (const match of sectionContent.matchAll(noteRegex)) {
      const heading = match[1].trim();
      const text = match[2].trim();

      highlights.push({
        section: sectionName,
        heading: stripHtml(heading),
        text,
        highlightColor: extractHighlightColor(heading),
      });
    }
  }

  return highlights;
}

/**
 * ハイライトの色名を抽出する
 */
function extractHighlightColor(heading: string): string {
  const match = heading.match(/<span class="highlight_(.*?)">.*?<\/span>/);
  return match ? match[1].trim() : 'default';
}

/**
 * HTMLタグを除去する
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
