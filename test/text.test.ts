import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksLikeHtml, normalizeWhitespace, splitSentences } from '../src/text.ts';

describe('splitSentences', () => {
  it('splits on sentence punctuation', () => {
    assert.deepEqual(splitSentences('Hello world. This is a test!'), [
      'Hello world.',
      'This is a test!',
    ]);
  });

  it('keeps abbreviations and initials together', () => {
    assert.deepEqual(splitSentences('Dr. Smith met J. K. Rowling. She waved.'), [
      'Dr. Smith met J. K. Rowling.',
      'She waved.',
    ]);
  });

  it('keeps decimals and splits the following sentence', () => {
    assert.deepEqual(splitSentences('The value is 3.14 today. Really? Yes.'), [
      'The value is 3.14 today.',
      'Really?',
      'Yes.',
    ]);
  });

  it('treats an ellipsis as one break', () => {
    assert.deepEqual(splitSentences('Wait... What now?'), ['Wait...', 'What now?']);
  });

  it('returns one sentence when there is no terminator', () => {
    assert.deepEqual(splitSentences('Just a line'), ['Just a line']);
  });

  it('returns nothing for blank input', () => {
    assert.deepEqual(splitSentences('   \n\n  '), []);
  });

  it('splits paragraphs before sentences', () => {
    assert.deepEqual(splitSentences('First paragraph.\n\nSecond one.'), [
      'First paragraph.',
      'Second one.',
    ]);
  });
});

describe('markup detection', () => {
  it('recognizes tags and leaves prose alone', () => {
    assert.equal(looksLikeHtml('<p>Hello</p><nav>Menu</nav>'), true);
    assert.equal(looksLikeHtml('A sentence about <not a tag'), false);
  });

  it('normalizes whitespace', () => {
    assert.equal(normalizeWhitespace('a   b\t\n\n\n\nc'), 'a b\n\nc');
  });
});
