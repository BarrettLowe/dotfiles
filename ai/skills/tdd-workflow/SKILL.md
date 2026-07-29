---
name: tdd-workflow
description: Enforces test-driven development for Python and C++ (GoogleTest/Catch2). Writes failing tests first, implements minimal code, refactors, then verifies 80%+ coverage. Use when adding a feature, fixing a bug, or refactoring a module.
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
model: sonnet
---

# TDD Workflow

Enforce RED → GREEN → REFACTOR. Tests are written before production code. No exceptions.

## Five-Step Process

```
1. ANALYZE   — read the interface/spec, enumerate test cases
2. RED       — write failing tests, run them, confirm failure
3. GREEN     — write minimal code to pass; run tests, confirm pass
4. REFACTOR  — improve structure; run tests, confirm still green
5. COVERAGE  — verify 80%+ line coverage; fill gaps if needed
```

## Step 1 — Analyze

Read the target header(s), function signature(s), or bug report. Enumerate test cases before writing any code:

- Happy path — canonical inputs, expected outputs
- Boundary values — min, max, empty, zero, one
- Invalid inputs — nulls, out-of-range, wrong types
- Error paths — exceptions, error codes, failure modes
- State transitions — object state before and after calls

Write the list out as commented stubs before filling them in. This forces thinking before typing.

## Step 2 — RED

### C++ (auto-detect framework from CMakeLists.txt)

**GoogleTest**
```cpp
// test_parser.cpp
#include <gtest/gtest.h>
#include "parser.hpp"

// Test cases identified:
// - empty input returns nullopt
// - valid JSON returns populated struct
// - malformed JSON throws ParseError

TEST(Parser_Parse, EmptyInput_ReturnsNullopt) {
    Parser p;
    EXPECT_EQ(p.parse(""), std::nullopt);
}

TEST(Parser_Parse, ValidJson_ReturnsStruct) {
    Parser p;
    auto result = p.parse(R"({"id": 1})");
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result->id, 1);
}

TEST(Parser_Parse, MalformedJson_ThrowsParseError) {
    Parser p;
    EXPECT_THROW(p.parse("{bad}"), ParseError);
}
```

Run to confirm RED:
```bash
cmake --build build && ctest --test-dir build -R Parser --output-on-failure
# Expected: FAILED (compilation error or test failures)
```

**Catch2**
```cpp
#include <catch2/catch_test_macros.hpp>
#include "parser.hpp"

TEST_CASE("Parser::parse — empty input", "[parser]") {
    Parser p;
    REQUIRE(p.parse("") == std::nullopt);
}

TEST_CASE("Parser::parse — valid JSON", "[parser]") {
    Parser p;
    auto result = p.parse(R"({"id": 1})");
    REQUIRE(result.has_value());
    REQUIRE(result->id == 1);
}

TEST_CASE("Parser::parse — malformed JSON throws", "[parser]") {
    Parser p;
    REQUIRE_THROWS_AS(p.parse("{bad}"), ParseError);
}
```

### Python (pytest)

```python
# test_parser.py
import pytest
from parser import Parser, ParseError

# Test cases identified:
# - empty input returns None
# - valid JSON returns dataclass
# - malformed JSON raises ParseError

def test_parse_empty_returns_none():
    assert Parser().parse("") is None

def test_parse_valid_json_returns_struct():
    result = Parser().parse('{"id": 1}')
    assert result is not None
    assert result.id == 1

def test_parse_malformed_raises():
    with pytest.raises(ParseError):
        Parser().parse("{bad}")
```

Run to confirm RED:
```bash
pytest test_parser.py -v
# Expected: ERROR or FAILED — not yet implemented
```

**Checkpoint: do not write production code until all tests are failing (or erroring) for the right reason.**

## Step 3 — GREEN

Write the minimum code needed to make the tests pass. Resist the urge to add anything the tests don't yet demand.

Run tests again:

```bash
# C++
cmake --build build && ctest --test-dir build -R Parser --output-on-failure
# Expected: Passed N tests

# Python
pytest test_parser.py -v
# Expected: N passed
```

All tests must be green before moving on.

## Step 4 — REFACTOR

Improve clarity, eliminate duplication, apply style conventions — without changing behavior. Run tests after every meaningful change.

```bash
# C++
cmake --build build && ctest --test-dir build -R Parser
# Must stay green

# Python
pytest test_parser.py -v
# Must stay green
```

Commit at this point with a message describing the behavior added, not the TDD stage.

## Step 5 — Coverage

### Python

```bash
pytest --cov=parser --cov-report=term-missing --cov-fail-under=80 test_parser.py
```

If below 80%, read the missing lines, add targeted tests, and repeat GREEN → REFACTOR.

### C++

Requires the build to be configured with coverage instrumentation. Check `CMakeLists.txt` for a coverage target; if absent, add it or use a manual approach:

```bash
# GCC/Clang — build with coverage flags
cmake -DCMAKE_CXX_FLAGS="--coverage" -DCMAKE_BUILD_TYPE=Debug -S . -B build-cov
cmake --build build-cov
ctest --test-dir build-cov -R Parser
# Generate report
lcov --capture --directory build-cov --output-file coverage.info
lcov --remove coverage.info '/usr/*' --output-file coverage.info  # strip system headers
genhtml coverage.info --output-directory coverage-html
open coverage-html/index.html
```

If `lcov` is unavailable, use `gcov` directly on individual `.gcda` files, or check if the project has a coverage CMake target (`cmake --build build --target coverage`).

Target: **80% line coverage minimum**. If gaps are in error paths or boundary conditions, add tests. If gaps are in dead code, remove the dead code.

## Rules

- Tests must compile and run to count as RED — a syntax error is not a failing test
- Do not touch production code until RED is confirmed
- Test the **public interface only** — no access to private members via hacks
- One logical concept per test — split rather than chain assertions
- Mock external I/O (network, filesystem, DB) in unit tests; use real dependencies in integration tests
- **No production values** — no real endpoints, credentials, or environment-specific data in tests
- Match the existing framework; never mix GTest and Catch2 in the same suite

## Output Format

After completing each step, state the outcome in one line:

```
RED:      N tests failing (expected) — parser.hpp not yet implemented
GREEN:    N tests passing — parser.cpp written, 87 lines
REFACTOR: no structural changes needed
COVERAGE: 84% line coverage — 2 missing lines in error branch, test added
```
