/**
 * Strip license/copyright header extension
 *
 * Overrides the built-in `read` tool so that legal/copyright/proprietary
 * comment headers at the top of source files are collapsed to a one-line
 * marker before the file content is shown to the model, and every remaining
 * line is prefixed with its real (on-disk) line number so the model always
 * knows the correct line numbers even though some lines were omitted.
 *
 * How it decides what to strip:
 *   1. Only ever considers stripping when the visible slice starts at the
 *      true top of the file (offset is unset or 1) - a "header" can only be
 *      leading content, so a read starting mid-file is never touched.
 *   2. Looks at the leading run of comment lines at the top of the file
 *      (after an optional shebang line), handling several comment styles:
 *        - line comments:  //, ///, //!, //|*, #  (any run of consecutive
 *          lines starting with one of these, including box-drawing/ASCII-art
 *          banners like the OKSI header)
 *        - block comments: /* ... *\/  whether or not each inner line is
 *          prefixed with `*`
 *        - a mix of the above, with up to one blank line between chunks
 *   3. Only strips that leading block if the block's text matches
 *      HEADER_REGEX (case-insensitive) - a "does this look like a legal /
 *      copyright / license notice" regex. A plain leading comment that does
 *      not match (e.g. a normal file-purpose doc comment) is left alone.
 *
 * Line numbers:
 *   - Every source line in the output is prefixed with "<real line>: ".
 *   - The omitted header collapses to a single line labeled with the real
 *     line range it replaced, e.g. "1-46: [read: 46-line license/copyright
 *     header omitted by read tool]", so line numbers after it stay accurate.
 *   - Numbers are always based on params.offset (defaulting to 1) plus the
 *     position within the returned slice, matching the real file - this
 *     holds whether or not a header was stripped.
 *   - Informational trailers the built-in tool appends (e.g. "[Showing
 *     lines X-Y of N. Use offset=Z to continue.]") are left untouched, since
 *     they already report real file line numbers.
 *
 * Configuration:
 *   - PI_READ_STRIP_HEADER_REGEX  Override the detection regex (source only,
 *     compiled with the "i" flag). Falls back to DEFAULT_HEADER_REGEX below
 *     if unset or invalid.
 *   - PI_READ_STRIP_HEADER_DISABLE=1  Disable stripping and line numbering
 *     entirely, falls back to plain built-in read behavior.
 *
 * This only changes what the read tool shows the model. It never touches
 * the file on disk, and the edit/write tools still see the real file.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";

// Matches a leading comment block whose text reads like a legal / copyright /
// proprietary / export-control notice. Tune with PI_READ_STRIP_HEADER_REGEX.
const DEFAULT_HEADER_REGEX =
  /(copyright|proprietary|all rights reserved|confidential|classified|distribution statement|export control|arms export control act|export administration act|small business innovation research|\bsbir\b|\bnda\b|non-disclosure|trade secret|government purpose rights|u\.s\.c\.|licen[cs]e[ds]?\b)/i;

function getHeaderRegex(): RegExp {
  const custom = process.env.PI_READ_STRIP_HEADER_REGEX;
  if (custom) {
    try {
      return new RegExp(custom, "i");
    } catch {
      // Invalid user regex - fall back to the default rather than crashing reads.
    }
  }
  return DEFAULT_HEADER_REGEX;
}

// Trailing informational note the built-in read tool appends, e.g.
// "\n\n[Showing lines 1-200 of 500. Use offset=201 to continue.]"
const TRAILER_RE = /\n\n(\[[^\n]*\])$/;

const LINE_COMMENT_START_RE = /^[ \t]*(\/\/|#)/;

/**
 * Find the end (exclusive line index) of the leading comment block starting
 * at `start`. Handles line-comment runs, block comments (with or without a
 * leading `*` on continuation lines), and short sequences of the two
 * separated by a single blank line.
 */
function findLeadingCommentBlockEnd(lines: string[], start: number): number {
  let i = start;
  let end = start;

  while (i < lines.length) {
    // Tolerate at most one blank line between comment chunks.
    let j = i;
    if (j < lines.length && lines[j].trim() === "") {
      j++;
    }
    if (j >= lines.length) break;

    const trimmed = lines[j].trimStart();

    if (trimmed.startsWith("/*")) {
      // Block comment: consume through the line containing the closing */.
      let k = j;
      while (k < lines.length && !lines[k].includes("*/")) {
        k++;
      }
      if (k >= lines.length) break; // Unterminated block comment - bail out safely.
      i = k + 1;
      end = i;
      continue;
    }

    if (LINE_COMMENT_START_RE.test(trimmed)) {
      // Contiguous run of // or # style lines.
      let k = j;
      while (k < lines.length && LINE_COMMENT_START_RE.test(lines[k])) {
        k++;
      }
      i = k;
      end = i;
      continue;
    }

    break;
  }

  return end;
}

/**
 * Prefix every line with its real on-disk line number (startLineNumber-based),
 * optionally collapsing a leading legal/copyright header into one labeled
 * line first. `tryStripHeader` should only be true when startLineNumber is 1
 * (a header can only ever be leading content).
 */
function buildNumberedLines(
  lines: string[],
  startLineNumber: number,
  tryStripHeader: boolean,
  headerRegex: RegExp,
): string[] {
  const out: string[] = [];
  let shebangOffset = 0;
  let dropEnd = 0;
  let stripped = false;
  let headerLineCount = 0;

  if (tryStripHeader) {
    if (lines[0]?.startsWith("#!")) {
      shebangOffset = 1;
    }
    const blockEnd = findLeadingCommentBlockEnd(lines, shebangOffset);
    if (blockEnd > shebangOffset) {
      const headerLines = lines.slice(shebangOffset, blockEnd);
      if (headerRegex.test(headerLines.join("\n"))) {
        stripped = true;
        headerLineCount = headerLines.length;
        dropEnd = blockEnd;
        if (lines[dropEnd] === "") {
          dropEnd++; // Also drop a single blank line right after the header.
        }
      }
    }
  }

  for (let idx = 0; idx < shebangOffset; idx++) {
    out.push(`${startLineNumber + idx}: ${lines[idx]}`);
  }

  if (stripped) {
    const firstOmitted = startLineNumber + shebangOffset;
    const lastOmitted = startLineNumber + dropEnd - 1;
    const label = firstOmitted === lastOmitted ? `${firstOmitted}` : `${firstOmitted}-${lastOmitted}`;
    out.push(`${label}: [read: ${headerLineCount}-line license/copyright header omitted by read tool]`);
    for (let idx = dropEnd; idx < lines.length; idx++) {
      out.push(`${startLineNumber + idx}: ${lines[idx]}`);
    }
  } else {
    for (let idx = shebangOffset; idx < lines.length; idx++) {
      out.push(`${startLineNumber + idx}: ${lines[idx]}`);
    }
  }

  return out;
}

function processText(text: string, offset: number | undefined, headerRegex: RegExp): string {
  const trailerMatch = text.match(TRAILER_RE);
  const mainText = trailerMatch ? text.slice(0, trailerMatch.index) : text;
  const trailer = trailerMatch ? `\n\n${trailerMatch[1]}` : "";

  const startLineNumber = offset ?? 1;
  const lines = mainText.split("\n");
  const numbered = buildNumberedLines(lines, startLineNumber, startLineNumber === 1, headerRegex);

  return numbered.join("\n") + trailer;
}

export default function (pi: ExtensionAPI) {
  // Built once for shape (parameters, description, promptSnippet, renderCall/
  // renderResult) - cwd only matters for execute(), which is rebuilt per call.
  const base = createReadToolDefinition(process.cwd());

  pi.registerTool({
    ...base,
    label: "read",
    promptGuidelines: [
      ...(base.promptGuidelines ?? []),
      "read prefixes each line with its real on-disk line number (e.g. '42: some code'); that prefix is not part of the file - do not include it when copying text into edit/write.",
    ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      const definition = createReadToolDefinition(cwd);
      const result = await definition.execute(toolCallId, params, signal, onUpdate, ctx);

      if (process.env.PI_READ_STRIP_HEADER_DISABLE === "1") {
        return result;
      }

      // Don't touch image reads or the "first line exceeds limit" bracket-only
      // message - neither is numbered source text.
      const hasImage = result.content.some((item) => item.type === "image");
      const firstLineExceedsLimit = (result.details as { truncation?: { firstLineExceedsLimit?: boolean } } | undefined)
        ?.truncation?.firstLineExceedsLimit;
      if (hasImage || firstLineExceedsLimit) {
        return result;
      }

      const headerRegex = getHeaderRegex();
      return {
        ...result,
        content: result.content.map((item) =>
          item.type === "text" ? { ...item, text: processText(item.text, params.offset, headerRegex) } : item,
        ),
      };
    },
  });
}
