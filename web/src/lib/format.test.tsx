import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatDuration, initials, isEmojiOnly, plainText, richText } from './format.tsx';

const html = (text: string) => renderToStaticMarkup(<>{richText(text)}</>);
const LINK = 'target="_blank" rel="noopener noreferrer nofollow ugc"';

test('rich text: *bold*, _italic_, ~strike~ and `code`', () => {
  assert.equal(html('un *bon* plan'), 'un <strong>bon</strong> plan');
  assert.equal(html('_italique_ et ~barré~ et `code`'), '<em>italique</em> et <s>barré</s> et <code>code</code>');
  assert.equal(html('*важно* שלום *חשוב*'), '<strong>важно</strong> שלום <strong>חשוב</strong>');
});

test('rich text: markers inside words are left alone', () => {
  assert.equal(html('my_file_name.txt 2*3*4'), 'my_file_name.txt 2*3*4');
});

test('rich text: mentions and links', () => {
  assert.equal(html('Merci @david.levy !'), 'Merci <span class="mention">@david.levy</span> !');
  assert.equal(html('mail a@b.co'), 'mail a@b.co');
  assert.equal(html('voir https://www.gov.il/fr, merci'), `voir <a href="https://www.gov.il/fr" ${LINK}>https://www.gov.il/fr</a>, merci`);
  assert.equal(html('www.nbn.org.il'), `<a href="https://www.nbn.org.il" ${LINK}>www.nbn.org.il</a>`);
});

test('rich text never produces markup from user input', () => {
  assert.equal(html('<script>alert(1)</script> javascript:alert(1)'), '&lt;script&gt;alert(1)&lt;/script&gt; javascript:alert(1)');
  assert.equal(html('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('one-line previews drop markers and line breaks', () => {
  assert.equal(plainText('Ce groupe est *public* :\n\n• ok @a_b_c'), 'Ce groupe est public : • ok @a_b_c');
});

test('small helpers', () => {
  assert.equal(isEmojiOnly('🎉🇮🇱'), true);
  assert.equal(isEmojiOnly('ok 🎉'), false);
  assert.equal(initials('Naomie Cohen'), 'NC');
  assert.equal(initials('דוד'), 'דו');
  assert.equal(formatDuration(75), '1:15');
});
