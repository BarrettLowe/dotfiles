# Opt-in Ornith support

Run `pi-local` after reloading `.zshrc`, or load the entry point explicitly:

```sh
pi --extension "$HOME/dotfiles/pi/manual-extensions/local-model-support/index.ts" --model llama.cpp/ornith_1.5
```

`pi-local` calls the existing `pi` wrapper. It keeps the current profile and
normally loaded extensions; it does not create a profile or change settings.
Arguments follow the defaults, so `pi-local --model openai/gpt-4.1` overrides
the model. The hooks act only on provider `llama.cpp` with an Ornith family ID
(case-insensitive `ornith`, or a numeric version after `-`/`_`, optionally
followed by a model/quantization suffix). The work model catalog has
`ornith_1.0` and `ornith_1.5`; the default is `ornith_1.5`, which supports
thinking. `ornith_1.0` does not advertise reasoning.

`index.ts` loads 3 separate behaviors without registering tools:

- `read-guard.ts`: trim oversized text read results.
- `skill-inject.ts`: supply selected tool-use guidance.
- `thinking-budget.ts`: limit local output and excessive thinking.

This directory stays outside Pi's automatically discovered extension directories.
`ai/sync.sh` does not link `manual-extensions` into profiles. Load only `index.ts`,
not the individual modules as well.

## Behavior and limits

- Read guard: reserves the output cap plus 1024 tokens before admitting a text
  read. Reads share a per-turn allowance, charged for both unchanged and trimmed
  results. Parallel reads share that allowance; changing live usage does not
  double-charge earlier reads. If usage is unknown, reads share 25% of the usable
  window; if the window is unknown, it assumes 32768 tokens. It preserves the
  requested segment and line offsets, with continuation advice. An exhausted
  budget still allows a 64-character notice from the overhead reserve, so the
  limit is advisory. Images, failed reads, and other tools are not budgeted.
- Tool guidance: selects active tool cards from failures, the last 2 successful
  tools, and prompt keywords. Tail messages have a 450-estimated-token ceiling
  (or a smaller output budget) and do not replace the system prompt. Guidance
  items are deduplicated within the current runtime/session instance. Reload,
  resume, or `session_start` resets that state; saved history does not preserve
  it. Compaction does not restore removed guidance. Failed results get immediate
  recovery advice without an extra turn.
- Thinking budget: caps outgoing tokens and allows thinking up to the smaller
  of half the output cap or the cap minus 1024 tokens (2048 at the default cap).
  Exceeding the streamed estimate stops the request without queuing a retry.
  A naturally length-limited, thinking-only response can get 1 boundary retry
  with thinking off, but only with matching `qwen-chat-template` metadata, a
  supported `off` mapping, and a boolean `enable_thinking` in the prepared
  request. Output limits below 1 whole token cause an explicit stop, not a
  `max_tokens: 0` request.
  Session thinking settings stay unchanged. Queuing follow-up or steering input
  keeps the active stream's budget in place, but the superseded response cannot
  trigger recovery. Matching genuine input resets the next task's controls and
  retry allowance on delivery, not on queuing. Matching uses text, ordered images,
  and source; extension steering cannot consume a genuine task's reset. Pi's
  public API lacks delivered-source metadata and queue IDs, so known identical
  mixed-source entries or rewritten inputs conservatively retain controls.
  Submit fresh genuine input while idle to clear stopped/thinking-off controls.
  Agent continuations do not grant another retry; a session reset clears controls.

These guards do not guarantee that the entire prompt fits the context window.
The character estimate can differ from actual tokenizer usage. The loaded
server template supports `enable_thinking` according to its metadata, but live
inference has not verified that the server obeys the thinking-off switch.

## Shared defaults

These are arbitrary conservative defaults, not measured Ornith limits:

- Output cap: 4096 tokens, reduced to a smaller positive advertised `maxTokens`
  and rounded down to whole tokens. A positive limit below 1 yields 0; that
  metadata cannot accommodate a whole output token, so the thinking guard stops
  the request explicitly.
- Output reserve: 1024 tokens.
- Token estimate: character count / 3.5, rounded up. This is not a tokenizer.

The local llama.cpp provider and model must already be available. This extension
does not install a model, start a server, or add a provider. It does not schedule
subagents, manage tmux, or impose a turn cap.

## Source and changes

The behaviors adapt [little-coder](https://github.com/itayinbarr/little-coder)
1.20.0, Apache-2.0. Source: the npm `little-coder@1.20.0` tarball, specifically
`.pi/extensions/read-guard/`, `skill-inject/`, and `thinking-budget/`.

Local changes separate these hooks from the little-coder application, add an
Ornith-only model check, and use Pi's existing tools and shell profile wrapper.
The upstream license and attribution notices are preserved in [LICENSE](LICENSE)
and [NOTICE](NOTICE).

## Tests

```sh
node --test pi/tests/local-model-support.test.mjs \
  pi/tests/local-read-guard.test.mjs \
  pi/tests/local-skill-inject.test.mjs \
  pi/tests/local-thinking-budget.test.mjs
```

The tests use the installed Pi extension loader and a real zsh process, without
sourcing the rest of `.zshrc` or running live model inference. Provider requests
in the thinking tests are mocked.
