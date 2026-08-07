# ADR 0019: Release records and recovery evidence

- Status: Accepted
- Date: 2026-08-07

## Context

ADR 0009 defines ordered releases, database backup before migration, rollback-window observation, schema-aware rollback, and periodic restore testing. ADR 0013 binds SBOM, scan, signature, provenance, and SBOM attestations to published image digests. ADR 0014 promotes those exact digests into production without rebuilding them, but intentionally left long-lived release-record retention and post-deployment evidence to P13-06.

A production approval is incomplete if the immutable image references cannot be tied to the backup used for that deployment, the migration plan, the schema-compatibility decision, the rollback observation window, and the smoke result from the deployed environment. Those facts must fail closed when missing instead of living only in an incident timeline or a human checklist. Disaster-recovery instructions also need executable evidence that a backup can actually be restored.

The baseline remains provider-neutral. SteadyStack can validate the shape and integrity of release evidence and exercise PostgreSQL restore mechanics, but it cannot choose a production database snapshot API, deployment controller, or long-term compliance archive for adopters.

## Decision

1. Add a versioned production **release record** schema and validator.
   - The record is bound to the immutable release manifest version, source repository, source workflow run, commit SHA, and API/worker/web digest references.
   - It requires a non-placeholder database backup identifier and capture timestamp.
   - It requires a positive rollback window plus an explicit schema-compatibility decision of `backward-compatible` or `roll-forward-only`, with rationale, owner, and decision timestamp.
   - It requires a successful `release` smoke profile result.
   - It records the production digest environment, release and migration plans, source/release/promotion workflow metadata, all three image SBOMs and scan reports, the smoke result and log, and per-image signature/attestation verification evidence.
   - Every supporting evidence file in the finalized bundle, except the release record itself, is recorded with a SHA-256 hash and byte size. Validation can re-read the bundle and fail if any recorded attachment is missing or has changed.
2. Add the **Finalize release record** workflow as a post-deployment production action.
   - It may run only from `main` and uses the protected `production` GitHub Environment.
   - It accepts the successful Release images and Promote release digests workflow run IDs plus the provider-specific backup identifier, backup time, rollback window, schema decision, and rationale.
   - It downloads the approved production promotion and image-supply-chain artifacts from the exact named runs, revalidates the manifest and production configuration, authenticates to GHCR with read-only package access, verifies signatures and attestations, materializes migration-plan evidence, and runs the deployed `release` smoke profile.
   - It emits `release-record-VERSION` only after the complete record validates against hashes for every supporting evidence file in the bundle.
3. GitHub workflow artifacts are a handoff copy, not the long-term system of record. The finalizer retains its bundle for 90 days and requires the deployment platform or compliance archive to persist the complete bundle before that retention expires.
4. Add a scheduled **Disaster recovery exercise** workflow.
   - It runs quarterly and remains manually dispatchable.
   - It creates a migrated and seeded PostgreSQL source database, captures a custom-format dump, restores it into a distinct database, compares deterministic row counts for application tables in the `app` schema, validates migration status, and reruns migrations idempotently against the restored database.
   - It records the backup SHA-256 identifier, restore duration, source commit/run identity, and restore validation outputs as retained evidence.
5. Production-provider restore drills remain adopter responsibilities. The scheduled repository exercise proves the baseline PostgreSQL procedure and catches migration/backup-tool drift; production deployments must additionally exercise provider snapshots, encryption/key recovery, permissions, networking, and declared RPO/RTO controls.

## Consequences

- A release cannot be considered fully recorded when the backup, rollback window, schema decision, smoke result, or supporting evidence attachments are absent.
- Rollback decisions become auditable alongside the exact image digests and migration plan instead of being reconstructed after an incident.
- The production promotion workflow remains read-only and provider-neutral; evidence finalization occurs after the deployment platform has consumed the approved promotion artifact.
- Release-record artifacts are tamper-evident within the bundle because every supporting evidence file is hashed and revalidated.
- The repository now exercises backup and restore mechanics on a schedule, while adopters still own production backup creation and durable release-record retention.
