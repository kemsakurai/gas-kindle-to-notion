import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseKindleHighlights } from './kindle-parser';

const fixtureHtml = readFileSync(
  resolve(__dirname, '__fixtures__/kindle-export-sample.html'),
  'utf-8',
);

describe('parseKindleHighlights', () => {
  test('書籍タイトルを抽出する', () => {
    const result = parseKindleHighlights(fixtureHtml);
    expect(result.title).toBe('Effective DevOps');
  });

  test('著者名を抽出する', () => {
    const result = parseKindleHighlights(fixtureHtml);
    expect(result.authors).toBe(
      'Jennifer Davis、Ryn Daniels　著、吉羽 龍太郎　監訳、長尾 高弘　訳',
    );
  });

  test('全てのハイライトを抽出する', () => {
    const result = parseKindleHighlights(fixtureHtml);
    expect(result.highlights.length).toBe(3);
  });

  test('セクション名を正しく紐付ける', () => {
    const result = parseKindleHighlights(fixtureHtml);
    expect(result.highlights[0].section).toBe('3章　devopsの歴史');
    expect(result.highlights[1].section).toBe('4章　基本的な用語と概念');
    expect(result.highlights[2].section).toBe('4章　基本的な用語と概念');
  });

  test('ハイライトの色を正しく抽出する', () => {
    const result = parseKindleHighlights(fixtureHtml);
    expect(result.highlights[0].highlightColor).toBe('pink');
    expect(result.highlights[1].highlightColor).toBe('yellow');
    expect(result.highlights[2].highlightColor).toBe('blue');
  });

  test('見出しからHTMLタグが除去されている', () => {
    const result = parseKindleHighlights(fixtureHtml);
    for (const h of result.highlights) {
      expect(h.heading).not.toContain('<');
      expect(h.heading).not.toContain('>');
    }
  });

  test('ハイライト本文が空でない', () => {
    const result = parseKindleHighlights(fixtureHtml);
    for (const h of result.highlights) {
      expect(h.text.length).toBeGreaterThan(0);
    }
  });

  test('空のHTMLではデフォルト値を返す', () => {
    const result = parseKindleHighlights('');
    expect(result.title).toBe('不明なタイトル');
    expect(result.authors).toBeUndefined();
    expect(result.highlights).toEqual([]);
  });

  test('ハイライトのないHTMLではhighlightsが空配列', () => {
    const html = '<div class="bookTitle">Test Book</div>';
    const result = parseKindleHighlights(html);
    expect(result.title).toBe('Test Book');
    expect(result.highlights).toEqual([]);
  });

  test('著者のないHTMLではauthorsがundefined', () => {
    const html =
      '<div class="bookTitle">No Author Book</div><div class="sectionHeading">Sec</div>';
    const result = parseKindleHighlights(html);
    expect(result.title).toBe('No Author Book');
    expect(result.authors).toBeUndefined();
  });
});
