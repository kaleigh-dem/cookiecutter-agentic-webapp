from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    if old not in content:
        raise SystemExit(f"Expected text not found in {path}: {old[:80]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "docs/TODO.md",
    "- [-] **P12-01 Add a reference OIDC access-token verifier.**",
    "- [x] **P12-01 Add a reference OIDC access-token verifier.**",
)
replace_once(
    "docs/TODO.md",
    "- [ ] **P12-02 Add a production browser authentication adapter.**",
    "- [-] **P12-02 Add a production browser authentication adapter.**",
)
phase_exit = (
    "Exit criteria: a generated production profile authenticates real identities, "
    "enforces runtime contracts and distributed limits across replicas, and cannot "
    "pass the release gate with development-only security adapters.\n"
)
phase_record = (
    phase_exit
    + "\nPhase gate record (2026-08-02): P12-01 is completed and verified in "
    "`512ba1d9799c74a1f0a60697776c93ccc29ed723`. Phase 12 remains open "
    "because P12-02 through P12-06 are not yet completed and the phase exit criteria "
    "are therefore not satisfied.\n"
)
replace_once("docs/TODO.md", phase_exit, phase_record)

generator_path = "tools/workspace-plugin/src/generators/init/generator.ts"
replace_once(
    generator_path,
    """    ['NEXT_PUBLIC_API_BASE_URL', `http://localhost:${options.apiPort}`],
    [
      'DATABASE_URL',
""",
    """    ['NEXT_PUBLIC_API_BASE_URL', `http://localhost:${options.apiPort}`],
    ['NEXT_PUBLIC_AUTHENTICATION_PROFILE', options.authentication],
    [
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT',
      options.authentication === 'oidc' || options.authentication === 'session'
        ? '/auth/session/access-token'
        : '',
    ],
    ['NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS', '30'],
    [
      'AUTH_ACCESS_TOKEN_VERIFIER',
      options.authentication === 'development' ? 'development' : 'oidc',
    ],
    [
      'DATABASE_URL',
""",
)

spec_path = "tools/workspace-plugin/src/generators/init/generator.spec.ts"
replace_once(
    spec_path,
    """    expect(tree.read('.env.example', 'utf-8')).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:55432/customer_portal',
    );
""",
    """    expect(tree.read('.env.example', 'utf-8')).toContain(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE=oidc',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=/auth/session/access-token',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'AUTH_ACCESS_TOKEN_VERIFIER=oidc',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:55432/customer_portal',
    );
""",
)

spec_marker = "  it('is deterministic when initialization is repeated', async () => {\n"
spec_test = """  it.each([
    ['development', 'development', ''],
    ['oidc', 'oidc', '/auth/session/access-token'],
    ['session', 'oidc', '/auth/session/access-token'],
    ['none', 'oidc', ''],
  ] as const)(
    'writes explicit %s authentication runtime defaults',
    async (profile, serverVerifier, sessionEndpoint) => {
      const profileTree = createWorkspaceTree();
      await initGenerator(profileTree, {
        ...validOptions,
        authentication: profile,
      });

      const environment = profileTree.read('.env.example', 'utf-8') ?? '';
      expect(environment).toContain(
        `NEXT_PUBLIC_AUTHENTICATION_PROFILE=${profile}`,
      );
      expect(environment).toContain(
        `NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=${sessionEndpoint}`,
      );
      expect(environment).toContain(
        `AUTH_ACCESS_TOKEN_VERIFIER=${serverVerifier}`,
      );
    },
  );

""" + spec_marker
replace_once(spec_path, spec_marker, spec_test)

readme_old = (
    "Local development uses the deterministic development verifier selected in "
    "`.env.example`. Production defaults to the OIDC discovery/JWKS verifier and "
    "requires an exact issuer, one or more audiences, an algorithm allowlist, and "
    "claim mapping. See `docs/oidc-authentication.md` for configuration, rotation, "
    "cache, validation, and outage behavior. The production browser credential "
    "acquisition and refresh adapter remains a separate integration boundary."
)
readme_new = (
    "Local development uses deterministic browser and API development adapters. "
    "Production web builds must explicitly select OIDC, session, or intentionally "
    "unauthenticated behavior; OIDC and session profiles obtain and renew short-lived "
    "bearer credentials through a same-origin secure-session endpoint. See "
    "`docs/browser-authentication.md` for browser storage, renewal, endpoint, and "
    "generator behavior. See `docs/oidc-authentication.md` for API discovery, JWKS, "
    "claim validation, rotation, and outage behavior."
)
replace_once("README.md", readme_old, readme_new)
