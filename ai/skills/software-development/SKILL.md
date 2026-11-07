---
name: software-development
description: >
  Guide the implementation of new features, significant
  refactors, and architectural changes. Use when work
  requires design decisions, component boundaries,
  or resolving technical uncertainty.
---

# Software Development Process

Adapt the amount of effort to the complexity of the work.
These stages guide engineering decisions rather than
requiring a rigid sequence.

## 1. Establish Feasibility
Identify technical uncertainties, if any.
Where necessary, build the smallest experiment that
can validate an assumption before designing around it.

## 2. Evaluate Architecture
Understand the existing system and its responsibilities.

- One-off change: favor minimal architectural disruption.
- Repeated or expanding functionality: consider
  refactoring or introducing modular components.
- New system: design appropriate component boundaries.

This stage is critical - almost always requires human input.

## 3. Define Responsibilities
Identify what each class or module owns.
Define understandable public interfaces.
Avoid mixing unrelated concerns.

## 4. Implement
Build components around their responsibilities.
Favor readable structure and explicit intent.
Keep abstractions proportional to the problem.

## 5. Verify
Test the implementation and add automated tests
covering public behavior.
Use integration or manual hardware testing where
appropriate.

## 6. Complete
Ensure the behavior is correct, tests are satisfactory,
and the change is checked into version control.

## Guiding Principle
The process may vary. The desired outcome does not:
readable, reliable, maintainable software.
