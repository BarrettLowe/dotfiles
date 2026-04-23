---
description: Barrett's C++ style conventions — applied automatically when writing or reviewing C++ files.
paths: ["**/*.cpp", "**/*.hpp", "**/*.h", "**/*.cc", "**/*.cxx"]
---

# C++ Style Conventions

## Ownership & Memory

- No raw owning pointers. Use `std::unique_ptr` for sole ownership, `std::shared_ptr` only when shared ownership is genuinely required.
- Raw pointers are acceptable as non-owning observers only (e.g. a `T*` parameter meaning "may be null, caller retains ownership"). Prefer references for non-nullable non-owning access.
- Prefer RAII types — wrap any resource (file, socket, lock, handle) in a type whose destructor releases it.

## Rule of Zero

Prefer the rule of zero: compose types that already manage their own resources and let the compiler generate copy/move/destructor. Only define the Big Five when the class directly owns a raw resource with no suitable RAII wrapper.

## `[[nodiscard]]` and `noexcept`

- Mark functions `[[nodiscard]]` when ignoring the return value is almost certainly a bug — factory functions, error codes, `empty()`, `size()`.
- Mark functions `noexcept` when they genuinely cannot throw and you intend to commit to that contract (move constructors, swap, simple accessors). Don't apply it speculatively.
- Move constructors and move assignment operators should be `noexcept` so containers can use the fast path.

## Include What You Use (IWYU)

- Include every header you directly use. Don't rely on transitive includes.
- Prefer forward declarations in headers over full includes when only a pointer or reference is needed.
- Include the most specific header available (`<memory>` not `<utility>` just to get `std::move`).

## Doxygen Comments

Use Javadoc style (`/** ... */`) for block comments. Use `///<` for inline documentation on the same line as a member declaration.

```cpp
/**
 * @brief One-line summary.
 *
 * @param host  Hostname or IP address.
 * @param port  TCP port number.
 * @return Owning handle to the established session.
 * @throws std::runtime_error if the connection cannot be established.
 */
[[nodiscard]] std::unique_ptr<Session> connect(std::string_view host, uint16_t port);

class Config {
    std::string host_;       ///< Hostname of the target server.
    uint16_t    port_{8080}; ///< Port to connect on; defaults to 8080.
    bool        tls_{true};  ///< Whether to require TLS.
};
```

- `@brief` — one-line summary.
- `@param` — one entry per parameter.
- `@return` — what the return value means (omit for `void`).
- `@throws` — exceptions the caller must handle.
- Don't document the obvious — a getter named `name()` doesn't need `@brief Returns the name.`
