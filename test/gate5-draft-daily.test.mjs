// Gate pasada 5 (2026-09-30): contratos nuevos del worker reflejados en la skill.
//  - PUT /draft sin scope share|template → previewSkipped:'missing_share_scope' sin previewUrl;
//    una key agent no puede pedir previewExpiresInDays:null.
//  - visibility/title/project del daily son de la página: el día nuevo los hereda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'outbox-publish');
const read = (f) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n').replace(/\s+/g, ' ');

test('gate 5 · draft: previewSkipped missing_share_scope documentado', () => {
  for (const f of ['references/api-reference.md', 'references/content.md', 'SKILL.md']) {
    assert.match(read(f), /previewSkipped: "missing_share_scope"/, f);
  }
  assert.match(read('references/api-reference.md'), /previewSkipped\? \}/);
  for (const f of ['references/api-reference.md', 'references/content.md']) {
    assert.match(read(f), /`null`.*solo keys human|una key agent no puede pedir `previewExpiresInDays: null`/i, f);
  }
});

test('gate 5 · daily: visibility/title/project se heredan del día anterior', () => {
  for (const f of ['references/api-reference.md', 'references/content.md']) {
    const md = read(f);
    assert.doesNotMatch(md, /opcional \(al crear el daily\)/, `${f}: texto viejo`);
    assert.match(md, /hereda la del anterior/, f);
  }
  assert.match(read('references/content.md'), /son de la \*\*pagina\*\* del daily/);
});
