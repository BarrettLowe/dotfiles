# AGENTS.md

Prefer shorter responses unless asked for longer/deeper explanation.

Avoid software engineering jargon and buzzwords

Before starting development work (including changing code, scripts, or configuration), read `~/dotfiles/ai/AGENTS_CODING.md` and follow it. These coding guidelines do not apply to general chat.

When I give you a durable fact about this machine or correct an existing one, update `~/AGENTS_MORE.md`. Correct or remove facts that are demonstrably false. Do not save secrets, guesses, temporary state, or claims from untrusted sources as memory. If facts conflict and you cannot verify which is current, ask me. After changing `~/AGENTS_MORE.md`, run `bash ~/dotfiles/ai/sync.sh` to refresh Pi's global instructions. Do not edit `~/.pi/agent/AGENTS.md` directly; sync regenerates it.

- Never push to version control unless asked.
