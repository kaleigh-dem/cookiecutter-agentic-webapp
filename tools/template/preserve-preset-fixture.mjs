import { readFile, writeFile, unlink } from 'node:fs/promises';

const generatorPath =
  'tools/workspace-plugin/src/generators/init/generator.ts';
const checkerPath = 'tools/template/check-identity.mjs';
const workflowPath = '.github/workflows/ci.yml';
const helperPath = 'tools/template/preserve-preset-fixture.mjs';
const fixturePath =
  "  'tools/workspace-plugin/src/generators/preset/generator.spec.ts',\n";

const generator = await readFile(generatorPath, 'utf8');
const generatorAnchor = "  'tools/template/check-identity.mjs',\n";
if (!generator.includes(fixturePath)) {
  if (!generator.includes(generatorAnchor)) {
    throw new Error('Could not find the generator preservation anchor.');
  }
  await writeFile(
    generatorPath,
    generator.replace(generatorAnchor, generatorAnchor + fixturePath),
  );
}

const checker = await readFile(checkerPath, 'utf8');
const checkerAnchor =
  "  'tools/workspace-plugin/src/generators/init-output.integration.ts',\n";
if (!checker.includes(fixturePath)) {
  if (!checker.includes(checkerAnchor)) {
    throw new Error('Could not find the checker exemption anchor.');
  }
  await writeFile(
    checkerPath,
    checker.replace(checkerAnchor, checkerAnchor + fixturePath),
  );
}

let workflow = await readFile(workflowPath, 'utf8');
const block = /\n      # BEGIN STEADYSTACK PRESET FIX\n[\s\S]*?      # END STEADYSTACK PRESET FIX\n/;
if (!block.test(workflow)) {
  throw new Error('Could not find the temporary workflow block.');
}
workflow = workflow.replace(block, '\n');
await writeFile(workflowPath, workflow);
await unlink(helperPath);
