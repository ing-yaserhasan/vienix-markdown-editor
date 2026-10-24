const marked = require('../assets/vendor/marked.min.js');
marked.setOptions({ gfm: true, breaks: true });

const md = '<!-- vienix-tbl:border=2,rounded=true -->\n| H1 | H2 |\n| :--- | :--- |\n| 1 | 2 |\n';
let html = marked.parse(md);

// Same regex as in renderMarkdown
html = html.replace(/<!--\s*vienix-tbl:border=(\d+),rounded=(true|false)\s*-->\s*(<table)/gi,
  function(full, border, rounded, tblTag) {
    return '<!-- vienix-tbl:border=' + border + ',rounded=' + rounded + ' -->' + tblTag + ' data-border="' + border + '" data-rounded="' + rounded + '"';
  }
);

console.log('Has data-border:', html.includes('data-border="2"') ? 'YES ✓' : 'NO ✗');
console.log('Has data-rounded:', html.includes('data-rounded="true"') ? 'YES ✓' : 'NO ✗');
console.log('');
console.log('Output snippet:');
console.log(html.substring(0, 250));
