const { marked } = require('../assets/vendor/marked.min.js');

function test(name, input) {
  console.log('=== ' + name + ' ===');
  console.log('INPUT:\n' + JSON.stringify(input));
  const output = marked.parse(input);
  console.log('OUTPUT:\n' + output);
}

test('Test 1: Normal paragraph break (1 blank line)', 'Paragraph 1\n\nParagraph 2');
test('Test 2: Multiple blank lines (3 blank lines)', 'Paragraph 1\n\n\n\n\nParagraph 2');
test('Test 3: List with 1 blank line', '1. Item 1\n\n2. Item 2');
test('Test 4: List with 3 blank lines', '1. Item 1\n\n\n\n2. Item 2');
