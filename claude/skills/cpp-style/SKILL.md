---
name: cpp-style
description: Barrett's C++ style guide — RAII, rule-of-zero, nodiscard/noexcept, no raw owning pointers, IWYU, Javadoc Doxygen. Apply when writing or reviewing C++.
tools: ["Read", "Grep", "Glob"]
model: sonnet
---

# C++ Style Guide

Apply these rules when writing new C++ or reviewing existing C++ code.

## Ownership & Memory

- **No raw owning pointers.** Use `std::unique_ptr` for sole ownership, `std::shared_ptr` only when shared ownership is genuinely required.
- Raw pointers are acceptable only as non-owning observers (e.g. `T*` parameter meaning "may be null, I don't own this"). Prefer references for non-nullable non-owning access.
- **Prefer RAII types** — wrap any resource (file, socket, lock, handle) in a type whose destructor releases it.

```cpp
// Wrong
Foo* foo = new Foo();
// ...
delete foo;

// Right
auto foo = std::make_unique<Foo>();
```

## Rule of Zero

Prefer the rule of zero: let the compiler generate copy/move/destructor by composing types that already manage their own resources. Only define the Big Five when the class directly owns a raw resource with no suitable RAII wrapper.

```cpp
// Rule of zero — nothing to write
class Config {
    std::string name_;
    std::vector<int> values_;
    std::unique_ptr<Backend> backend_;
};
```

## `[[nodiscard]]` and `noexcept`

- Mark functions `[[nodiscard]]` when ignoring the return value is almost certainly a bug — factory functions, error codes, `empty()`, `size()`.
- Mark functions `noexcept` when they genuinely cannot throw and you want to commit to that contract (move constructors, swap, simple accessors). Don't apply it speculatively.

```cpp
[[nodiscard]] std::unique_ptr<Connection> connect(std::string_view host);

[[nodiscard]] bool empty() const noexcept { return items_.empty(); }

// Move operations should be noexcept so containers can use the fast path
MyType(MyType&&) noexcept = default;
MyType& operator=(MyType&&) noexcept = default;
```

## Include What You Use (IWYU)

Include every header you directly use. Don't rely on transitive includes — they're an implementation detail of the headers you include, and they change.

- Prefer forward declarations in headers over full includes when only a pointer/reference is needed.
- Include the most specific header (`<string>` not `<bits/stdc++.h>`, `<memory>` not `<utility>` just to get `std::move`).

```cpp
// myclass.hpp
#include <memory>   // unique_ptr
#include <string>   // string
#include <vector>   // vector

class Foo;          // forward declare — don't pull in foo.hpp just for Foo*
```

## Doxygen Comments

Use Javadoc style (`/** ... */`) for all Doxygen block comments. Use `///<` for inline member documentation on the same line.

```cpp
/**
 * @brief Connects to the remote host and returns a ready-to-use session.
 *
 * @param host Hostname or IP address.
 * @param port TCP port number.
 * @return Owning handle to the established session.
 * @throws std::runtime_error if the connection cannot be established.
 */
[[nodiscard]] std::unique_ptr<Session> connect(std::string_view host, uint16_t port);

class Config {
    std::string host_;          ///< Hostname of the target server.
    uint16_t    port_{8080};    ///< Port to connect on; defaults to 8080.
    bool        tls_{true};     ///< Whether to require TLS.
};
```

- `@brief` — one-line summary.
- `@param` — one entry per parameter.
- `@return` — what the return value means (skip for `void`).
- `@throws` — document exceptions the caller must handle.
- Don't document the obvious — a getter named `name()` doesn't need `@brief Returns the name.`
