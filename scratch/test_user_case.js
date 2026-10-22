const { marked } = require('../assets/vendor/marked.min.js');

function preserveBlankLines(markdown) {
  if (!markdown || typeof markdown !== 'string') return markdown;

  // 1. Protect code blocks
  const codeBlocks = [];
  let text = markdown.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    codeBlocks.push(match);
    return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
  });

  // 2. Protect Math blocks
  const mathBlocks = [];
  text = text.replace(/(\$\$[\s\S]*?\$\$)/g, (match) => {
    mathBlocks.push(match);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // Normalize line breaks
  text = text.replace(/\r\n/g, '\n');

  // Normalize lines with only whitespace to empty lines
  text = text.replace(/^[ \t]+$/gm, '');

  // 3. Handle multiple consecutive blank lines:
  text = text.replace(/\n{3,}/g, (match) => {
    const extraCount = match.length - 2;
    const blankLines = [];
    for (let i = 0; i < extraCount; i++) {
      blankLines.push('<p class="md-blank-line">&nbsp;</p>');
    }
    return '\n\n' + blankLines.join('\n\n') + '\n\n';
  });

  // 4. Handle lists where an empty line separates list items:
  const listItemPattern = /^(\s*(?:[*+-]|\d+[.)])\s+.*)\n\n(\s*(?:[*+-]|\d+[.)])\s+.*)$/gm;
  let prev;
  do {
    prev = text;
    text = text.replace(listItemPattern, (match, p1, p2) => {
      return `${p1}\n\n<p class="md-blank-line">&nbsp;</p>\n\n${p2}`;
    });
  } while (text !== prev);

  // 5. Restore blocks
  text = text.replace(/%%MATH_BLOCK_(\d+)%%/g, (_, i) => mathBlocks[i]);
  text = text.replace(/%%CODE_BLOCK_(\d+)%%/g, (_, i) => codeBlocks[i]);

  return text;
}

const userText = `#### 2. حل المعالجة التلقائية برمجياً في Vienix (إذا كنت تريده افتراضياً دون كتابة <br>)
إذا كنت تفضل ألا تضطر لكتابة <br> بيدك كل مرة، وتريد من المحرر **تلقائياً** بمجرد أن يجد سطرين فارغين بين عناصر القوائم أن يعكسهما كسطر فارغ في المعاينة:




يمكننا إضافة معالج مسبق ذكي (Safe Pre-processor) في كود rtlmd.js بحيث:
- يستثني كتل الأكواد ( \`\`\` ) وجداول الماركداون حتى لا تتأثر.
- إذا وجد سطراً فارغاً بين بنود القوائم، يقوم بإدراج الفاصل المطلوب تلقائياً في شاشة العرض.`;

module.exports = { preserveBlankLines };

