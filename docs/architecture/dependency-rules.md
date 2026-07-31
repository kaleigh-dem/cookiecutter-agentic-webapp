# Dependency rules

Three tag dimensions are mandatory for every project:

- `scope:*` — organizational ownership
- `type:*` — architectural role
- `runtime:*` — browser, Node, or universal runtime

Current rules are executable in `eslint.config.mjs`.

```text
scope:web      -> scope:web | scope:shared
scope:backend  -> scope:backend | scope:shared
scope:shared   -> scope:shared

runtime:browser -X-> runtime:node

type:app      -> feature | ui | contract | config | data-access | util
type:ui       -> ui | contract | util
type:contract -> contract | util
type:config   -> config | contract | util
```

Do not weaken a rule to make one import pass. Move the code to its correct
project or document a deliberate architecture change in an ADR.
