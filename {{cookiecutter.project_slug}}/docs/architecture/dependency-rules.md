# Dependency rules

```text
apps -> packages
presentation -> application
a pplication -> domain
infrastructure -> application + domain
domain -> framework-free code
```

Packages cannot import applications. A business module cannot access another module's persistence layer. Browser code cannot import database, secret-bearing environment, or Node-only packages.
