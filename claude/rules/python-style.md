---
description: Barrett's Python style conventions — applied automatically when writing or reviewing Python files.
paths: ["**/*.py"]
---

# Python Style Conventions

## General
Utilize object oriented patterns to their maximum functionality. Avoid free functions unless a the functionality in a class truly nothing. 

- Avoid advanced features like metaclasses - these tend to be hard do read and understand

## Type Annotations

- Annotate everything: parameters, return types, class attributes.
- Use `from __future__ import annotations` at the top of every module.
- Prefer `X | None` over `Optional[X]`.
- Prefer `list[X]`, `dict[K, V]`, `tuple[X, ...]` over `List`, `Dict`, `Tuple` from `typing`.

## Data Modeling

| Type | Use when |
|------|----------|
| `@dataclass` | Simple internal data containers, no validation needed |
| Pydantic `BaseModel` | Validation matters: API payloads, config, user input, serialization |

## Behavioral Interfaces

Use `abc.ABC` with `@abstractmethod`, not `typing.Protocol`.

- **ABC** = nominal (explicit inheritance, runtime enforcement). Use when you own the hierarchy.
- **Protocol** = structural (duck typing, type-checker only). Acceptable for third-party interop where you don't control the implementors.

## Error Handling — EAFP

Attempt the operation; handle the failure. Don't pre-check.

- Keep `except` narrow — catch the specific exception type, not `Exception`.
- Chain exceptions to preserve context: `raise X from exc`.
- Never swallow silently. At minimum, log or re-raise.

## Testing

- pytest, not unittest.
- Fixtures over `setUp`/`tearDown`.
- Name tests after what they assert, not which function they call.
- Plain `assert` — no `self.assertEqual`.

## Concurrency

- Default to `async`/`await` when I/O is involved.
- Use threading (`ThreadPoolExecutor`) only for CPU-bound work or blocking libraries that can't be made async.
- Don't mix sync and async carelessly — async callers need async callees.
