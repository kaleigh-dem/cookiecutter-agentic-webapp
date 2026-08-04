# Dependency rules

Three tag dimensions are mandatory for every project:

- `scope:*` — organizational ownership
- `type:*` — architectural role
- `runtime:*` — browser, Node, or universal runtime

The executable source of truth is `eslint.config.mjs`. The current constraints are:

```text
scope:shared   -> scope:shared
scope:web      -> scope:web | scope:shared
scope:backend  -> scope:backend | scope:shared

runtime:browser -X-> runtime:node

type:app      -> domain | feature | job | ui | contract | config | data-access | util
type:domain   -> domain | contract | util
type:feature  -> ui | contract | util
type:job      -> domain | contract | config | data-access | util
type:ui       -> ui | contract | util
type:contract -> contract | util
type:config   -> config | contract | util
```

Additional enforced behavior:

- transitive dependencies must be declared;
- buildable libraries may depend only on compatible buildable libraries;
- browser feature code may not declare handwritten `Request`, `Response`, or `Dto` types that duplicate generated API contracts.

Do not weaken a rule to make one import pass. Move the code to its correct project, introduce a deliberate public boundary, or document an intentional architecture change in an ADR.
