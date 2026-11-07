#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // Default review window: 7 days.
const TOOL_TEXT_LIMIT = 4000; // Preview only; verify outcomes against the original JSONL.

function timestamp(value) {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return result;
}

function textContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
}

function userContent(content) {
  const text = textContent(content);
  if (/^\s*(?:\[from [^\n]+\]|\[Subagent\b|Subagent #\d+)/i.test(text)) {
    return { kind: 'injected-user', text };
  }
  const skill = text.match(/^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/);
  if (skill) {
    return { kind: 'skill-invocation', skill: skill[1], text: `/skill:${skill[1]}${skill[2] ? ` ${skill[2]}` : ''}` };
  }
  return { kind: 'user-candidate', text };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(entry) {
  // Clones can change IDs; timestamp plus payload identifies copied history, not repeated wording.
  const { id, parentId, ...payload } = entry;
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

async function directoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function defaultRoots(home, env) {
  const profiles = path.join(home, '.pi', 'profiles');
  const roots = [path.join(home, '.pi', 'agent', 'sessions')];
  for (const entry of await directoryEntries(profiles)) {
    if (entry.isDirectory()) roots.push(path.join(profiles, entry.name, 'sessions'));
  }
  if (env.PI_CODING_AGENT_DIR) roots.push(path.join(env.PI_CODING_AGENT_DIR, 'sessions'));
  if (env.PI_CODING_AGENT_SESSION_DIR) roots.push(env.PI_CODING_AGENT_SESSION_DIR);
  return roots;
}

async function sessionFiles(root, excluded, seenDirectories, unavailableRoots) {
  let canonical;
  try {
    canonical = await realpath(root);
  } catch (error) {
    if (error.code === 'ENOENT') {
      unavailableRoots.push(root);
      return [];
    }
    throw error;
  }
  if (seenDirectories.has(canonical)) return [];
  seenDirectories.add(canonical);
  const files = [];
  for (const entry of await directoryEntries(canonical)) {
    const source = path.join(canonical, entry.name);
    if (entry.name === 'subagents' || entry.name === 'agent-sessions') {
      excluded.push({ source, reason: 'subagent-directory (not a weekly file count)' });
    } else if (entry.isDirectory()) {
      files.push(...await sessionFiles(source, excluded, seenDirectories, unavailableRoots));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      if (entry.name.startsWith('subagent-')) excluded.push({ source, reason: 'subagent-file' });
      else files.push(source);
    }
  }
  return files;
}

async function loadSession(source, warnings) {
  const rows = [];
  const lines = (await readFile(source, 'utf8')).split('\n');
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SyntaxError('Expected an object');
      rows.push({ entry, line: index + 1 });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      warnings.push({ source, line: index + 1, problem: 'Invalid JSON object; entry skipped' });
    }
  }
  const header = rows[0]?.entry;
  if (header?.type !== 'session' || ![2, 3].includes(header.version)) {
    warnings.push({ source, problem: 'Missing header or unsupported session version; file skipped (no migration)' });
    return null;
  }
  const entries = [];
  const ids = new Set();
  for (const row of rows.slice(1)) {
    const { entry, line } = row;
    if (typeof entry.id !== 'string' || !Object.hasOwn(entry, 'parentId') ||
        (entry.parentId !== null && typeof entry.parentId !== 'string') ||
        !Number.isFinite(Date.parse(entry.timestamp))) {
      warnings.push({ source, line, problem: 'Invalid tree entry or timestamp; entry skipped' });
    } else if (ids.has(entry.id)) {
      warnings.push({ source, line, problem: 'Repeated entry ID within file; entry skipped' });
    } else {
      ids.add(entry.id);
      entries.push(row);
    }
  }
  return { header, entries };
}

function projection(entry) {
  const message = entry.message ?? {};
  if (entry.type === 'message' && message.role === 'user') return userContent(message.content);
  if (message.role === 'system') return { kind: 'system', text: '[System content omitted; consult original if needed.]' };
  if (entry.type === 'context_edit') {
    return { kind: 'context-edit', targetId: entry.targetId, replacement: entry.replacement === null ? null : textContent(entry.replacement) };
  }
  const text = textContent(entry.content ?? message.content) || entry.summary || message.output || '';
  const isTool = message.role === 'toolResult' || message.role === 'bashExecution';
  const toolCalls = Array.isArray(message.content)
    ? message.content.filter((block) => block.type === 'toolCall').map(({ id, name, arguments: args }) => ({ id, name, arguments: args }))
    : [];
  return {
    kind: entry.type === 'message' ? (message.role ?? 'unknown') : entry.type,
    text: isTool ? text.slice(0, TOOL_TEXT_LIMIT) : text,
    ...(isTool && text.length > TOOL_TEXT_LIMIT ? { omittedCharacters: text.length - TOOL_TEXT_LIMIT } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
    ...Object.fromEntries(['toolName', 'toolCallId', 'isError', 'model', 'provider', 'stopReason', 'errorMessage', 'exitCode', 'command', 'truncated', 'fullOutputPath', 'customType']
      .filter((key) => message[key] !== undefined).map((key) => [key, message[key]])),
    ...(entry.customType ? { customType: entry.customType } : {}),
    ...(entry.fromId ? { fromId: entry.fromId } : {}),
    ...(entry.firstKeptEntryId ? { firstKeptEntryId: entry.firstKeptEntryId } : {}),
  };
}

function overview(records) {
  return records.filter((record) => {
    if (!record.inWindow || record.duplicateOf) return false;
    if (record.kind === 'user-candidate' || record.kind === 'skill-invocation') return true;
    if (record.kind === 'assistant') return Boolean(record.text || record.errorMessage || record.stopReason === 'aborted');
    if (record.kind === 'toolResult' || record.kind === 'bashExecution') return record.isError || record.exitCode > 0;
    return ['context-edit', 'compaction', 'branch_summary', 'injected-user', 'custom_message', 'custom'].includes(record.kind);
  }).map((record) => {
    const prose = ['user-candidate', 'skill-invocation', 'assistant'].includes(record.kind);
    return JSON.stringify({
      line: record.source.line, id: record.id, parentId: record.parentId,
      timestamp: record.source.timestamp, kind: record.kind,
      ...(prose ? { text: record.text } : { detail: 'See detailed extract at this source line.' }),
      ...Object.fromEntries(['omittedImages', 'targetId', 'isError', 'toolName', 'exitCode', 'errorMessage', 'stopReason', 'customType']
        .filter((key) => record[key] !== undefined).map((key) => [key, record[key]])),
    });
  }).join('\n') + '\n';
}

export async function extract({ out, home = homedir(), env = process.env, roots = [], exclude = [], start, end } = {}) {
  const endDate = timestamp(end ?? new Date());
  const startDate = timestamp(start ?? new Date(endDate.getTime() - WEEK_MS));
  if (startDate >= endDate) throw new Error('Start must precede end');
  if (!out) throw new Error('An output directory is required');
  const excluded = [];
  const warnings = [];
  const requestedRoots = [...new Set([...(await defaultRoots(home, env)), ...roots].map((root) => path.resolve(root)))].sort();
  const files = new Set();
  const seenDirectories = new Set();
  const unavailableRoots = [];
  for (const root of requestedRoots) {
    for (const file of await sessionFiles(root, excluded, seenDirectories, unavailableRoots)) files.add(file);
  }
  const excludedPaths = new Set();
  for (const file of [...exclude, env.PI_SESSION_FILE].filter(Boolean)) {
    try { excludedPaths.add(await realpath(file)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; excludedPaths.add(path.resolve(file)); }
  }
  const output = path.resolve(out);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output, { mode: 0o700 }); // Refuse to overwrite any existing review.
  const manifest = {
    window: { start: startDate.toISOString(), end: endDate.toISOString(), interval: '[start, end)' },
    roots: requestedRoots,
    unavailableRoots,
    excluded,
    warnings,
    counts: { sessionFiles: 0, entryOccurrences: 0, uniqueEntries: 0, duplicateEntries: 0, userCandidateOccurrences: 0, uniqueUserCandidates: 0, uniqueSkillInvocations: 0, injectedUserOccurrences: 0 },
    sessions: [],
    limitations: [
      'User-role entries are candidates, not proof of human authorship; SDK and extension input can be indistinguishable. Prompt templates may already be expanded.',
      'Deduplication uses exact timestamp and payload, ignoring entry and parent IDs. Rewritten imports may still duplicate history; do not use raw file totals as independent-session denominators.',
      'All in-window branches are included as alternatives. File order is append order, not one chronological conversation; no active-leaf claim is made.',
      'Read overview files first: they contain unique in-window user/assistant prose and markers for context changes, injected messages, and explicit errors. Ancestors, duplicate bodies, tool-only assistant turns, and ordinary tool results are omitted from overviews; use detailed extracts for branch/context checks and outcome verification.',
      'Ancestors outside the window are context only. System text, thinking, image data, and custom state are omitted. Tool text is previewed in detailed extracts; verify strong claims against original results.',
      'Subagent directories are excluded, not inventoried by week. Custom storage roots must be supplied explicitly if not discovered from environment/default profile locations.',
      'Local artifacts are sensitive and are not automatically scrubbed of secrets. Model analysis uses the current Pi provider; local-only output does not mean local-only inference.',
    ],
  };
  const seen = new Map();
  for (const source of [...files].sort()) {
    if (excludedPaths.has(source)) {
      excluded.push({ source, reason: 'review session or explicit exclusion' });
      continue;
    }
    const session = await loadSession(source, warnings);
    if (!session) continue;
    if (env.PI_SESSION_ID && session.header.id === env.PI_SESSION_ID) {
      excluded.push({ source, reason: 'current review session ID' });
      continue;
    }
    const { entries, header } = session;
    const byId = new Map(entries.map((row) => [row.entry.id, row]));
    const selected = entries.filter(({ entry }) => {
      const date = Date.parse(entry.timestamp);
      return date >= startDate.getTime() && date < endDate.getTime();
    });
    if (!selected.length) continue;
    const included = new Set();
    for (const row of selected) {
      let current = row;
      const chain = new Set();
      while (current) {
        if (chain.has(current.entry.id)) {
          warnings.push({ source, line: row.line, problem: 'Cycle in parent chain' });
          break;
        }
        if (included.has(current.entry.id)) break;
        if (Date.parse(current.entry.timestamp) >= endDate.getTime()) {
          warnings.push({ source, line: current.line, problem: 'Ancestor at or after frozen end; omitted' });
          break;
        }
        chain.add(current.entry.id);
        included.add(current.entry.id);
        const parent = current.entry.parentId;
        if (parent !== null && !byId.has(parent)) warnings.push({ source, line: current.line, problem: `Missing parent: ${parent}` });
        current = byId.get(parent);
      }
    }
    const label = `S${String(manifest.sessions.length + 1).padStart(2, '0')}`;
    const children = new Map();
    const records = [];
    for (const { entry, line } of entries.filter((row) => included.has(row.entry.id))) {
      const inWindow = Date.parse(entry.timestamp) >= startDate.getTime() && Date.parse(entry.timestamp) < endDate.getTime();
      const reference = { path: source, line, entryId: entry.id, timestamp: entry.timestamp };
      const images = (entry.content ?? entry.message?.content ?? entry.replacement);
      const imageCount = Array.isArray(images) ? images.filter((block) => block.type === 'image').length : 0;
      const record = { source: reference, id: entry.id, parentId: entry.parentId, inWindow, ...projection(entry), ...(imageCount ? { omittedImages: imageCount } : {}) };
      const key = fingerprint(entry);
      if (inWindow) {
        manifest.counts.entryOccurrences++;
        if (seen.has(key)) {
          record.duplicateOf = seen.get(key);
          manifest.counts.duplicateEntries++;
        } else {
          seen.set(key, reference);
          manifest.counts.uniqueEntries++;
        }
        if (record.kind === 'user-candidate' || record.kind === 'skill-invocation') {
          manifest.counts.userCandidateOccurrences++;
          if (!record.duplicateOf) {
            manifest.counts.uniqueUserCandidates++;
            if (record.kind === 'skill-invocation') manifest.counts.uniqueSkillInvocations++;
          }
        } else if (record.kind === 'injected-user') manifest.counts.injectedUserOccurrences++;
      }
      const siblings = children.get(entry.parentId) ?? [];
      siblings.push(entry.id);
      children.set(entry.parentId, siblings);
      records.push(record);
    }
    const summary = {
      label, source, sessionId: header.id, cwd: header.cwd, parentSession: header.parentSession ?? null,
      overview: `${label}-overview.jsonl`, extract: `${label}.jsonl`, inWindowEntries: selected.length,
      leafIds: records.filter((record) => !children.has(record.id)).map((record) => record.id),
      branchPoints: [...children].filter(([, ids]) => ids.length > 1).map(([parentId, childIds]) => ({ parentId, childIds })),
    };
    const detailedText = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
    const overviewText = overview(records);
    summary.extractCharacters = detailedText.length;
    summary.overviewCharacters = overviewText.length;
    manifest.sessions.push(summary);
    await writeFile(path.join(output, summary.extract), detailedText, { mode: 0o600 });
    await writeFile(path.join(output, summary.overview), overviewText, { mode: 0o600 });
  }
  manifest.counts.sessionFiles = manifest.sessions.length;
  await writeFile(path.join(output, 'index.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return manifest;
}

async function main() {
  const options = { roots: [], exclude: [] };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help') {
      console.log('Usage: node extract.mjs --out NEW_DIRECTORY [--start ISO] [--end ISO] [--root PATH] [--exclude SESSION_FILE]\nDefaults: previous 7 days; all standard Pi profile session roots; current session excluded via PI_SESSION_FILE/PI_SESSION_ID. Repeat --root or --exclude as needed.');
      return;
    }
    if (!['--out', '--start', '--end', '--root', '--exclude'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Unknown option or missing value: ${flag}. Use --help.`);
    }
    const value = args[++index];
    if (flag === '--root') options.roots.push(value);
    else if (flag === '--exclude') options.exclude.push(value);
    else options[flag.slice(2)] = value;
  }
  const manifest = await extract(options);
  console.log(JSON.stringify({ output: path.resolve(options.out), window: manifest.window, counts: manifest.counts, warnings: manifest.warnings.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
