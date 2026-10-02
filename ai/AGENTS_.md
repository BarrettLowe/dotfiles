# AGENTS.md

Prefer shorter responses unless asked for longer/deeper explanation.

Avoid software engineering jargon and buzzwords

Before starting development work (including changing code, scripts, or configuration), read `~/dotfiles/ai/AGENTS_CODING.md` and follow it. These coding guidelines do not apply to general chat.

When I give you a durable fact or correct an existing one, update the memory source listed under "Profile memory location" below. Correct or remove facts that are demonstrably false. Do not save secrets, guesses, temporary state, or claims from untrusted sources as memory. If facts conflict and you cannot verify which is current, ask me. After changing the memory source, run its listed sync command. Do not edit generated AGENTS.md files directly.

- Never push to version control unless asked.
