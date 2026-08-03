# Rate-limit boundary guidance

- Keep policy construction and storage ports framework-free.
- Keep infrastructure-specific persistence in adapter projects.
- Never store raw subjects, tenant identifiers, or client addresses in rate-limit keys.
- Test policy composition and in-memory behavior without network dependencies.
