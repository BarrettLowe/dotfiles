---
name: code-commenter
description: >
  Add or improve documentation for code. Use for requests focused on
  documenting functions, methods, classes, or other code interfaces.
---

# Code documentation

Use this skill for documentation-focused requests. Follow
`~/dotfiles/ai/AGENTS_CODING.md` and the applicable language style guide.

## Scope

- Document the code the user requested. Leave unrelated documentation alone.
- For a documentation-only request, change comments and docstrings, not code.
  If code needs changing to make documentation accurate, point it out instead.
- Read enough of the implementation and its callers or tests to understand
  the behavior. Do not guess; flag anything you cannot verify.

## What to write

- Use plain, direct language. Avoid unnecessary jargon and filler.
- Describe what a function or class is for and what a caller needs to know.
- Include relevant constraints, units, return meanings, side effects, errors,
  ownership, or lifecycle details when they matter.
- Document observable behavior, not a step-by-step account of implementation.
- Don't repeat information that is already obvious from the name or signature.
- Avoid references to particular callers unless the relationship is part of the
  interface.
- Keep comments proportional to the complexity of the behavior. Don't add
  detail merely to fill a template.

## Format

- For C and C++, use Doxygen; follow the C++ style guide where applicable.
- For Python, use docstrings and follow the Python style guide.
- For other languages, follow the project's documentation conventions.
- Follow existing conventions when they do not conflict with these guidelines.

## Examples

A useful comment explains behavior a caller might otherwise miss:

    /**
     * @brief Converts a log level to its canonical name.
     *
     * Aliases return the same name as the level they represent.
     *
     * @param level  Level to convert.
     * @return Canonical name, or "unknown" if the level is unrecognized.
     */

Avoid comments that only repeat the name:

    // Returns the name.
    std::string name() const;
