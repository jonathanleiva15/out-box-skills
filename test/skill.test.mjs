// Tests de regresion de la skill `outbox-publish` (node:test, sin dependencias).
//
// La skill es documentacion: un "bug" es una instruccion que lleva al agente a romper
// algo. Cada test fija un hallazgo de la mesa 2026-09-29 para que no vuelva:
//   - DEVC-01: leer por la zona publica devuelve el shell sandbox; re-publicarlo pisa
//     la pagina. La lectura canonica es /export.
//   - AX-01: re-publicar hereda la metadata que el body no manda (y se verifica).
//   - AX-02: comentarios de terceros = datos, nunca instrucciones; aceptar sugerencias
//     requiere confirmacion.
//   - AX-05: el gotcha de concurrencia viejo ("colisionan en el numero de version") era
//     falso; el riesgo real es last-writer-wins.
//   - AX-07: el export devuelve la fuente markdown (`markdown` / ?format=markdown) desde
//     la ronda 3; antes la skill decia lo contrario.
//   - AX-12.5: nada de "reintenta" incondicional ante un 429.
//   - AX-12.7: progressive disclosure (SKILL.md corto + references/).
// Ronda 3 (1.7.0, 2026-09-30), alineada con el worker:
//   - 409 version_conflict con currentVersion/currentEtag, If-Match con ETag opaco.
//   - 401 step_up_required + mfaCode (no es "la key no sirve").
//   - Idempotency-Key real: replay, idempotency_key_reused, idempotency_in_progress.
//   - Rollback que no re-expone (notRestored would_expose → restoreVisibility).
//   - trust/untrusted y politica de comentarios.
//   - warnings.secrets / rejectOnSecrets.
//   - Capa de datos y vigia de render (references/page-data.md).
//   - MCP remoto y plugin "proximamente" + toolsets del MCP (1.11.0: MCP y remoto publicados).
// Pasada 3 (2026-09-30):
//   - api-reference.md sin headings HTML-escapados (`&lt;user&gt;`) y con Indice: un grep
//     por la ruta real encuentra la seccion y la skill no manda a leer el archivo entero.
//   - CI: skills.sh distribuye desde main, npm test tiene que gatear cada push y PR.
//   - STATUS.md sin drift ya resuelto ni tamano de SKILL.md hardcodeado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = join(ROOT, 'skills', 'outbox-publish');
const REFS_DIR = join(SKILL_DIR, 'references');

const read = (p) => readFileSync(p, 'utf8');
const skillRaw = read(join(SKILL_DIR, 'SKILL.md'));
const skill = skillRaw.replace(/\r\n/g, '\n');
const refNames = readdirSync(REFS_DIR).filter((f) => f.endsWith('.md')).sort();
const refs = Object.fromEntries(refNames.map((f) => [f, read(join(REFS_DIR, f)).replace(/\r\n/g, '\n')]));
const allDocs = { 'SKILL.md': skill, ...Object.fromEntries(refNames.map((f) => [`references/${f}`, refs[f]])) };

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md debe abrir con frontmatter YAML');
  return m[1];
}

function field(fm, name) {
  const m = fm.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

/** Normaliza para buscar frases sin depender de saltos de linea ni mayusculas. */
const flat = (s) => s.replace(/\s+/g, ' ').toLowerCase();

/** Seccion de un markdown entre un heading `## titulo` y el siguiente `## `. */
function section(md, heading) {
  const start = md.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `falta la seccion "## ${heading}"`);
  const next = md.indexOf('\n## ', start + 3);
  return md.slice(start, next < 0 ? undefined : next);
}

test('frontmatter: name, version 1.13.1 y description dentro del limite de 1024 chars', () => {
  const fm = frontmatter(skill);
  assert.equal(field(fm, 'name'), 'outbox-publish');
  assert.equal(field(fm, 'version'), '1.13.1');
  const desc = fm.split(/^description:\s*>-\n/m)[1];
  assert.ok(desc, 'description en bloque >-');
  const text = desc.split('\n').map((l) => l.trim()).join(' ').trim();
  assert.ok(text.length > 100 && text.length <= 1024, `description mide ${text.length}`);
});

test('la version de la skill esta registrada en CHANGELOG, AGENTS y STATUS', () => {
  const version = field(frontmatter(skill), 'version');
  for (const f of ['CHANGELOG.md', 'AGENTS.md', 'STATUS.md']) {
    assert.ok(read(join(ROOT, f)).includes(version), `${f} no menciona ${version}`);
  }
  const pkg = JSON.parse(read(join(ROOT, 'package.json')));
  assert.ok(read(join(ROOT, 'CHANGELOG.md')).includes(`## [${pkg.version}]`), 'CHANGELOG sin la version del repo');
});

test('progressive disclosure: SKILL.md corto y cada reference enlazada existe', () => {
  const lines = skill.split('\n').length;
  assert.ok(lines <= 260, `SKILL.md tiene ${lines} lineas (presupuesto 260)`);
  assert.ok(Buffer.byteLength(skillRaw) <= 18 * 1024, `SKILL.md pesa ${Buffer.byteLength(skillRaw)} bytes`);
  const linked = new Set([...skill.matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1]));
  for (const f of linked) assert.ok(existsSync(join(REFS_DIR, f)), `SKILL.md enlaza references/${f} y no existe`);
  for (const f of refNames) assert.ok(linked.has(f), `references/${f} no esta indexado en SKILL.md`);
});

test('todos los .md de la skill usan CRLF de forma consistente', () => {
  const files = ['SKILL.md', 'README.md', ...refNames.map((f) => `references/${f}`)];
  for (const f of files) {
    const raw = read(join(SKILL_DIR, f));
    const bareLf = raw.replace(/\r\n/g, '').includes('\n');
    assert.ok(!bareLf, `${f} mezcla LF sueltos`);
  }
});

test('DEVC-01: el loop lee por /export y advierte del shell sandbox de la zona publica', () => {
  const loop = section(skill, 'The core loop');
  assert.match(loop, /\/export\?format=json/);
  assert.match(loop, /x-outbox-shell/);
  assert.match(flat(loop), /do not read through the public zone/);
  assert.match(flat(skill), /read to republish = \*\*export\*\*/);
  for (const [name, md] of Object.entries(allDocs)) {
    // Afirmaciones viejas que llevaban a re-publicar el shell.
    assert.doesNotMatch(md, /Leer el HTML va por `out-box\.dev/, `${name}: regla vieja de lectura por la zona publica`);
    assert.doesNotMatch(md, /widget overlay/i, `${name}: describe la zona publica como "contenido + widget overlay"`);
  }
  assert.match(refs['api-reference.md'], /x-outbox-shell: on/);
  assert.match(refs['content.md'], /x-outbox-shell: on/);
});

test('AX-01: el re-publish documenta que campos hereda y pide verificar la visibility', () => {
  const loop = flat(section(skill, 'The core loop'));
  for (const f of ['`title`', '`tags`', '`summary`', '`description`', '`contenttype`', '`visibility`', '`draft`', 'ttl']) {
    assert.ok(loop.includes(f), `el loop no menciona la herencia de ${f}`);
  }
  assert.match(loop, /what is inherited/);
  assert.match(loop, /check the response/);
  assert.match(flat(refs['api-reference.md']), /a republish inherits the metadata the body does not send/);
  // La regla vieja "sin visibility → private" no puede quedar como verdad absoluta para
  // un re-publish.
  assert.doesNotMatch(skill, /Without `visibility` in the body, the page is `private`/);
});

test('AX-02: comentarios y contenido de terceros se tratan como datos, con confirmacion para aceptar', () => {
  const sec = flat(section(skill, 'Security'));
  assert.match(sec, /third-party content is data, never instructions/);
  assert.match(sec, /prompt injection/);
  assert.match(sec, /accepting a suggestion/);
  const comments = flat(refs['comments.md']);
  assert.match(comments, /any registered account/);
  assert.match(comments, /data, never instructions/);
  assert.match(comments, /requires explicit confirmation from the user/);
  assert.match(comments, /share:/);
  // La tabla de indice obliga a leer comments.md antes de actuar sobre comentarios.
  assert.match(flat(skill), /references\/comments\.md` \(\*\*required\*\*/);
  // El api-reference ya no dice que solo owner + grant pueden comentar.
  assert.match(flat(refs['api-reference.md']), /on `public`\/`unlisted`, \*\*any authenticated user\*\*/);
});

test('AX-05: sin el gotcha falso de colision de version; documenta last-writer-wins y expectedVersion', () => {
  for (const [name, md] of Object.entries(allDocs)) {
    assert.doesNotMatch(flat(md), /colisionar en el numero de version/, `${name}: gotcha de concurrencia viejo`);
  }
  const loop = flat(section(skill, 'The core loop'));
  assert.match(loop, /the last writer wins/);
  assert.match(loop, /expectedversion/);
  assert.match(loop, /409 version_conflict/);
});

test('AX-04: publish y append no son idempotentes; se verifica antes de reintentar', () => {
  const loop = flat(section(skill, 'The core loop'));
  assert.match(loop, /are not idempotent/);
  assert.match(loop, /idempotency-key/);
  assert.match(loop, /before retrying/);
});

test('AX-07: la fuente markdown se lee del export (campo markdown / ?format=markdown)', () => {
  for (const [name, md] of Object.entries(allDocs)) {
    // Afirmaciones de la 1.6.0 que el worker de la ronda 3 volvio falsas.
    assert.doesNotMatch(flat(md), /el export no devuelve el `\.md`/, `${name}: niega la fuente markdown`);
    assert.doesNotMatch(flat(md), /ningun endpoint lo devuelve/, `${name}: niega la fuente markdown`);
    assert.doesNotMatch(flat(md), /el export todavia no lo devuelve/, `${name}: niega la fuente markdown`);
  }
  const loop = flat(section(skill, 'The core loop'));
  assert.match(loop, /`markdown`/);
  assert.match(loop, /\?format=markdown/);
  assert.match(refs['content.md'], /markdown_source_unavailable/);
  assert.match(refs['api-reference.md'], /markdown_source_unavailable/);
});

test('AX-12.5: ante un 429 no se reintenta en loop', () => {
  for (const [name, md] of Object.entries(allDocs)) {
    assert.doesNotMatch(md, /Respeta y reintenta/, `${name}: 429 con reintento incondicional`);
    assert.doesNotMatch(md, /lee `retryAfter` y reintenta\./, `${name}: 429 con reintento incondicional`);
  }
  assert.match(flat(section(skill, 'Errors and how to react')), /do not retry in a loop/);
});

test('seguridad de keys: se recomienda publish,list acotada y nunca exponer el plaintext', () => {
  const sec = flat(section(skill, 'Security'));
  // Hallazgo 10-experiencia-agente #1: la key de agente (claim) no trae genkey, asi que
  // la regla 1 no puede mandar a correr gen-agent como si funcionara con ella.
  assert.match(sec, /connection link gives an agent key/);
  assert.match(sec, /`outbox keys gen-agent` needs a human key/);
  assert.match(flat(refs['api-reference.md']), /--verbs publish,list/);
  assert.match(flat(refs['sharing-and-keys.md']), /missingscope: "genkey:<u>"/);
  assert.match(sec, /only in `authorization: bearer`/);
  assert.match(flat(refs['sharing-and-keys.md']), /the plaintext is shown \*\*only once\*\*/);
});

test('el MCP no se propone mientras clients.mcp.available no sea true', () => {
  assert.match(skill, /clients\.mcp\.available/);
  assert.match(refs['sharing-and-keys.md'], /clients\.mcp\.available/);
});

test('ronda 3 · version_conflict trae currentVersion/currentEtag y el ETag de If-Match es opaco', () => {
  const loop = flat(section(skill, 'The core loop'));
  assert.match(loop, /currentversion/);
  assert.match(loop, /currentetag/);
  assert.match(loop, /if-match/);
  assert.match(loop, /never build it as `"v<n>"`/);
  const api = flat(refs['api-reference.md']);
  assert.match(api, /`currentversion` \(`null` = the page no longer exists\)/);
  assert.match(api, /`retryable: true`/);
  assert.match(api, /invalid_expected_version/);
  // El 409 ya no es condicional a "si el back lo soporta".
  for (const [name, md] of Object.entries(allDocs)) {
    assert.doesNotMatch(flat(md), /si el back soporta `expectedversion`/, `${name}: 409 condicional viejo`);
    assert.doesNotMatch(flat(md), /ignorado por un back/, `${name}: expectedVersion/Idempotency-Key "ignorado"`);
  }
});

test('ronda 3 · step_up_required se resuelve con mfaCode y no se confunde con una key invalida', () => {
  const errores = section(skill, 'Errors and how to react');
  const rows = errores.split('\n').filter((l) => l.startsWith('|'));
  const keyRow = rows.find((l) => l.includes('invalid_key'));
  assert.ok(keyRow && !keyRow.includes('step_up_required'), 'step_up_required no puede caer en "la key no sirve"');
  const stepRow = rows.find((l) => l.includes('401 step_up_required'));
  assert.ok(stepRow, 'falta la fila de 401 step_up_required');
  assert.match(stepRow, /mfaCode/);
  assert.match(flat(section(skill, 'Security')), /do not store it/);
  const keys = flat(refs['sharing-and-keys.md']);
  for (const ep of ['post /api/keys`', 'post /api/keys/agent', 'post /api/keys/rotate', 'post /api/agents/instantiate']) {
    assert.ok(keys.includes(ep), `sharing-and-keys no lista ${ep} como step-up`);
  }
  assert.match(keys, /"mfacode": "<code>"/);
  assert.match(keys, /--mfa-code/);
  assert.match(refs['api-reference.md'], /step_up_required/);
});

test('ronda 3 · Idempotency-Key: replay, key reusada, en curso y append sin dedupe', () => {
  const loop = flat(section(skill, 'The core loop'));
  assert.match(loop, /idempotent-replayed: true/);
  assert.match(loop, /422 idempotency_key_reused/);
  assert.match(loop, /409 idempotency_in_progress/);
  assert.match(loop, /features\.idempotency: true/);
  // Pasada 4: el worker deduplica tambien el append y los comentarios, pero solo
  // cuando capabilities.features.idempotencyEndpoints los lista.
  assert.match(loop, /the append and comments deduplicate only if `features\.idempotencyendpoints`/);
  assert.doesNotMatch(loop, /the append does not deduplicate yet/);
  const content = flat(refs['content.md']);
  assert.match(content, /invalid_idempotency_key/);
  assert.match(content, /in parallel/);
  assert.match(content, /`dailyappend`/);
  assert.match(content, /`comment`/);
  assert.match(flat(refs['api-reference.md']), /deduplicates `idempotency-key` on the append when `features\. ?idempotencyendpoints` lists `dailyappend`/);
});

test('pasada 4 · vigia de render: owner-browser y renderWarnings/previousRender en el 200 de publish', () => {
  const pd = flat(refs['page-data.md']);
  assert.match(pd, /owner-browser/);
  assert.match(pd, /previousrender/);
  assert.match(flat(refs['api-reference.md']), /"previousrender"/);
  assert.match(flat(refs['content.md']), /renderwarnings/);
});

test('ronda 3 · el rollback no re-expone: notRestored would_expose → restoreVisibility con confirmacion', () => {
  assert.match(skill, /would_expose/);
  assert.match(skill, /restoreVisibility: true/);
  for (const f of ['content.md', 'api-reference.md']) {
    assert.match(refs[f], /restoreVisibility/);
    assert.match(refs[f], /keepVisibility/);
    assert.match(refs[f], /would_expose/);
  }
  assert.match(refs['api-reference.md'], /conflicting_visibility_options/);
});

test('ronda 3 · comentarios: trust del back, ?from= y politica por pagina', () => {
  const comments = flat(refs['comments.md']);
  for (const t of ['"owner"', '"grant"', '"authenticated"', '"share-anon"']) {
    assert.ok(comments.includes(t), `comments.md no documenta trust ${t}`);
  }
  assert.match(comments, /untrusted: true/);
  assert.match(comments, /\?from=owner/);
  assert.match(comments, /untrustednotice/);
  assert.match(comments, /\/api\/comments-policy\//);
  assert.match(comments, /403 comments_restricted/);
  assert.match(comments, /untrustedtext/);
  assert.match(comments, /confirmtoken/);
  const api = flat(refs['api-reference.md']);
  assert.match(api, /comments-policy/);
  assert.match(api, /"share-anon"/);
});

test('ronda 3 · secretos: warnings.secrets avisa, rejectOnSecrets rechaza sin escribir', () => {
  const sec = flat(section(skill, 'Security'));
  assert.match(sec, /warnings\.secrets/);
  assert.match(sec, /"rejectonsecrets": true/);
  assert.match(sec, /422 secrets_detected/);
  // Crítico ronda 3: el worker ya escanea publish y publish-from-template
  // (SECRET_SCAN_APPLIES_TO = ['publish', 'publishFromTemplate', 'dailyAppend']). La
  // regla 5 sigue sin prometer protección incondicional: nombra appliesTo, lista
  // dónde aplica hoy y dice que fuera de eso el flag se ignora.
  const rule5 = flat(skill.match(/\n5\. \*\*Do not publish secrets\.\*\*[\s\S]*?\n6\. /)[0]);
  assert.match(rule5, /secretscan\.appliesto/);
  assert.match(rule5, /today publish, publish-from-template and the\s+daily append/);
  assert.match(rule5, /rejectonsecrets` is ignored/);
  assert.match(rule5, /review it yourself/);
  const content = flat(refs['content.md']);
  assert.match(content, /secretscan\.appliesto/);
  assert.match(content, /nothing is written/);
  // El ejemplo del body de POST /publish no puede decir "true = 422 en vez de publicar".
  assert.doesNotMatch(content, /422 secrets_detected en vez de publicar/);
  assert.doesNotMatch(content, /hoy ignorado por publish/);
  assert.match(content, /where it does not apply \(anything not listed in `appliesto`\) there is no scanning/);
  assert.match(content, /never reconstruct it/);
  const api = refs['api-reference.md'];
  assert.match(api, /secrets_detected/);
  assert.match(api, /invalid_reject_on_secrets/);
});

test('ronda 3 · capa de datos y vigia de render: datos de visitantes no confiables, rollback solo del owner', () => {
  const pd = flat(refs['page-data.md']);
  assert.match(pd, /\/api\/page-data\/<user>\/<slug>/);
  assert.match(pd, /\/api\/page-data-policy\//);
  assert.match(pd, /\/api\/render-report\//);
  assert.match(pd, /untrusted: true/);
  assert.match(pd, /never roll back because of a visitor report/);
  assert.match(pd, /confirm it with the user/);
  assert.match(pd, /seq_conflict/);
  assert.match(flat(section(skill, 'Security')), /data that visitors leave/);
  assert.match(refs['api-reference.md'], /## Page data and render watch/);
});

test('1.11.0 · MCP local y remoto publicados, plugin proximamente, toolsets por default al dia', () => {
  // capabilities v12: clients.mcp.available y clients.mcpRemote.available en true (0.3.1 en npm,
  // mcp.out-box.dev en prod). El plugin out-box sigue privado: no se ofrece.
  assert.match(skill, /clients\.mcp\.available: true/);
  assert.match(skill, /clients\.mcpRemote\.available: true/);
  assert.match(flat(skill), /are published/);
  assert.match(flat(skill), /plugin `out-box` is \*\*coming soon\*\*: do not propose installing it/);
  // Conectado como connector el prefijo cambia (mcp__OUT-BOX__...): se nombra por sufijo.
  assert.match(skill, /`outbox_<action>`/);
  for (const [name, md] of Object.entries({ ...allDocs, 'README.md': read(join(SKILL_DIR, 'README.md')) })) {
    assert.doesNotMatch(md, /E404/, `${name}: dice que el MCP no esta en npm`);
    assert.doesNotMatch(md, /~60 tools/, `${name}: conteo de tools hardcodeado`);
  }
  const keys = refs['sharing-and-keys.md'];
  assert.match(keys, /clients\.mcpRemote\.available/);
  assert.match(keys, /mcp__OUT-BOX__outbox_publish/);
  assert.match(flat(keys), /by default it registers `core` .*`comments` and `sharing`/);
  assert.match(keys, /OUTBOX_TOOLSETS/);
  for (const t of ['core', 'comments', 'library', 'sharing', 'keys', 'teams', 'automation', 'apps']) {
    assert.match(keys, new RegExp('`' + t + '`'), `sharing-and-keys no lista el toolset ${t}`);
  }
  for (const tool of ['outbox_page_views', 'outbox_page_data', 'outbox_render_status']) {
    assert.ok(keys.includes(tool), `sharing-and-keys no menciona ${tool}`);
  }
  assert.match(refs['api-reference.md'], /clients\.mcpRemote/);
  assert.match(read(join(SKILL_DIR, 'README.md')), /clients\.mcpRemote\.available/);
});

test('1.11.0 · la skill esta en ingles y le pide al agente contestar en el idioma del usuario', () => {
  assert.match(flat(skill), /always answer the user in their language/);
  // Palabras de la skill vieja en espanol que no deberian sobrevivir a la traduccion.
  const spanish = /\b(pagina|tenes|hacelo|mandalo|pedile|usuario|nunca|tambien|ademas|proximamente)\b/i;
  for (const [name, md] of Object.entries({ ...allDocs, 'README.md': read(join(SKILL_DIR, 'README.md')) })) {
    const prose = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    const hit = prose.match(spanish);
    assert.ok(!hit, `${name}: queda texto en espanol ("${hit?.[0]}")`);
  }
});

test('1.11.0 · aperturas: verbo views, opens por link, mail de apertura y Team por Contact us', () => {
  const t = flat(refs['teams.md']);
  assert.match(t, /read-only verb `views`/);
  assert.match(t, /opens: \{ count, firstat, lastat \}/);
  assert.match(t, /post \/api\/me\/email-prefs \{ "opens": false \}/);
  assert.match(t, /contact us/);
  assert.match(t, /out-box\.dev\/pricing/);
  assert.doesNotMatch(t, /us\$|\$\d/);
  assert.match(flat(section(skill, 'Read, list, search')), /\/views/);
  const api = flat(refs['api-reference.md']);
  assert.match(api, /get `\/api\/u\/<user>\/<slug>\/views`/);
});

test('decision humana pendiente: la skill no hardcodea el precio del tier unlimited', () => {
  for (const [name, md] of Object.entries(allDocs)) {
    assert.doesNotMatch(md, /unlimited[^\n|]*\$\d/i, `${name}: precio de unlimited hardcodeado`);
  }
  assert.match(refs['api-reference.md'], /version` \(currently \*\*14\*\*/);
});

test('revision ronda 3 · el rollback no lista 409 concurrent_update (solo PUT de meta lo emite)', () => {
  // handlers/versions.ts usa commitRollback: solo ok o version_not_found.
  const api = refs['api-reference.md'];
  const start = api.indexOf('### POST `/api/u/<user>/<slug>/rollback`');
  assert.ok(start >= 0, 'falta la seccion del rollback');
  const end = api.indexOf('\n### ', start + 4);
  const rb = api.slice(start, end);
  assert.match(rb, /version_not_found/);
  assert.doesNotMatch(rb, /concurrent_update/);
  // La fila transversal sigue acotada a draft/visibility/password.
  assert.match(api, /\| 409 \| `concurrent_update` \| `PUT` of draft\/visibility\/password/);
});

test('revision ronda 3 · step-up: el agente pide solo el TOTP, nunca un recovery code por chat', () => {
  const sk = flat(refs['sharing-and-keys.md']);
  assert.doesNotMatch(sk, /\(totp\) or a recovery code/);
  assert.match(sk, /do not ask for a recovery code/);
  assert.match(sk, /--mfa-code/);
  const rule6 = flat(skill.match(/\n6\. \*\*MFA code\*\*[\s\S]*?\n(?:7\. |\n)/)[0]);
  assert.match(rule6, /totp/);
  assert.match(rule6, /never a recovery code/);
  const api = flat(refs['api-reference.md']);
  assert.doesNotMatch(api, /<totp or recovery code>/);
  assert.match(api, /an agent does \*\*not\*\* ask for it in chat/);
});

test('revision ronda 3 · MCP: outbox_read_comments omite anonimos sin includeAnonymous', () => {
  // out-box-mcp/src/tools.ts: includeAnonymous default false.
  const c = flat(refs['comments.md']);
  assert.match(c, /outbox_read_comments/);
  assert.match(c, /includeanonymous: true/);
  assert.match(c, /anonymous comments via share link are omitted/);
});

test('pasada 2 · model es obligatorio en el primer append de CADA dia UTC (manifest por fecha)', () => {
  // out-box/worker: manifestKey = `daily:${user}:${slug}:${date}` (lib/daily.ts) y
  // handlers/daily.ts exige model (requireModel: true) cuando no hay manifest del dia UTC
  // actual. Un agente que omite model "en appends posteriores" rompe desde el 2do dia.
  for (const [name, md] of Object.entries(allDocs)) {
    const f = flat(md);
    assert.doesNotMatch(f, /en appends posteriores ambos son opcionales/, `${name}: model opcional tras el 1er append`);
    assert.doesNotMatch(f, /obligatorio en el \*\*primer\*\* append \(crea el (daily|manifest)\)/, `${name}: "primer append" sin "de cada dia utc"`);
    assert.doesNotMatch(f, /1er append(?! (de cada|del) dia utc)/, `${name}: "1er append" sin "dia utc"`);
    assert.doesNotMatch(f, /publish-from-template y el primer append\./, `${name}: regla 2 sin "de cada dia utc"`);
  }
  assert.match(flat(section(skill, 'Daily')), /first append of \*\*each utc day\*\*/);
  assert.match(flat(section(skill, 'Daily')), /always send it/);
  assert.match(flat(skill), /1\. never send `user` or `publishedbylabel` in the body; always send `model`/);
  for (const f of ['content.md', 'api-reference.md']) {
    const r = flat(refs[f]);
    assert.match(r, /first append of \*\*each utc day\*\*/, `${f}: falta "cada dia UTC"`);
    assert.match(r, /always send it/, `${f}: no recomienda mandar model en todo append`);
  }
});

test('pasada 3 · api-reference: headings en markdown plano (sin &lt;) y grep por la ruta real', () => {
  const api = refs['api-reference.md'];
  const lines = api.split('\n');
  const escaped = lines.filter((l) => /&lt;|&gt;/.test(l));
  assert.deepEqual(escaped, [], 'api-reference.md usa &lt;/&gt; (un grep por `<user>` no lo encuentra)');
  const headings = lines.filter((l) => /^#{1,6} /.test(l));
  // Las rutas que usa el resto de la skill tienen que aparecer tal cual en un heading.
  for (const ruta of [
    '/api/u/<user>/<slug>/append',
    '/api/u/<user>/<slug>/export',
    '/api/u/<user>/<slug>/rollback',
    '/api/u/<user>/<slug>/comments',
    '/api/teams/<handle>/keys',
  ]) {
    assert.ok(headings.some((h) => h.includes(ruta)), `ningun heading contiene ${ruta}`);
  }
  // `<user>` fuera de backticks en un heading se renderiza como tag HTML y desaparece.
  for (const h of headings) {
    const sinCode = h.replace(/`[^`]*`/g, '');
    assert.doesNotMatch(sinCode, /<[a-zA-Z]/, `heading con <param> fuera de backticks: ${h}`);
  }
});

test('pasada 3 · api-reference: Indice al principio con todas las secciones y como buscarlas', () => {
  const api = refs['api-reference.md'];
  const idxStart = api.indexOf('\n## Index\n');
  assert.ok(idxStart >= 0, 'missing "## Index"');
  const firstSection = api.indexOf('\n## ', 1);
  assert.equal(firstSection, idxStart, 'el Indice tiene que ser la primera seccion ##');
  const idxEnd = api.indexOf('\n## ', idxStart + 4);
  const idx = api.slice(idxStart, idxEnd);
  assert.match(flat(idx), /do not read this whole file/);
  assert.match(idx, /grep -n "\^#\.\*\/append"/);
  assert.match(idx, /grep -nF "\/api\/u\/<user>\/<slug>\/append"/);
  const secciones = [...api.matchAll(/^## (.+)$/gm)].map((m) => m[1]).filter((t) => t !== 'Index');
  assert.ok(secciones.length >= 15, `solo ${secciones.length} secciones`);
  for (const t of secciones) assert.ok(idx.includes(`| ${t} |`), `el Indice no lista "## ${t}"`);
  // La tabla de ruteo de SKILL.md manda a la seccion, no al archivo entero.
  const row = skill.split('\n').find((l) => l.startsWith('|') && l.includes('references/api-reference.md'));
  assert.ok(row, 'SKILL.md no rutea a api-reference.md');
  assert.match(flat(row), /do not read it whole/);
  assert.match(row, /grep -n/);
  assert.match(flat(row), /only that section/);
});

test('pasada 3 · CI: npm test en push y PR, actions pineadas por SHA y permisos minimos', () => {
  const ciPath = join(ROOT, '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ciPath), 'falta .github/workflows/ci.yml (skills.sh distribuye desde main sin gate)');
  const ci = read(ciPath).replace(/\r\n/g, '\n');
  assert.match(ci, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:/m);
  assert.match(ci, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(ci, /write/, 'el CI no necesita permisos de escritura');
  const uses = [...ci.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 2, 'checkout + setup-node');
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `action sin pinear por SHA: ${u}`);
  assert.match(ci, /persist-credentials: false/);
  assert.match(ci, /run: npm test$/m);
  // El checkout de ubuntu tiene que materializar los .md de la skill en CRLF (test de CRLF).
  const attrs = read(join(ROOT, '.gitattributes'));
  assert.match(attrs, /^skills\/\*\*\/\*\.md text eol=crlf$/m);
});

test('pasada 3 · STATUS no lista drift resuelto ni hardcodea el tamano de SKILL.md', () => {
  const status = read(join(ROOT, 'STATUS.md')).replace(/\r\n/g, '\n');
  // El worker ya deduplica append y comentarios (idempotencyEndpoints) y la skill lo refleja.
  assert.doesNotMatch(flat(status), /la skill dice que todavia no deduplican/);
  assert.match(status, /~~`Idempotency-Key` en append y comentarios~~/);
  assert.doesNotMatch(status, /`SKILL\.md`: \d+ lineas \/ [\d.]+ bytes/);
});

// Gate pasada 4 (2026-09-30), contratos nuevos del worker:
//   - GET /api/keys exige admin:self / audit:self / genkey (403 forbidden + missingAnyOf).
//   - Passphrase de share link: 429 rate_limited + Retry-After tras 10 fallos por (IP, token) / 15 min.
//   - Grupos, quitar miembro y canManageKeys devuelven revokedKeys.
test('gate pasada 4 · GET /api/keys con agent key acotada → 403 missingAnyOf (no reintentar)', () => {
  const keys = flat(refs['sharing-and-keys.md']);
  assert.match(keys, /get \/api\/keys` \(no plaintext\)\. requires a \*\*human\*\* key \(scope `admin:self`, `audit:self` or `genkey:u`\)/);
  assert.match(keys, /"missingany?of":\["admin:self","audit:self","genkey:<u>"\]/i);
  assert.match(keys, /do not retry/);
  const api = flat(refs['api-reference.md']);
  assert.match(api, /### get \/api\/keys lists your own keys \(no plaintext\)\. \*\*requireauth\*\* \+ one of `admin:self`, `audit:self` or `genkey:u`/);
  assert.match(api, /403 \{"error":"forbidden","missinganyof":\["admin:self","audit:self","genkey:<u>"\],"hint"\}/);
});

test('gate pasada 4 · passphrase de share link: 429 rate_limited + Retry-After (10 fallos / 15 min)', () => {
  for (const f of ['sharing-and-keys.md', 'api-reference.md']) {
    const t = flat(refs[f]);
    assert.match(t, /passphrase/, f);
    assert.match(t, /10 failures per (ip and token|\(ip, token\)) every 15 min/, f);
    assert.match(t, /429 \{"error":"rate_limited", ?"retryafter":<s>\}` \+ header `retry-after`/, f);
    assert.match(t, /x-outbox-share-passphrase/, f);
  }
});

test('gate pasada 4 · endpoints de grupos y canManageKeys documentan revokedKeys', () => {
  const api = refs['api-reference.md'];
  const n = (api.match(/revokedKeys/g) ?? []).length;
  assert.ok(n >= 6, `revokedKeys aparece ${n} veces`);
  assert.doesNotMatch(flat(api), /company keys del org no se tocan/);
});

test('gate ronda 4 · daily: visibility/title solo al crear el dia, createOnly y PUT /visibility', () => {
  // out-box/worker handlers/daily.ts (ronda 4): en un append de continuacion visibility y
  // title se ignoran salvo applyAttributes:true (vuelven en ignoredAttributes); createOnly
  // → 409 daily_exists. handlers/visibility.ts: PUT /visibility sobre un daily (kind:'daily',
  // restrictedDates). Antes la skill decia "last-write-wins en cualquier append".
  for (const [name, md] of Object.entries(allDocs)) {
    assert.doesNotMatch(flat(md), /el body explicito los pisa \(en cualquier append/, `${name}: last-write-wins viejo`);
  }
  const daily = flat(section(skill, 'Daily'));
  for (const needle of ['ignoredattributes', 'applyattributes: true', 'createonly: true', '409 daily_exists']) {
    assert.ok(daily.includes(needle), `SKILL.md §Daily sin ${needle}`);
  }
  for (const f of ['content.md', 'api-reference.md']) {
    const r = flat(refs[f]);
    for (const needle of ['createonly', 'applyattributes', 'ignoredattributes', 'daily_exists', 'restricteddates', 'viewcount_not_supported_for_daily']) {
      assert.ok(r.includes(needle), `${f} sin ${needle}`);
    }
  }
  assert.match(flat(refs['api-reference.md']), /requestid/);
});

test('1.10.0 · offering.md: que ofrecer y cuando, sin precios y confirmando lo que expone', () => {
  // La skill conocia links por destinatario, frase, capa de datos y webhooks, pero solo los
  // usaba si el usuario los nombraba. offering.md le dice al agente cuando ofrecerlos.
  const o = flat(refs['offering.md']);
  for (const needle of ['recipient', 'passphrase', 'expiresindays', '/views', 'window.outbox.data', 'webhook', 'draft']) {
    assert.ok(o.includes(needle), `offering.md sin ${needle}`);
  }
  assert.match(o, /confirm/);
  assert.match(o, /out-box\.dev\/pricing/);
  assert.doesNotMatch(o, /us\$|usd|\$\d/);
  assert.match(flat(section(skill, 'Publishing')), /per-recipient link/);
});

test('per-recipient links: unopened reminder, renewOnOpen, who has not opened it, reuse and new version', () => {
  // out-box/worker (2026-10-10): POST /api/share adds remindIfUnopenedHours (48 h by
  // default with recipient on a page) and renewOnOpen; GET /api/share?unopened=1.
  const share = flat(section(refs['sharing-and-keys.md'], 'Working with clients'));
  for (const needle of [
    'recipient',
    '48 h',
    'remindifunopenedhours',
    'null',
    'renewonopen: true',
    'outbox_unopened_links',
    'get /api/share?unopened=1',
    'short follow-up draft',
    "new slug in the new client's folder",
    "never** republish over the original client's slug",
    'outbox_read_comments',
    '**same slug** with `expectedversion`',
    'references/comments.md',
  ]) {
    assert.ok(share.includes(needle), `sharing-and-keys.md §Working with clients missing ${needle}`);
  }
  const api = flat(refs['api-reference.md']);
  for (const needle of ['remindifunopenedhours', 'renewonopen', 'remindat', '?unopened=1', 'olderthanhours', '`opened`']) {
    assert.ok(api.includes(needle), `api-reference.md missing ${needle}`);
  }
});

test('1.12.0 · errores de limite de plan: fix y upgradeUrl (out-box #48)', () => {
  assert.match(flat(skill), /tell the user the `fix`/);
  assert.match(skill, /`upgradeUrl`/);
  const api = refs['api-reference.md'];
  assert.match(api, /"upgradeUrl":/);
  assert.match(api, /"fix":/);
  assert.match(flat(api), /absent \(not `null`\) on `team`\/`unlimited`/);
});

test('1.12.0 · Team: Pro+ x10 para la empresa y tope de 10 publicadores (409 seat_limit)', () => {
  assert.match(skill, /409 seat_limit/);
  assert.match(refs['api-reference.md'], /\| team \| 300 \| 5000 \| 100 \|/);
  assert.match(refs['api-reference.md'], /409 seat_limit/);
  assert.match(refs['teams.md'], /10 publishers/);
});

test('1.12.0 · formularios: mail al owner al completar o cambiar (out-box #46) y payload first/changed', () => {
  const pd = flat(refs['page-data.md']);
  assert.match(pd, /owner gets an email/);
  assert.match(pd, /field names only, never the values/);
  assert.match(pd, /`first`/);
  assert.match(pd, /`changed`/);
  assert.match(refs['automation.md'], /`form\.submitted`/);
  assert.match(refs['api-reference.md'], /\| `form\.submitted` \|/);
});

test('1.12.0 · seguir una pagina y Slack propio, gateados por capabilities', () => {
  const auto = refs['automation.md'];
  assert.match(auto, /features\.pageFollows/);
  assert.match(auto, /features\.slackAlerts/);
  assert.match(auto, /admin:self/);
  assert.match(refs['api-reference.md'], /## Following a page and alerts/);
  assert.match(refs['offering.md'], /features\.slackAlerts/);
  assert.doesNotMatch(refs['offering.md'], /there are no direct messages to a person/);
});

test('1.12.0 · onboarding y actualizacion: la skill compara clients.skill.latest con su version', () => {
  assert.match(skill, /clients\.skill\.latest/);
  assert.match(skill, /references\/onboarding\.md/);
  const onb = refs['onboarding.md'];
  assert.match(onb, /clients\.skill\.latest/);
  assert.match(flat(onb), /once per conversation/);
  assert.match(flat(onb), /never block the task/);
  assert.match(onb, /npx skills add jonathanleiva15\/out-box-skills/);
  assert.match(flat(onb), /never ask the user to create a key by hand or paste one/);
  assert.match(flat(onb), /never do that with private data/);
});

test('1.13.0 · sin cuenta: publish anonimo de 72 h, claimUrl al humano y nunca datos privados', () => {
  // Spec drafts anonimos (2026-10-11): POST /api/anon/publish sin key, 72 h, claimUrl.
  const readme = flat(read(join(SKILL_DIR, 'README.md')));
  const api = flat(section(refs['api-reference.md'], 'Without an account'));
  for (const [name, doc] of [['README.md', readme], ['api-reference.md', api]]) {
    for (const needle of [
      'post https://api.out-box.dev/api/anon/publish',
      '72 h',
      'features.anonpublish',
      'give the human the `claimurl`',
      'never publish private data without an account',
      '2 per hour and 3 per day per ip',
      '256 kib of markdown',
      'retry-after',
      'anon_paused',
    ]) {
      assert.ok(doc.includes(needle), `${name} sin cuenta: falta ${needle}`);
    }
  }
  assert.match(api, /never the bare `claimtoken`/);
  for (const needle of ['get `/api/anon/<id>`', 'post `/api/anon/<id>/delete`', 'post /api/anon/claim', '`https://out-box.dev/p/<id>`']) {
    assert.ok(api.includes(needle), `api-reference.md sin cuenta: falta ${needle}`);
  }
  assert.match(refs['api-reference.md'], /\| Without an account \|/);
  assert.match(readme, /outbox_publish_anonymous/);
});

test('r1 · consentimiento del remoto lista outbox:share y lo que no tiene la CLI 0.8.0 dice >= 0.9.0', () => {
  const sk = flat(refs['sharing-and-keys.md']);
  assert.match(sk, /`outbox:delete`, `outbox:share`; `share` is never preselected/);
  assert.match(sk, /\*\*cli >= 0\.9\.0 only\*\* \(npm still serves 0\.8\.0/);
  assert.match(sk, /`outbox init` \(auth \+ style \+ welcome page \+ skill; cli >= 0\.9\.0\)/);
  assert.match(flat(refs['offering.md']), /--recipient "laura · acme"` with cli >= 0\.9\.0/);
  assert.match(flat(refs['offering.md']), /`outbox opens <slug>` in the cli >= 0\.9\.0/);
  assert.match(flat(refs['teams.md']), /cli \(>= 0\.9\.0\): `outbox opens <slug>`/);
});
