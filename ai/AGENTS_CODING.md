# Coding guidelines

## General

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Notes

- Never spell out numbers (four -> 4)
- Be terse for inline and oneline comments. Use complete sentances only when necessary.

### Hardcoded values

When using any hardcoded values/hex etc, always include a brief comment explaining

```cpp
if (some_val < 5) // 5 - arbitrary threshold
{/*whatever*/}

float delta = prev_val - 0.0000001; //subtract negligible small value

// 0xAB - msg type
// 0x1 - length of payload
// 0x1234 - checksum
int[] = {0xAB, 0x1, 0x1234};

```

## Engineering Principles

Readability is the highest priority. Code should communicate
its purpose and organization without requiring the author
to explain it.

- Use descriptive, concise names for functions, variables,
  classes, and modules.
- Give each component a clear, focused responsibility.
- Keep control flow understandable and predictable.
- Use comments to explain intent, decisions, and
  non-obvious behavior—not to restate the code.
- Prefer simple changes for one-off functionality.
- Introduce abstractions when there is demonstrated or
  reasonably anticipated reuse.
- Test public behavior with automated tests.
- Verify integration or hardware behavior when applicable.

These are expectations for the resulting software, not
a mandatory implementation methodology.

For substantial feature development or architectural
changes, use the software-development skill.

### Comments
Use comments to explain intent, decisions, and non-obvious behavior—not to restate code.

Separate distinct functional sections in a function or method with a blank line. Add a short comment at the beginning of a section when its purpose or intent is not clear from the code. Keep section comments to roughly 80 characters or less.

