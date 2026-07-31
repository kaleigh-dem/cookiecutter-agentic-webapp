# Architecture overview

```text
apps/web       Next.js delivery application
apps/api       NestJS HTTP delivery application
apps/worker    Node background execution application

packages/ui         shared React presentation
packages/contracts  framework-free public contracts
packages/env        Node-only validated configuration
```

Nx projects, not folders alone, are the units of ownership, caching, affected
analysis, and boundary enforcement. As domains are added, each domain should be
split into tagged libraries rather than accumulated inside an application.
