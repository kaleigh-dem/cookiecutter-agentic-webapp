from pathlib import Path
from textwrap import dedent


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"{label} marker not found in {path}")
    file_path.write_text(text.replace(old, new, 1))


Path("tools/delivery/release-image-recovery.mjs").write_text(
    dedent(
        r'''
        import { createHash } from 'node:crypto';
        import { readFile } from 'node:fs/promises';

        const missingManifestPattern =
          /^(?:error response from daemon:\s*)?(?:manifest unknown|no such manifest)(?::|\s|$)/iu;

        function requireValue(value, label) {
          const normalized = String(value ?? '').trim();
          if (!normalized || /[\r\n]/u.test(normalized)) {
            throw new Error(`${label} is required and must be one line.`);
          }
          return normalized;
        }

        function parseArguments(arguments_) {
          const [command = '', ...rest] = arguments_;
          const values = {};
          for (let index = 0; index < rest.length; index += 1) {
            const argument = rest[index];
            if (!argument?.startsWith('--')) continue;
            const value = rest[index + 1];
            if (value === undefined || value.startsWith('--')) {
              throw new Error(`${argument} requires a value.`);
            }
            values[argument.slice(2)] = value;
            index += 1;
          }
          return { command, values };
        }

        export function releaseBuildInputsFingerprint(input) {
          const canonical = {
            apiBaseUrl: requireValue(input.apiBaseUrl, 'API base URL'),
            authenticationProfile: requireValue(
              input.authenticationProfile,
              'Authentication profile',
            ),
            authSessionEndpoint: requireValue(
              input.authSessionEndpoint,
              'Authentication session endpoint',
            ),
            authSessionRefreshSkewSeconds: requireValue(
              input.authSessionRefreshSkewSeconds,
              'Authentication refresh skew seconds',
            ),
          };
          return `sha256:${createHash('sha256')
            .update(JSON.stringify(canonical))
            .digest('hex')}`;
        }

        export function manifestInspectionProvesAbsence(stderr) {
          const lines = String(stderr ?? '')
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
          return (
            lines.length > 0 &&
            lines.every((line) => missingManifestPattern.test(line))
          );
        }

        export function verifyRecoveryLabels(labels, expected) {
          if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
            throw new Error('Published image labels are missing.');
          }
          const requirements = {
            'org.opencontainers.image.version': requireValue(
              expected.version,
              'Expected version',
            ),
            'org.opencontainers.image.revision': requireValue(
              expected.revision,
              'Expected revision',
            ),
            'io.agentic-webapp.release.run-id': requireValue(
              expected.runId,
              'Expected workflow run ID',
            ),
            'io.agentic-webapp.release.build-inputs-sha256': requireValue(
              expected.buildInputsSha256,
              'Expected build-input fingerprint',
            ),
          };

          const mismatches = Object.entries(requirements).filter(
            ([key, value]) => labels[key] !== value,
          );
          if (mismatches.length > 0) {
            throw new Error(
              `Published image is not recoverable by this workflow run: ${mismatches
                .map(
                  ([key, value]) =>
                    `${key}=${String(labels[key])} (expected ${value})`,
                )
                .join('; ')}.`,
            );
          }
          return requirements;
        }

        async function main() {
          const { command, values } = parseArguments(process.argv.slice(2));
          if (command === 'fingerprint') {
            process.stdout.write(
              `${releaseBuildInputsFingerprint({
                apiBaseUrl: values['api-base-url'],
                authenticationProfile: values['authentication-profile'],
                authSessionEndpoint: values['auth-session-endpoint'],
                authSessionRefreshSkewSeconds:
                  values['auth-session-refresh-skew-seconds'],
              })}\n`,
            );
            return;
          }
          if (command === 'assert-manifest-absent') {
            const errorFile = requireValue(values['error-file'], 'Error file');
            const stderr = await readFile(errorFile, 'utf8');
            if (!manifestInspectionProvesAbsence(stderr)) {
              throw new Error(
                `Registry inspection did not prove that ${
                  values.image ?? 'the image'
                } is absent. Failing closed.\n${stderr.trim()}`,
              );
            }
            process.stdout.write('absent\n');
            return;
          }
          if (command === 'verify-labels') {
            const labels = JSON.parse(
              await readFile(
                requireValue(values['labels-file'], 'Labels file'),
                'utf8',
              ),
            );
            verifyRecoveryLabels(labels, {
              version: values.version,
              revision: values.revision,
              runId: values['run-id'],
              buildInputsSha256: values['build-inputs-sha256'],
            });
            process.stdout.write('verified\n');
            return;
          }
          throw new Error(`Unknown release recovery command: ${command}.`);
        }

        if (import.meta.url === `file://${process.argv[1]}`) {
          void main().catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
          });
        }
        '''
    ).lstrip()
)

Path("tools/delivery/release-image-recovery.spec.mjs").write_text(
    dedent(
        r'''
        import { describe, expect, it } from 'vitest';

        import {
          manifestInspectionProvesAbsence,
          releaseBuildInputsFingerprint,
          verifyRecoveryLabels,
        } from './release-image-recovery.mjs';

        const buildInputs = {
          apiBaseUrl: 'https://api.example.com',
          authenticationProfile: 'oidc',
          authSessionEndpoint: '/auth/session/access-token',
          authSessionRefreshSkewSeconds: '30',
        };

        describe('release image recovery', () => {
          it('creates a stable fingerprint that changes with every compiled input', () => {
            const fingerprint = releaseBuildInputsFingerprint(buildInputs);
            expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
            expect(releaseBuildInputsFingerprint({ ...buildInputs })).toBe(
              fingerprint,
            );

            for (const [key, value] of Object.entries(buildInputs)) {
              expect(
                releaseBuildInputsFingerprint({
                  ...buildInputs,
                  [key]: `${value}-different`,
                }),
              ).not.toBe(fingerprint);
            }
          });

          it('accepts only explicit missing-manifest responses', () => {
            expect(
              manifestInspectionProvesAbsence(
                'no such manifest: ghcr.io/example/api:1.2.3',
              ),
            ).toBe(true);
            expect(
              manifestInspectionProvesAbsence(
                'manifest unknown: manifest unknown',
              ),
            ).toBe(true);

            for (const error of [
              '',
              'unauthorized: authentication required',
              'Get "https://ghcr.io/v2/": dial tcp: i/o timeout',
              'error response from daemon: denied',
            ]) {
              expect(manifestInspectionProvesAbsence(error)).toBe(false);
            }
          });

          it('allows recovery only for the original run and exact build inputs', () => {
            const fingerprint = releaseBuildInputsFingerprint(buildInputs);
            const expected = {
              version: '1.2.3',
              revision: '1'.repeat(40),
              runId: '123456789',
              buildInputsSha256: fingerprint,
            };
            const labels = {
              'org.opencontainers.image.version': expected.version,
              'org.opencontainers.image.revision': expected.revision,
              'io.agentic-webapp.release.run-id': expected.runId,
              'io.agentic-webapp.release.build-inputs-sha256': fingerprint,
            };

            expect(verifyRecoveryLabels(labels, expected)).toEqual(labels);
            expect(() =>
              verifyRecoveryLabels(labels, {
                ...expected,
                runId: '987654321',
              }),
            ).toThrow('not recoverable by this workflow run');
            expect(() =>
              verifyRecoveryLabels(labels, {
                ...expected,
                buildInputsSha256: `sha256:${'f'.repeat(64)}`,
              }),
            ).toThrow('not recoverable by this workflow run');
          });
        });
        '''
    ).lstrip()
)

for path in ["apps/api/project.json", "apps/worker/project.json"]:
    replace_once(
        path,
        "--build-arg VCS_REF=${GITHUB_SHA:-local} -f",
        "--build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local} -f",
        "node service recovery build args",
    )

replace_once(
    "apps/web/project.json",
    "--build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg NEXT_PUBLIC_API_BASE_URL=",
    "--build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local} --build-arg NEXT_PUBLIC_API_BASE_URL=",
    "web recovery build args",
)

for path in ["infra/docker/Dockerfile.node-service", "infra/docker/Dockerfile.web"]:
    replace_once(
        path,
        "ARG VCS_REF=unknown\n\nLABEL",
        "ARG VCS_REF=unknown\nARG RELEASE_RUN_ID=local\nARG RELEASE_BUILD_INPUTS_SHA256=local\n\nLABEL",
        "recovery label args",
    )
    replace_once(
        path,
        '      org.opencontainers.image.revision="${VCS_REF}" \\\n      org.opencontainers.image.source=',
        '      org.opencontainers.image.revision="${VCS_REF}" \\\n      io.agentic-webapp.release.run-id="${RELEASE_RUN_ID}" \\\n      io.agentic-webapp.release.build-inputs-sha256="${RELEASE_BUILD_INPUTS_SHA256}" \\\n      org.opencontainers.image.source=',
        "recovery labels",
    )

workflow_path = Path(".github/workflows/release.yml")
workflow = workflow_path.read_text()
marker = (
    "      - name: Validate deployed browser authentication\n"
    "        run: node tools/delivery/validate-browser-auth-build.mjs\n\n"
    "      - name: Authenticate to GHCR\n"
)
replacement = (
    "      - name: Validate deployed browser authentication\n"
    "        run: node tools/delivery/validate-browser-auth-build.mjs\n\n"
    "      - name: Compute release build identity\n"
    "        shell: bash\n"
    "        run: |\n"
    "          set -euo pipefail\n"
    "          fingerprint=$(node tools/delivery/release-image-recovery.mjs fingerprint \\\n"
    '            --api-base-url "$NEXT_PUBLIC_API_BASE_URL" \\\n'
    '            --authentication-profile "$NEXT_PUBLIC_AUTHENTICATION_PROFILE" \\\n'
    '            --auth-session-endpoint "$NEXT_PUBLIC_AUTH_SESSION_ENDPOINT" \\\n'
    '            --auth-session-refresh-skew-seconds "$NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS")\n'
    '          echo "RELEASE_BUILD_INPUTS_SHA256=$fingerprint" >> "$GITHUB_ENV"\n\n'
    "      - name: Authenticate to GHCR\n"
)
if marker not in workflow:
    raise SystemExit("release identity step marker not found")
workflow = workflow.replace(marker, replacement, 1)

start_marker = '            if docker manifest inspect "$image" >/dev/null 2>&1; then\n'
end_marker = '            fi\n          done\n'
start = workflow.find(start_marker)
if start < 0:
    raise SystemExit("release inspection start marker not found")
end = workflow.find(end_marker, start)
if end < 0:
    raise SystemExit("release inspection end marker not found")
end += len('            fi\n')
replacement = dedent(
    r'''
                inspect_error="$RUNNER_TEMP/${service}-manifest-inspect.err"
                if docker manifest inspect "$image" >/dev/null 2>"$inspect_error"; then
                  if [ "$GITHUB_RUN_ATTEMPT" = '1' ]; then
                    echo "Release image already exists and will not be overwritten: $image" >&2
                    echo 'Rerun the original failed Release images workflow to resume a partial publication.' >&2
                    exit 1
                  fi

                  docker pull "$image"
                  reference=$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")
                  name=${reference%@*}
                  digest=${reference##*@}
                  labels_file="$RUNNER_TEMP/${service}-labels.json"
                  docker image inspect --format '{{json .Config.Labels}}' "$image" > "$labels_file"
                  node tools/delivery/release-image-recovery.mjs verify-labels \
                    --labels-file "$labels_file" \
                    --version "$APP_VERSION" \
                    --revision "$GITHUB_SHA" \
                    --run-id "$GITHUB_RUN_ID" \
                    --build-inputs-sha256 "$RELEASE_BUILD_INPUTS_SHA256"

                  case "$digest" in
                    sha256:*) ;;
                    *) echo "Published $service image did not resolve to a sha256 digest." >&2; exit 1 ;;
                  esac

                  echo "${service}_published=true" >> "$GITHUB_OUTPUT"
                  echo "${service}_name=$name" >> "$GITHUB_OUTPUT"
                  echo "${service}_digest=$digest" >> "$GITHUB_OUTPUT"
                  echo "${service}_scan_ref=$name@$digest" >> "$GITHUB_OUTPUT"
                else
                  node tools/delivery/release-image-recovery.mjs assert-manifest-absent \
                    --error-file "$inspect_error" \
                    --image "$image"
                  all_published=false
                  echo "${service}_published=false" >> "$GITHUB_OUTPUT"
                  echo "${service}_scan_ref=$image" >> "$GITHUB_OUTPUT"
                fi
    '''
).lstrip("\n")
workflow_path.write_text(workflow[:start] + replacement + workflow[end:])

spec_path = Path("tools/delivery/release-promotion.spec.ts")
spec = spec_path.read_text()
marker = "    const workflow = await repositoryFile('.github/workflows/release.yml');\n"
replacement = marker + dedent(
    '''
        const apiProject = await repositoryFile('apps/api/project.json');
        const workerProject = await repositoryFile('apps/worker/project.json');
        const webProject = await repositoryFile('apps/web/project.json');
        const nodeDockerfile = await repositoryFile(
          'infra/docker/Dockerfile.node-service',
        );
        const webDockerfile = await repositoryFile('infra/docker/Dockerfile.web');
    '''
)
if marker not in spec:
    raise SystemExit("release promotion fixture marker not found")
spec = spec.replace(marker, replacement, 1)
marker = "    expect(workflow).toContain('docker manifest inspect');\n"
replacement = marker + dedent(
    '''
        expect(workflow).toContain('release-image-recovery.mjs fingerprint');
        expect(workflow).toContain('assert-manifest-absent');
        expect(workflow).toContain('verify-labels');
        expect(workflow).toContain('--run-id "$GITHUB_RUN_ID"');
        expect(workflow).toContain(
          '--build-inputs-sha256 "$RELEASE_BUILD_INPUTS_SHA256"',
        );
        expect(workflow).toContain('2>"$inspect_error"');
        expect(workflow).not.toContain('>/dev/null 2>&1');
        for (const project of [apiProject, workerProject, webProject]) {
          expect(project).toContain('RELEASE_RUN_ID=${GITHUB_RUN_ID:-local}');
          expect(project).toContain(
            'RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local}',
          );
        }
        for (const dockerfile of [nodeDockerfile, webDockerfile]) {
          expect(dockerfile).toContain('io.agentic-webapp.release.run-id');
          expect(dockerfile).toContain(
            'io.agentic-webapp.release.build-inputs-sha256',
          );
        }
    '''
)
if marker not in spec:
    raise SystemExit("release promotion inspection expectation marker not found")
spec = spec.replace(marker, replacement, 1)
marker = (
    "    const documentation = await repositoryFile(\n"
    "      'docs/delivery/releases-and-previews.md',\n"
    "    );\n"
)
replacement = marker + dedent(
    '''
        const wikiRelease = await repositoryFile('wiki/Releases-and-Upgrades.md');
        const wikiSupplyChain = await repositoryFile('wiki/Image-Supply-Chain.md');
    '''
)
if marker not in spec:
    raise SystemExit("documentation fixture marker not found")
spec = spec.replace(marker, replacement, 1)
marker = (
    "    expect(documentation).toContain(\n"
    "      'Before checkout or production Environment access',\n"
    "    );\n"
)
replacement = marker + dedent(
    '''
        expect(documentation).toContain('same workflow run ID');
        expect(documentation).toContain('fail closed');
        expect(wikiRelease).toContain('same workflow run ID');
        expect(wikiSupplyChain).toContain('build-input fingerprint');
    '''
)
if marker not in spec:
    raise SystemExit("documentation expectation marker not found")
spec_path.write_text(spec.replace(marker, replacement, 1))

replace_once(
    "docs/delivery/releases-and-previews.md",
    "The manifest records the API, worker, and web `name@sha256` references plus every public web build input used by promotion: the API base URL, authentication profile, session endpoint, and session refresh-skew seconds. Use its source workflow run ID when dispatching **Promote release digests**.\n",
    "The manifest records the API, worker, and web `name@sha256` references plus every public web build input used by promotion: the API base URL, authentication profile, session endpoint, and session refresh-skew seconds. Use its source workflow run ID when dispatching **Promote release digests**.\n\nIf publication fails after one or more pushes, rerun that exact workflow run. Existing images are reusable only when their OCI labels match the same workflow run ID, commit, semantic version, and canonical build-input fingerprint. Registry inspection failures fail closed; only an explicit missing-manifest response is treated as an unpublished tag.\n",
    "release recovery documentation",
)

replace_once(
    "wiki/Releases-and-Upgrades.md",
    "The publication workflow refuses to overwrite an existing semantic-version tag. Promotion does not rebuild, retag, or push images.\n",
    "The publication workflow refuses to overwrite an existing semantic-version tag. If a partial publication fails, only a rerun of the same workflow run ID may reuse an existing image, and only when version, commit, and the canonical public build-input fingerprint all match. Registry inspection errors fail closed rather than being treated as absent tags. Promotion does not rebuild, retag, or push images.\n",
    "wiki release recovery documentation",
)

replace_once(
    "wiki/Image-Supply-Chain.md",
    "A failed vulnerability gate prevents publication, signing, attestation, and release-manifest creation. It does not discard the available scan evidence.\n",
    "A failed vulnerability gate prevents publication, signing, attestation, and release-manifest creation. It does not discard the available scan evidence.\n\nA partial publication is recoverable only by rerunning the original workflow run. Each image carries the workflow run ID and a SHA-256 build-input fingerprint covering the public API URL, authentication profile, session endpoint, and refresh-skew value. Recovery rejects images from another run or with different inputs. Registry inspection also fails closed: only explicit `manifest unknown` or `no such manifest` responses are interpreted as an absent tag.\n",
    "wiki supply-chain recovery documentation",
)
