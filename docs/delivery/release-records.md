# Release records and recovery evidence

P13-06 adds a post-deployment evidence layer without changing the immutable promotion boundary. **Release images** still publishes one tested digest set, and **Promote release digests** still approves those exact digests without rebuilding or deploying them. After the deployment platform consumes `production-promotion-VERSION`, run **Finalize release record** to bind what was approved to what was actually deployed and verified.

## Finalize a production release

Dispatch `.github/workflows/release-record.yml` from `main` after production deployment with:

- the semantic release version;
- the successful **Release images** workflow run ID;
- the successful **Promote release digests** workflow run ID;
- the provider-specific backup or snapshot identifier captured before migrations and its ISO-8601 capture time;
- the rollback observation window in minutes;
- the schema-compatibility decision: `backward-compatible` when the previous approved application digests may run against the deployed schema, or `roll-forward-only` when they may not;
- a concrete rationale for that schema decision.

The workflow runs in the protected `production` GitHub Environment. It downloads the exact production-promotion and image-supply-chain artifacts, validates the release manifest against the named source run, rechecks protected production configuration, verifies each signature and both required attestation predicates, extracts the migration-related steps from the approved production plan, and runs `tools/delivery/smoke-test.mjs --profile release` against the deployed environment.

A successful run uploads `release-record-VERSION`. The bundle contains:

- `release-record.json`, including release/promotion run identities, commit SHA, immutable image digests, backup identifier, rollback window, schema decision, decision owner/time, and smoke status;
- `release-manifest.json`, `release-images.env`, the approved production release plan, and source/promotion workflow metadata;
- `migration-plan.production.json`, extracted from the approved plan's backup, migration inspection, and migration application steps;
- all API, worker, and web SPDX SBOMs plus the corresponding Trivy scan reports downloaded from the exact release run;
- per-image Cosign and GitHub attestation verification output for build provenance and SPDX SBOM attestations;
- `smoke-test.json` and `smoke-test.log` from the deployed release.

`release-record.json` stores a SHA-256 hash and byte size for every supporting evidence file in the bundle except the record itself. That includes the release manifest and digest environment, release and migration plans, source/release/promotion run metadata, smoke result and log, every SBOM and scan report, and every attestation-verification file. The validator re-reads each recorded attachment when `--base-directory` is supplied and fails closed if any evidence file is missing or has changed, as well as on a missing backup, a non-positive rollback window, an unrecorded schema decision, a failed smoke result, or digest evidence that does not match the immutable release manifest.

Validate a complete downloaded bundle with:

```bash
node tools/delivery/release-record.mjs validate \
  --record release-record.json \
  --manifest release-manifest.json \
  --base-directory .
```

The repository's deterministic delivery check validates `infra/release/release-record.example.json` against the example immutable manifest.

## Rollback evidence

The release record does not authorize rollback by itself. Follow `docs/runbooks/release-rollback.md` and treat the recorded schema decision as the pre-deployment assessment that must still be reconfirmed during an incident.

- `backward-compatible` means the previous approved application digests are expected to remain compatible with the deployed schema for the recorded window.
- `roll-forward-only` means application rollback is not considered safe after the migration; recover with a forward fix unless the disaster-recovery procedure is explicitly invoked.

The backup identifier must name the snapshot captured for that deployment, not a backup policy or a placeholder. The finalizer intentionally does not create provider-specific backups.

## Retention

The GitHub Actions copy is retained for 90 days. Treat that as transport and review retention only. Before it expires, persist the complete `release-record-VERSION` bundle in the deployment system of record, release archive, or compliance store with retention appropriate to the service. Keeping only `release-record.json` is insufficient because its attachment hashes are designed to bind the complete supporting evidence bundle.

## Scheduled restore exercise

`.github/workflows/disaster-recovery.yml` runs quarterly and can also be dispatched manually. The exercise:

1. migrates and seeds an isolated PostgreSQL database;
2. captures a custom-format `pg_dump` backup and records its SHA-256 identifier;
3. restores into a separate `restore_exercise` database;
4. compares deterministic public-table row counts between source and restored databases;
5. validates restored migration status and reruns migrations to prove the restored schema is current and migration execution is idempotent;
6. uploads the dump, row-count evidence, migration-status output, restore duration, source commit/run identity, and `restore-evidence.json`.

This scheduled repository exercise satisfies the baseline procedure in `docs/runbooks/disaster-recovery.md`; it does not replace a provider-specific production restore drill. Production owners must continue to test snapshot access, encryption/key recovery, provider permissions, networking, traffic switching, reconciliation, and the declared RPO/RTO.
