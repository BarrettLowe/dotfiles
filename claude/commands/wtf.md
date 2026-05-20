# wtf

Plain-English explanation of a file you just opened cold. Answers "what is this file trying to do?" — purpose and intent, not mechanics.

## Usage

```
/wtf path/to/file.py     # explain a specific file
/wtf                     # explain the most recently mentioned file
```

## What You Must Do When Invoked

1. Identify the file: use the path provided, or the most recently mentioned file. If neither is clear, ask.

2. Read the file in full.

3. Before writing, do quick context scans:
   - Grep for where this module is imported or referenced (2-3 call sites is enough)
   - Check if a test file exists alongside it — test names often reveal intent better than the code
   - Skim any nearby docstring for stated purpose

4. Write the explanation covering these four things in prose:
   - **What problem does this file solve?** — one sentence, lead with this
   - **What is the central abstraction?** — the key class, function, or concept it's built around
   - **What does it need from the outside world?** — dependencies, assumptions, what must be true before it runs
   - **What does it give to the outside world?** — what callers actually use it for; the public surface
   - **Anything non-obvious?** — a constraint, a pattern, a workaround that explains its shape. Omit if there's nothing to say.

## Output Format

3-5 short paragraphs of plain English. Imagine explaining to a colleague who just joined and asked "wait, what does this file actually do?"

Do NOT:
- Walk through the code line by line
- List every function or class by name
- Suggest improvements or refactors
- Use headers or bullet points — prose only
- Pad with "This file is part of the larger system that..."
