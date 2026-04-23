---
name: python-style
description: Barrett's Python style guide — type annotations, dataclasses, Pydantic, ABC, EAFP, async-first. Apply when writing or reviewing Python.
tools: ["Read", "Grep", "Glob"]
model: sonnet
---

# Python Style Guide

Apply these rules when writing new Python or reviewing existing Python code.

## Type Annotations

- Annotate everything: parameters, return types, class attributes.
- Use `from __future__ import annotations` at the top of every module — cleaner forward references, no circular import issues.
- Prefer `X | None` over `Optional[X]`.
- Prefer `list[X]`, `dict[K, V]`, `tuple[X, ...]` over `List`, `Dict`, `Tuple` from `typing`.

```python
from __future__ import annotations

def process(items: list[str], max_count: int | None = None) -> dict[str, int]:
    ...
```

## Data Modeling

Use the right tool for the job — don't reach for Pydantic out of habit:

| Type | Use when |
|------|----------|
| `@dataclass` | Simple internal data containers, no validation needed |
| Pydantic `BaseModel` | Validation matters: API payloads, config, user input, serialization |

```python
# Internal — dataclass
from dataclasses import dataclass, field

@dataclass
class JobConfig:
    name: str
    retries: int = 3
    tags: list[str] = field(default_factory=list)

# External / validated — Pydantic
from pydantic import BaseModel, Field

class RequestPayload(BaseModel):
    user_id: int
    action: str = Field(min_length=1)
    metadata: dict[str, str] = {}
```

## Behavioral Interfaces

Use `abc.ABC` with `@abstractmethod`, not `typing.Protocol`.

- **ABC** = nominal (explicit inheritance, runtime enforcement). Use when you own the hierarchy.
- **Protocol** = structural (duck typing, type-checker only). Acceptable for third-party interop where you don't control the implementors.

```python
from abc import ABC, abstractmethod

class MessageSink(ABC):
    @abstractmethod
    def send(self, message: str) -> None: ...

    @abstractmethod
    def flush(self) -> None: ...
```

## Error Handling — EAFP

Attempt the operation; handle the failure. Don't pre-check.

```python
# Wrong
if key in data:
    value = data[key]

# Right
try:
    value = data[key]
except KeyError:
    ...
```

- Keep `except` narrow — catch the specific exception type, not `Exception`.
- Chain exceptions to preserve context:

```python
try:
    result = parse(raw)
except ValueError as exc:
    raise ConfigError(f"Invalid config: {raw!r}") from exc
```

- Never swallow silently. At minimum, log or re-raise.

## Testing

- pytest, not unittest.
- Fixtures over `setUp`/`tearDown`.
- Name tests after what they assert, not which function they call.
- Plain `assert` — no `self.assertEqual`.

```python
import pytest

@pytest.fixture
def config():
    return AppConfig(debug=True)

def test_debug_mode_disables_cache(config):
    assert config.cache_enabled is False
```

## Concurrency

- Default to `async`/`await` when I/O is involved.
- Use threading (`ThreadPoolExecutor`) only for CPU-bound work or blocking libraries that can't be made async.
- Don't mix sync and async carelessly — async callers need async callees.

```python
# I/O — async
async def fetch_user(user_id: int) -> User:
    async with session.get(f"/users/{user_id}") as resp:
        return User(**await resp.json())

# CPU-bound — run in executor to avoid blocking the event loop
async def process(data: bytes) -> bytes:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, cpu_heavy, data)
```
