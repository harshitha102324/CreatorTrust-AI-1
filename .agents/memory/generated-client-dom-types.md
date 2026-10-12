---
name: Generated client DOM types
description: TypeScript library setting needed by the generated React Query client.
---

Orval-generated React Query client typing uses `Headers.entries()`. If regenerated client types report that `Headers.entries()` is missing, the API client TypeScript library settings need `dom.iterable` alongside `dom`.

**Why:** In this workspace, code generation followed by typechecking failed on `Headers.entries()` until the iterable DOM declarations were enabled.

**How to apply:** Keep `dom.iterable` in the API client TypeScript configuration; do not patch generated output to work around this type error.
