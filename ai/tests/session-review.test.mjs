import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { extract } from '../skills/session-review/scripts/extract.mjs';

const START = '2026-10-22T09:22:13Z';
const END = '2026-10-29T09:22:13Z';
const DURING = '2026-10-25T12:00:00Z';
const BEFORE = '2026-10-01T12:00:00Z';

function entry(id, parentId, role = 'user', text = 'Check this', time = DURING) {
  return { type: 'message', id, parentId, timestamp: time, message: { role, content: [{ type: 'text', text }] } };
}

async function fixture(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'session-review-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  return {
    home,
    async session(relative, entries, header = {}) {
      const file = path.join(home, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, [
        { type: 'session', version: 3, id: relative, timestamp: BEFORE, cwd: '/project', ...header },
        ...entries,
      ].map((row) => typeof row === 'string' ? row : JSON.stringify(row)).join('\n') + '\n');
      return file;
    },
    async run(options = {}) {
      const out = path.join(home, 'review');
      const manifest = await extract({ home, env: {}, out, start: START, end: END, ...options });
      const sessions = await Promise.all(manifest.sessions.map(async (session) => ({
        ...session,
        records: (await readFile(path.join(out, session.extract), 'utf8')).trim().split('\n').map(JSON.parse),
        overviewRecords: (await readFile(path.join(out, session.overview), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),
      })));
      return { manifest, sessions, out };
    },
  };
}

test('discovers legacy and profile roots by entry time, with context and exclusive end', async (t) => {
  const f = await fixture(t);
  await f.session('.pi/agent/sessions/project/ancient-name.jsonl', [
    entry('old', null, 'user', 'Earlier context', BEFORE),
    entry('start', 'old', 'user', 'Resumed at start', START),
    entry('end', 'start', 'assistant', 'At the end, excluded', END),
  ]);
  await f.session('.pi/profiles/home/sessions/project/home.jsonl', [entry('home', null, 'user', 'Home prompt')]);
  await f.session('.pi/profiles/work/sessions/project/work.jsonl', [entry('work', null, 'user', 'Work prompt')]);
  const { manifest, sessions, out } = await f.run();
  assert.equal(manifest.counts.sessionFiles, 3);
  assert.equal(manifest.counts.uniqueUserCandidates, 3);
  const resumed = sessions.find((session) => session.source.endsWith('ancient-name.jsonl'));
  assert.deepEqual(resumed.records.map((row) => [row.id, row.inWindow]), [['old', false], ['start', true]]);
  assert.equal(resumed.records[1].source.line, 3);
  assert.equal(resumed.records[1].source.entryId, 'start');
  assert.equal((await stat(out)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(out, 'index.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(path.join(out, resumed.overview))).mode & 0o777, 0o600);
  assert.deepEqual(resumed.overviewRecords.map((row) => row.id), ['start']);
});

test('preserves branches and deduplicates copied history even when IDs change', async (t) => {
  const f = await fixture(t);
  const source = await f.session('.pi/agent/sessions/project/a.jsonl', [
    entry('u', null), entry('a', 'u', 'assistant', 'A reply'),
    entry('b', 'u', 'assistant', 'An alternative'),
    entry('u2', 'a', 'user', 'Check this', '2026-10-26T12:00:00Z'),
  ]);
  await f.session('.pi/agent/sessions/project/clone.jsonl', [
    entry('clone-u', null), entry('clone-a', 'clone-u', 'assistant', 'A reply'),
    entry('new', 'clone-a', 'user', 'Something different'),
  ], { parentSession: source });
  const { manifest, sessions } = await f.run();
  assert.equal(manifest.counts.userCandidateOccurrences, 4);
  assert.equal(manifest.counts.uniqueUserCandidates, 3);
  assert.equal(manifest.counts.duplicateEntries, 2);
  assert.deepEqual(sessions[0].branchPoints, [{ parentId: 'u', childIds: ['a', 'b'] }]);
  assert.deepEqual(sessions[0].leafIds, ['b', 'u2']);
  assert.equal(sessions[1].records[0].duplicateOf.path, source);
  assert.equal(sessions[1].records[0].duplicateOf.line, 2);
  assert.equal(sessions[1].records[0].parentId, null);
  assert.deepEqual(sessions[1].overviewRecords.map((row) => row.id), ['new']);
});

test('excludes review sessions, subagent directories and explicitly excluded files', async (t) => {
  const f = await fixture(t);
  const current = await f.session('.pi/profiles/work/sessions/project/current.jsonl', [entry('current', null)], { id: 'current-session' });
  await f.session('.pi/profiles/work/sessions/project/same-id.jsonl', [entry('same', null)], { id: 'current-session' });
  const excluded = await f.session('.pi/profiles/work/sessions/project/other-review.jsonl', [entry('other-review', null)]);
  await f.session('.pi/profiles/work/sessions/subagents/subagent-1.jsonl', [entry('delegated', null)]);
  await f.session('.pi/profiles/work/sessions/project/subagent-2.jsonl', [entry('delegated2', null)]);
  await f.session('.pi/profiles/work/sessions/project/human.jsonl', [entry('human', null)]);
  const { manifest } = await f.run({ env: { PI_SESSION_FILE: current, PI_SESSION_ID: 'current-session' }, exclude: [excluded] });
  assert.equal(manifest.counts.sessionFiles, 1);
  assert.equal(manifest.counts.uniqueUserCandidates, 1);
  assert.equal(manifest.excluded.length, 5);
});

test('separates injected messages and skill expansions from user-authored text', async (t) => {
  const f = await fixture(t);
  await f.session('.pi/agent/sessions/project/a.jsonl', [
    entry('peer', null, 'user', '[from agent-123 @ /project]\n\nA delegated request'),
    entry('skill', 'peer', 'user', '<skill name="pair" location="/skills/pair/SKILL.md">\nFollow these instructions.\n</skill>\n\nLook at parser.cc'),
    entry('skill-only', 'skill', 'user', '<skill name="pair" location="/skills/pair/SKILL.md">\nFollow these instructions.\n</skill>'),
    { type: 'custom_message', id: 'result', parentId: 'skill-only', timestamp: DURING, customType: 'subagent-result', content: 'A custom result' },
    entry('custom', 'result', 'custom', 'Extension input'),
  ]);
  const { manifest, sessions } = await f.run();
  assert.equal(manifest.counts.uniqueUserCandidates, 2);
  assert.equal(manifest.counts.uniqueSkillInvocations, 2);
  assert.equal(manifest.counts.injectedUserOccurrences, 1);
  assert.equal(sessions[0].records[1].text, '/skill:pair Look at parser.cc');
  assert.equal(sessions[0].records[2].text, '/skill:pair');
  assert.equal(sessions[0].records[3].kind, 'custom_message');
  assert.equal(sessions[0].records[4].kind, 'custom');
});

test('retains tool provenance, marks previews, and omits thinking, images and system text', async (t) => {
  const f = await fixture(t);
  const system = entry('system', null, 'system', 'Sensitive instructions');
  const assistant = entry('assistant', 'system', 'assistant', 'Running a check');
  assistant.message.content.push({ type: 'thinking', thinking: 'Private reasoning' }, { type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'check' } });
  const result = entry('tool', 'assistant', 'toolResult', 'x'.repeat(5000));
  Object.assign(result.message, { isError: true, toolName: 'bash', toolCallId: 'call' });
  const image = entry('image', 'tool', 'user', 'What is in this image?');
  image.message.content.push({ type: 'image', data: 'BASE64_SECRET', mimeType: 'image/png' });
  await f.session('.pi/agent/sessions/project/a.jsonl', [system, assistant, result, image]);
  const { sessions } = await f.run();
  const records = sessions[0].records;
  assert.equal(records[2].omittedCharacters, 1000);
  assert.equal(records[2].toolCallId, 'call');
  assert.equal(records[2].isError, true);
  assert.deepEqual(records[1].toolCalls, [{ id: 'call', name: 'bash', arguments: { command: 'check' } }]);
  assert.doesNotMatch(JSON.stringify(records), /Sensitive instructions|Private reasoning|BASE64_SECRET/);
});

test('overviews retain full conversation prose but defer tool traffic and context bodies', async (t) => {
  const f = await fixture(t);
  const prompt = 'A long prompt '.repeat(1000);
  const reply = 'A long response '.repeat(1000);
  const toolOnly = entry('call', 'user', 'assistant', '');
  toolOnly.message.content.push({ type: 'toolCall', id: 'tool-call', name: 'write', arguments: { content: 'LARGE_TOOL_ARGUMENT' } });
  const result = entry('result', 'call', 'toolResult', 'LARGE_TOOL_OUTPUT'.repeat(1000));
  const error = entry('error', 'reply', 'toolResult', 'ERROR_DETAILS');
  Object.assign(error.message, { isError: true, toolName: 'bash' });
  const source = await f.session('.pi/agent/sessions/project/a.jsonl', [
    entry('user', null, 'user', prompt), toolOnly, result,
    entry('reply', 'result', 'assistant', reply), error,
    { type: 'compaction', id: 'compact', parentId: 'error', timestamp: DURING, summary: 'SUMMARY_BODY', firstKeptEntryId: 'reply' },
    { type: 'custom_message', id: 'custom', parentId: 'compact', timestamp: DURING, customType: 'subagent-result', content: 'INJECTED_BODY' },
    { type: 'context_edit', id: 'edit', parentId: 'custom', timestamp: DURING, targetId: 'reply', replacement: null },
  ]);
  const { sessions } = await f.run();
  const session = sessions[0];
  assert.deepEqual(session.overviewRecords.map((row) => row.id), ['user', 'reply', 'error', 'compact', 'custom', 'edit']);
  assert.equal(session.overviewRecords[0].text, prompt);
  assert.equal(session.overviewRecords[1].text, reply);
  assert.equal(session.overviewRecords[1].parentId, 'result');
  assert.equal(session.overviewRecords[2].isError, true);
  assert.equal(session.overviewRecords[5].targetId, 'reply');
  for (const row of session.overviewRecords) {
    assert.equal(session.records.find((record) => record.id === row.id).source.path, source);
    assert.equal(session.records.find((record) => record.id === row.id).source.line, row.line);
  }
  assert.doesNotMatch(JSON.stringify(session.overviewRecords), /LARGE_TOOL_ARGUMENT|LARGE_TOOL_OUTPUT|ERROR_DETAILS|SUMMARY_BODY|INJECTED_BODY/);
  assert.ok(session.overviewCharacters < session.extractCharacters);
});

test('records malformed lines, unsupported versions and broken parent links without rewriting sources', async (t) => {
  const f = await fixture(t);
  const file = await f.session('.pi/agent/sessions/project/a.jsonl', ['{unfinished', entry('a', 'missing')]);
  await f.session('.pi/agent/sessions/project/legacy.jsonl', [entry('v1', null)], { version: 1 });
  const before = await readFile(file, 'utf8');
  const { manifest, sessions } = await f.run();
  assert.equal(manifest.warnings.length, 3);
  assert.equal(sessions[0].records[0].source.line, 3);
  assert.equal(await readFile(file, 'utf8'), before);
});

test('honors custom roots and environment, canonicalizing overlapping roots', async (t) => {
  const f = await fixture(t);
  const custom = path.join(f.home, 'custom');
  await f.session('custom/a.jsonl', [entry('a', null)]);
  const alias = path.join(f.home, 'alias');
  await symlink(custom, alias);
  const { manifest } = await f.run({ env: { PI_CODING_AGENT_SESSION_DIR: custom }, roots: [custom, alias] });
  assert.equal(manifest.counts.sessionFiles, 1);
  assert.equal(manifest.counts.duplicateEntries, 0);
});

test('rejects invalid windows and refuses to overwrite an existing review', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ start: 'invalid' }), /Invalid timestamp/);
  await assert.rejects(f.run({ start: END, end: START }), /Start must precede end/);
  await f.run();
  await assert.rejects(f.run(), /EEXIST/);
});

test('uses a fixed 7-day window when only an end is provided', async (t) => {
  const f = await fixture(t);
  const { manifest } = await f.run({ start: undefined });
  assert.equal(manifest.window.start, new Date(START).toISOString());
  assert.equal(manifest.window.end, new Date(END).toISOString());
});
