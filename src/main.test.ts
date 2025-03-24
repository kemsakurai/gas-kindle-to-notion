import { test, expect, describe } from '@jest/globals';

test('hello world!', () => {
    expect(1 + 1).toBe(2);
});
// Define required interfaces
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

describe('Kindle Highlight Parsing', () => {
    // Test title extraction patterns
    test('extracts book title using different patterns', () => {
        const titlePatterns = [
            /<div class="bookTitle">\s*(.*?)\s*<\/div>/s,
            /<h2 class="bookTitle">\s*(.*?)\s*<\/h2>/s,
            /<h1>\s*(.*?)\s*<\/h1>/s
        ];

        const html1 = '<div class="bookTitle">The Great Book</div>';
        const html2 = '<h2 class="bookTitle">Another Book</h2>';
        const html3 = '<h1>Simple Title</h1>';
        
        expect(html1.match(titlePatterns[0])?.[1]).toBe('The Great Book');
        expect(html2.match(titlePatterns[1])?.[1]).toBe('Another Book');
        expect(html3.match(titlePatterns[2])?.[1]).toBe('Simple Title');
    });

    // Test author extraction patterns
    test('extracts author using different patterns', () => {
        const authorPatterns = [
            /<div class="authors">\s*(.*?)\s*<\/div>/s,
            /<h3 class="authors">\s*(.*?)\s*<\/h3>/s,
            /<div class="author">\s*(.*?)\s*<\/div>/s
        ];

        const html1 = '<div class="authors">John Doe</div>';
        const html2 = '<h3 class="authors">Jane Smith</h3>';
        const html3 = '<div class="author">Anonymous</div>';
        
        expect(html1.match(authorPatterns[0])?.[1]).toBe('John Doe');
        expect(html2.match(authorPatterns[1])?.[1]).toBe('Jane Smith');
        expect(html3.match(authorPatterns[2])?.[1]).toBe('Anonymous');
    });

    // Test highlight extraction using noteHeading/noteText pattern
    test('extracts highlights with noteHeading and noteText pattern', () => {
        const html = `
            <div class="noteHeading">Chapter 1, Location 123</div>
            <div class="noteText">This is the first highlight</div>
            <div class="noteHeading">Chapter 2, Location 456</div>
            <div class="noteText">This is the second highlight</div>
        `;
        
        const noteRegex = /<div[^>]*class="noteHeading"[^>]*>(.*?)<\/div>\s*<div[^>]*class="noteText"[^>]*>(.*?)<\/div>/gs;
        const highlights = [];
        let match;
        
        while ((match = noteRegex.exec(html)) !== null) {
            highlights.push({
                heading: match[1].trim(),
                text: match[2].trim()
            });
        }
        
        expect(highlights.length).toBe(2);
        expect(highlights[0].heading).toBe('Chapter 1, Location 123');
        expect(highlights[0].text).toBe('This is the first highlight');
    });

    // Test section extraction
    test('extracts sections and their highlights', () => {
        const html = `
            <div class="sectionHeading">Section 1</div>
            <div class="noteHeading">Note 1.1</div>
            <div class="noteText">Text 1.1</div>
            <div class="sectionHeading">Section 2</div>
            <div class="noteHeading">Note 2.1</div>
            <div class="noteText">Text 2.1</div>
        `;
        
        const sections = html.split(/<div class="sectionHeading">/);
        const processedSections = [];
        
        for (let i = 1; i < sections.length; i++) {
            const sectionParts = sections[i].split('</div>');
            if (sectionParts.length > 0) {
                const sectionName = sectionParts[0].trim();
                const sectionContent = sectionParts.slice(1).join('</div>');
                processedSections.push({
                    name: sectionName,
                    content: sectionContent
                });
            }
        }
        
        expect(processedSections.length).toBe(2);
        expect(processedSections[0].name).toBe('Section 1');
        expect(processedSections[1].name).toBe('Section 2');
    });

    // Test highlight color extraction
    test('extracts highlight colors', () => {
        const heading = '<span class="highlight_yellow">Chapter 1</span>, Location 123';
        const colorMatch = heading.match(/<span class="highlight_(.*?)">.*?<\/span>/);
        
        expect(colorMatch?.[1]).toBe('yellow');
    });

    // Test HTML stripping function
    test('strips HTML tags from text', () => {
        const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');
        
        expect(stripHtml('<div>Simple text</div>')).toBe('Simple text');
        expect(stripHtml('<span style="color:red">Red text</span>')).toBe('Red text');
    });
    // Test section extraction
    test('extracts sections and their highlights', () => {
        const html = `
            <div class="sectionHeading">Section 1</div>
            <div class="noteHeading">Note 1.1</div>
            <div class="noteText">Text 1.1</div>
            <div class="sectionHeading">Section 2</div>
            <div class="noteHeading">Note 2.1</div>
            <div class="noteText">Text 2.1</div>
        `;
        
        const sections = html.split(/<div class="sectionHeading">/);
        const processedSections = [];
        
        for (let i = 1; i < sections.length; i++) {
            const sectionParts = sections[i].split('</div>');
            if (sectionParts.length > 0) {
                const sectionName = sectionParts[0].trim();
                const sectionContent = sectionParts.slice(1).join('</div>');
                processedSections.push({
                    name: sectionName,
                    content: sectionContent
                });
            }
        }
        
        expect(processedSections.length).toBe(2);
        expect(processedSections[0].name).toBe('Section 1');
        expect(processedSections[1].name).toBe('Section 2');
    });

    // Test fallback extraction method for highlights
    test('extracts highlights using fallback method', () => {
        const html = `
            <div>Chapter 1, Location 123</div>
            <div>This is the first highlight text</div>
            <div>Chapter 2, Location 456</div>
            <div>This is the second highlight text</div>
        `;
        
        const highlights: KindleHighlight[] = [];
        const divRegex = /<div[^>]*>(.*?)<\/div>/gs;
        let divMatches: string[] = [];
        let divMatch;
        
        while ((divMatch = divRegex.exec(html)) !== null) {
            divMatches.push(divMatch[1].trim());
        }
        
        for (let i = 0; i < divMatches.length - 1; i++) {
            const heading = divMatches[i];
            const text = divMatches[i + 1];
            
            if (heading.length > 5 && text.length > 10 && 
                !heading.includes('<') && !text.includes('<')) {
                highlights.push({
                    section: '',
                    heading: heading,
                    text: text,
                    highlightColor: 'default'
                });
                i++;
            }
        }
        
        expect(highlights.length).toBe(2);
        expect(highlights[0].heading).toBe('Chapter 1, Location 123');
        expect(highlights[0].text).toBe('This is the first highlight text');
    });

    // Test highlight color mapping function
    test('maps highlight colors to Notion format', () => {
        const mapHighlightColor = (color?: string): string => {
            switch (color) {
                case 'yellow': return 'yellow_background';
                case 'blue': return 'blue_background';
                case 'pink': return 'pink_background';
                case 'orange': return 'orange_background';
                default: return 'default';
            }
        };
        
        expect(mapHighlightColor('yellow')).toBe('yellow_background');
        expect(mapHighlightColor('blue')).toBe('blue_background');
        expect(mapHighlightColor('pink')).toBe('pink_background');
        expect(mapHighlightColor('orange')).toBe('orange_background');
        expect(mapHighlightColor('unknown')).toBe('default');
        expect(mapHighlightColor()).toBe('default');
    });

    // Test complete HTML parsing with a realistic example
    test('parses a complete Kindle highlight HTML document', () => {
        const htmlContent = `
            <!DOCTYPE html PUBLIC
"-//W3C//DTD XHTML 1.0 Strict//EN"
"XHTML1-s.dtd" >
<html xmlns="http://www.w3.org/TR/1999/REC-html-in-xml" xml:lang="en" lang="en">
    <head>
    <meta charset="UTF-8">
    <style>
        .bodyContainer {
            font-family: Arial, Helvetica, sans-serif;
            text-align: center;
            padding-left: 32px;
            padding-right: 32px;
        }
        
        .notebookFor {
            font-size: 18px;
            font-weight: 700;
            text-align: center;
            color: rgb(119, 119, 119);
            margin: 24px 0px 0px;
            padding: 0px;
        }
        
        .bookTitle {
            font-size: 24px;
            font-weight: 700;
            text-align: center;
            color: #333333;
            margin-top: 22px;
            padding: 0px;
        }
        
        .authors {
            font-size: 18px;
            font-weight: 700;
            text-align: center;
            color: rgb(119, 119, 119);
            margin-top: 22px;
            margin-bottom: 24px;
            padding: 0px;
        }
    
        .citation {
            font-size: 18px;
            font-weight: 500;
            text-align: center;
            color: #333333;
            margin-top: 22px;
            margin-bottom: 24px;
            padding: 0px;
        }
    
        .sectionHeading {
            font-size: 24px;
            font-weight: 700;
            text-align: left;
            color: #333333;
            margin-top: 24px;
            padding: 0px;
        }
        
        .noteHeading {
            font-size: 18px;
            font-weight: 700;
            text-align: left;
            color: #333333;
            margin-top: 20px;
            padding: 0px;
        }
        
        .noteText {
            font-size: 18px;
            font-weight: 500;
            text-align: left;
            color: #333333;
            margin: 2px 0px 0px;
            padding: 0px;
        }
        
        .highlight_blue {
            color: rgb(178, 205, 251);
        }
        
        .highlight_orange {
            color: #ffd7ae;
        }
        
        .highlight_pink {
            color: rgb(255, 191, 206);
        }
        
        .highlight_yellow {
            color: rgb(247, 206, 0);
        }
        
        .notebookGraphic {
            margin-top: 10px;
            text-align: left;
        }
        
        .notebookGraphic img {
            -o-box-shadow:      0px 0px 5px #888;
            -icab-box-shadow:   0px 0px 5px #888;
            -khtml-box-shadow:  0px 0px 5px #888;
            -moz-box-shadow:    0px 0px 5px #888;
            -webkit-box-shadow: 0px 0px 5px #888;
            box-shadow:         0px 0px 5px #888; 
            max-width: 100%;
            height: auto;
        }
        
        hr {
            border: 0px none;
            height: 1px;
            background: none repeat scroll 0% 0% rgb(221, 221, 221);
        }
        </style>
        <script>
            </script>
    </head>
    <body>
        <div class="bodyContainer">
            <div class="notebookFor">
                ノートブックのエクスポート
            </div>
            <div class="bookTitle">
                Effective DevOps
            </div>
            <div class="authors">
                Jennifer Davis、Ryn Daniels　著、吉羽 龍太郎　監訳、長尾 高弘　訳
            </div>
            <div class="citation">
                
            </div>
            <hr />
            <div class="sectionHeading">
    3章　devopsの歴史
</div><div class="noteHeading">
    ハイライト(<span class="highlight_pink">ピンク</span>) - 3.7　ソフトウェア開発手法の発展 > ページ23 ·位置607
</div>
<div class="noteText">
    アジャイルソフトウェア開発宣言の起草者のひとりでソフトウェア開発者のアリスター ・コー バーンは、成功しているチームについて 10年間研究を続けていた。そして、 2004年に、研究結果 にもとづいて、小さなチームのためのソフトウェア開発手法をまとめた 『Crystal Clear†5』（クリ スタルクリア）を発表した。同書では、成功しているチームに共通する性質として次の 3つをあげ ている。  ●使えるコードを頻繁に届ける。大きなデプロイをたまに行うのではなく、小さなデプロイ を頻繁に行うようにする  ●ふりかえりによる改善。直近の仕事でうまくいったこと、うまくいかなかったことをふり かえり、今後の仕事に活かす  ●開発者間の浸透的なコミュニケーション。開発者たちが同じ部屋にいれば、情報は自然に 流れ出して知らず知らずのうちに伝わる。それを浸透という言葉で表現したもの この運動はソフトウェア開発の世界で数年間続いたあと、影響の範囲を広げていった。同じ頃、 
</div><div class="sectionHeading">
    4章　基本的な用語と概念
</div><div class="noteHeading">
    ハイライト(<span class="highlight_pink">ピンク</span>) - 4.1　ソフトウェア開発手法 > ページ29 ·位置660
</div>
<div class="noteText">
    チーム の仕事がその手法のプロセスや目標に合わないときには怒りや不満を生むことにもなる。しかし、 さまざまな手法がどのように機能し、どのような効果が得られるかを理解すれば、この摩擦を理解 し、緩和するために役立つ。 
</div><div class="noteHeading">
    ハイライト(<span class="highlight_pink">ピンク</span>) - 4.3　システム手法 > ページ33 ·位置690
</div>
        </div>
    </body>
</html>
        `;
        
        // Extract book title
        let title = 'Unknown Title';
        const titleMatch = htmlContent.match(/<div class="bookTitle">\s*(.*?)\s*<\/div>/s);
        if (titleMatch) title = titleMatch[1].trim();
        
        // Extract author
        let authors = undefined;
        const authorMatch = htmlContent.match(/<div class="authors">\s*(.*?)\s*<\/div>/s);
        if (authorMatch) authors = authorMatch[1].trim();
        
        // Extract highlights
        const highlights: KindleHighlight[] = [];
        const sections = htmlContent.split(/<div class="sectionHeading">/);
        
        for (let i = 1; i < sections.length; i++) {
            const sectionParts = sections[i].split('</div>');
            if (sectionParts.length > 0) {
                const sectionName = sectionParts[0].trim();
                const sectionContent = sectionParts.slice(1).join('</div>');
                
                // Extract highlights from section
                const noteRegex = /<div class="noteHeading">(.*?)<\/div>\s*<div class="noteText">(.*?)<\/div>/gs;
                let noteMatch;
                
                while ((noteMatch = noteRegex.exec(sectionContent)) !== null) {
                    const heading = noteMatch[1].trim();
                    const text = noteMatch[2].trim();
                    
                    // Extract highlight color
                    let highlightColor = 'default';
                    const colorMatch = heading.match(/<span class="highlight_(.*?)">.*?<\/span>/);
                    if (colorMatch) highlightColor = colorMatch[1].trim();
                    
                    highlights.push({
                        section: sectionName,
                        heading: heading.replace(/<[^>]*>/g, ''),
                        text: text,
                        highlightColor: highlightColor
                    });
                }
            }
        }
        
        const bookData: BookData = { title, authors, highlights };
        
        expect(bookData.title).toBe('Effective DevOps');
        expect(bookData.authors).toBe('Jennifer Davis、Ryn Daniels　著、吉羽 龍太郎　監訳、長尾 高弘　訳');
        expect(bookData.highlights.length).toBe(2);
        expect(bookData.highlights[0].section).toBe('3章　devopsの歴史');
        expect(bookData.highlights[0].highlightColor).toBe('pink');
        expect(bookData.highlights[1].highlightColor).toBe('pink');
        expect(bookData.highlights[2].section).toBe('4章　基本的な用語と概念');
        expect(bookData.highlights[2].highlightColor).toBe('pink');
    });
});
