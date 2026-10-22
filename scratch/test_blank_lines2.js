const { marked } = require('../assets/vendor/marked.min.js');

function preserveBlankLines(markdown) {
  if (!markdown || typeof markdown !== 'string') return markdown;

  // 1. Protect code blocks (fenced code blocks ``` or ~~~)
  const codeBlocks = [];
  let text = markdown.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    codeBlocks.push(match);
    return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
  });

  // 2. Protect Math blocks ($$ ... $$)
  const mathBlocks = [];
  text = text.replace(/(\$\$[\s\S]*?\$\$)/g, (match) => {
    mathBlocks.push(match);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // Normalize line breaks
  text = text.replace(/\r\n/g, '\n');

  // Normalize lines with only whitespace to empty lines
  text = text.replace(/^[ \t]+$/gm, '');

  // 3. Handle sequences of multiple blank lines:
  // In Markdown, \n\n separates two blocks (1 normal paragraph break).
  // Any extra \n beyond 2 represents an intentional blank line that the user created by pressing Enter!
  text = text.replace(/\n{3,}/g, (match) => {
    const extraCount = match.length - 2;
    const blankLines = [];
    for (let i = 0; i < extraCount; i++) {
      blankLines.push('<div class="md-blank-line">&nbsp;</div>');
    }
    return '\n\n' + blankLines.join('\n\n') + '\n\n';
  });

  // 4. Handle lists where an empty line separates list items:
  // e.g. "1. Item 1\n\n2. Item 2" or "- Item 1\n\n- Item 2"
  const listItemPattern = /^(\s*(?:[*+-]|\d+[.)])\s+.*)\n\n(\s*(?:[*+-]|\d+[.)])\s+.*)$/gm;
  text = text.replace(listItemPattern, (match, p1, p2) => {
    return `${p1}\n\n<div class="md-blank-line">&nbsp;</div>\n\n${p2}`;
  });

  // 5. Restore Math blocks & Code blocks
  text = text.replace(/%%MATH_BLOCK_(\d+)%%/g, (_, i) => mathBlocks[i]);
  text = text.replace(/%%CODE_BLOCK_(\d+)%%/g, (_, i) => codeBlocks[i]);

  return text;
}

module.exports = { preserveBlankLines };

const table = '| A | B |\n|---|---|\n| 1 | 2 |\n\n\n\n| 3 | 4 |\n|---|---|\n| 5 | 6 |';
console.log('--- TABLE OUTPUT ---');
console.log(marked.parse(preserveBlankLines(table)));
