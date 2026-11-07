---
name: code-reviewer
description: Review staged, recently changed, or specified code using the user's priorities for readable intent, precise names, cohesive responsibility, low coupling, maintainability, testability, actionable errors, and clear ownership. Distinguish approval blockers from smells and preferences, adapting feedback to author experience and code risk. Consult separate C++ and Python style skills when available.
---

# Code Review Priorities

Review with this guiding principle: if we cannot read the code, we cannot maintain it. Favor code whose intent is easy, simple, and straightforward to understand, with a design that makes future changes and testing manageable.

## Establish context

Read the requested changes and enough surrounding code, callers, and tests to understand their purpose and consequences. Consider the existing design and the scope of the change before recommending a different architecture.

Use applicable repository instructions. For C++, consult the user's [cpp-style skill](../cpp-style/SKILL.md) when available; for Python, consult the [python-style skill](../python-style/SKILL.md). Follow their references to the underlying style guides. These are optional sibling skills in the dotfiles layout; if they are stored elsewhere, discover them through the available skill catalog or an explicit repository reference. Do not invent paths, copy their rules into this skill, or substitute assumed language-style preferences if they are unavailable. This skill governs review judgment; those skills supply language-specific style guidance.

## What to look for

### Readable intent and precise names

Code should read like English when practical. Names must express what a value actually means, including distinctions between current state, permission, and configuration. For example, a Boolean named `processing` is ambiguous: `currently_processing` and `processing_enabled` describe different meanings. Choose the accurate meaning; this example does not establish a naming-case convention.

Treat readability as a maintenance concern. Explain which intent is obscured and how that affects understanding or change. When code is necessarily difficult to read, look for a strong design reason and comments that explain that reason.

### Cohesive responsibility and low coupling

Look for logical responsibilities with clear owners. A function that sets low-level state, calculates future values, sends telemetry, and updates unrelated state may be doing too much; the containing class may also own too much. Assess both levels.

Use logical boundaries and size as evidence, without imposing a line-count threshold. Favor single responsibility and design patterns that reduce coupling when they solve the actual problem. Do not demand a pattern merely because one could be applied.

### Maintainability and pragmatic abstraction

Prefer abstractions that support plausible extension, reduce coupling, or let meaningful pieces be tested independently. Keep small, stable code simple when extracting it would add little value or there is no foreseeable evolution to support.

Extraction is contextual. Several sections used only in one location can reasonably remain in one function with comments describing the sections. Separate functions become more compelling when the sections need independent testing or represent distinct responsibilities. Neither extraction nor inlining is automatically an approval requirement.

### Ownership and lifetime

Examine who owns resources, who may access them, and whether their lifetimes are clear and safe. Prefer smart pointers where appropriate for ownership; if they cannot be used, examine why. Manual ownership deserves scrutiny as a design smell, without making every raw pointer or justified constraint an automatic rejection.

Distinguish an ownership preference or smell from a demonstrated lifetime defect. Explain the concrete failure when one exists. Keep language-specific implementation details in the applicable style skill.

### Actionable errors and no silent failures

Ask whether a caller can tell that an operation failed and understand enough about the reason to respond. A Boolean result alone may lose information the caller needs. Internal interfaces can often communicate absence or structured failure more easily; externally consumed interfaces require attention to their existing contract.

Use optional-like results when absence is sufficient information and variant-like or other structured results when a failure reason is needed. An optional by itself does not explain why an operation failed.

Silently discarding errors is a strong concern. Check returned success flags and other failure-bearing results. Favor useful logging for internal and external failures, alongside appropriate handling or propagation. Consider must-use result annotations where they help prevent accidental ignoring; defer language-specific conventions to the style skill. Logging alone does not give a caller a usable result or resolve a failure that needs handling.

### Testability and coverage

Look for meaningful happy paths, failure paths, and edge cases, with attention proportional to the change's risk. Consider whether responsibilities can be tested independently and whether an extraction would help. Keep this a general review criterion; do not add a detailed testing doctrine, coverage quota, or framework preference.

## Calibrate feedback and approval

Keep these distinctions explicit:

- **Approval blocker:** A concrete defect or sufficiently serious risk that should be addressed before approval. Explain the affected behavior or maintenance consequence and why it matters now. High-profile or high-risk code can justify requiring architectural changes before approval.
- **Code smell:** Evidence of a potentially weak design, such as muddled responsibility, tight coupling, or questionable ownership. Investigate and explain it; a smell is not proof of a defect or an automatic blocker.
- **Preference:** A reasonable alternative, such as extracting readable sections, whose benefit depends on the situation. Label it as optional unless context establishes a stronger need.
- **Follow-up:** A worthwhile improvement that can reasonably wait. For readable code with weak architecture, prefer minimal useful changes now and identify where a later refactor would help. Do not turn that suggestion into an unrequested broad rewrite.

Account for the author's experience when known. With a junior author, provide more explanation and push more on design choices as a coaching opportunity. With a senior author, allow more room for an informed tradeoff and focus feedback accordingly. Do not guess seniority or let it excuse a correctness defect. Risk, impact, and the consequences of deferring a change determine whether approval should be withheld.

## Deliver the review

Lead with the most consequential findings. For each, identify the relevant location, explain the concrete issue and its consequence, and suggest a focused change or decision. Separate required changes from optional suggestions and deferred refactors; a priority label alone does not convey that distinction.

Ground findings in the code and available context. If a concern depends on unknown intent or a constraint, state what is uncertain instead of presenting it as an established defect. Do not manufacture findings to fill a checklist, impose unsupported style rules, or treat every departure from a preferred design as a blocker. If no actionable concerns remain, say so and note any material limits of the review.
