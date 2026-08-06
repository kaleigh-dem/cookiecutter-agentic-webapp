import {
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

const authenticationFiles = [
  'infra/environments/production.env.example',
  'infra/environments/preview.env.example',
  'infra/environments/preview.local.env',
  'docs/oidc-authentication.md',
  'docs/browser-authentication.md',
  'apps/api/src/app/security/oidc-access-token-verifier.spec.ts',
  'apps/api/src/app/security/security.integration.spec.ts',
  'apps/api/src/app/security/oidc-provider-metadata.spec.ts',
  'wiki/Authentication-and-Authorization.md',
  'tools/delivery/production-readiness.spec.ts',
  'tools/delivery/production-readiness.telemetry.spec.ts',
];

function update(path, transform) {
  const original = readFileSync(path, 'utf8');
  const updated = transform(original);
  if (updated === original) {
    throw new Error(`Expected ${path} to change.`);
  }
  writeFileSync(path, updated);
}

for (const path of authenticationFiles) {
  update(path, (content) =>
    content
      .replaceAll('agentic-api', 'steadystack-api')
      .replaceAll('agentic_access_token', 'steadystack_access_token'),
  );
}

update('packages/ui/src/lib/hero-banner.tsx', (content) =>
  content.replace('NX AGENTIC TEMPLATE', 'SteadyStack'),
);

update(
  'tools/workspace-plugin/src/generators/init/generator.ts',
  (content) => {
    const before = `  const replacements: ReadonlyArray<readonly [string, string]> = [
    [templateIdentity.packageScope, options.packageScope],`;
    const after = `  const replacements: ReadonlyArray<readonly [string, string]> = [
    [\`${'${templateIdentity.slug}'}-api\`, \`${'${options.applicationSlug}'}-api\`],
    [
      \`${'${templateIdentity.slug}'}_access_token\`,
      \`${'${generatedSnakeName}'}_access_token\`,
    ],
    [templateIdentity.packageScope, options.packageScope],`;
    if (!content.includes(before)) {
      throw new Error('Generator identity replacement anchor was not found.');
    }
    return content.replace(before, after);
  },
);

update(
  'tools/workspace-plugin/src/generators/init/generator.spec.ts',
  (content) => {
    const environmentBefore = `      'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000',
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app',`;
    const environmentAfter = `      'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000',
      'AUTH_OIDC_AUDIENCE=steadystack-api',
      'AUTH_SESSION_COOKIE_NAME=steadystack_access_token',
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app',`;
    const expectationsBefore = `    expect(tree.read('.env.example', 'utf-8')).toContain(
      'AUTH_ACCESS_TOKEN_VERIFIER=oidc',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:55432/customer_portal',
    );`;
    const expectationsAfter = `    expect(tree.read('.env.example', 'utf-8')).toContain(
      'AUTH_ACCESS_TOKEN_VERIFIER=oidc',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'AUTH_OIDC_AUDIENCE=customer-portal-api',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'AUTH_SESSION_COOKIE_NAME=customer_portal_access_token',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:55432/customer_portal',
    );`;
    if (
      !content.includes(environmentBefore) ||
      !content.includes(expectationsBefore)
    ) {
      throw new Error('Generator test anchors were not found.');
    }
    return content
      .replace(environmentBefore, environmentAfter)
      .replace(expectationsBefore, expectationsAfter);
  },
);

update('tools/template/check-identity.mjs', (content) => {
  const constantsBefore = `const personalCodeowner = \`@${'${'}['kaleigh', 'dem'].join('-')}\`;

const forbiddenPatterns = [`;
  const constantsAfter = `const personalCodeowner = \`@${'${'}['kaleigh', 'dem'].join('-')}\`;
const formerOidcAudience = ['agentic', 'api'].join('-');
const formerSessionCookie = ['agentic', 'access', 'token'].join('_');
const formerHeroLabel = ['NX', 'AGENTIC', 'TEMPLATE'].join(' ');

const forbiddenPatterns = [`;
  const patternsBefore = `  ['template upper-snake identity', templateUpperIdentity],
  ['personal CODEOWNER', personalCodeowner],`;
  const patternsAfter = `  ['template upper-snake identity', templateUpperIdentity],
  ['former OIDC audience', formerOidcAudience],
  ['former session cookie', formerSessionCookie],
  ['former hero label', formerHeroLabel],
  ['personal CODEOWNER', personalCodeowner],`;
  if (!content.includes(constantsBefore) || !content.includes(patternsBefore)) {
    throw new Error('Identity checker anchors were not found.');
  }
  return content
    .replace(constantsBefore, constantsAfter)
    .replace(patternsBefore, patternsAfter);
});

update('.github/workflows/ci.yml', (content) => {
  const start = '      # BEGIN STEADYSTACK REVIEW FIX\n';
  const end = '      # END STEADYSTACK REVIEW FIX\n';
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error('Temporary CI materialization block was not found.');
  }
  return content.slice(0, startIndex) + content.slice(endIndex + end.length);
});

unlinkSync('tools/template/apply-steadystack-review-fix.mjs');
unlinkSync('.github/workflows/steadystack-review-fix.yml');
