# Worker instructions

- Jobs must be idempotent and safe to retry.
- Record job identifiers and correlation identifiers in structured logs.
- Define payloads in `packages/contracts` and validate them at consumption.
- External side effects require explicit timeout and retry policies.
