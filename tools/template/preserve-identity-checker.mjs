import { readFile, writeFile, unlink } from 'node:fs/promises';

const generatorPath =
  'tools/workspace-plugin/src/generators/init/generator.ts';
const workflowPath = '.github/workflows/ci.yml';
const helperPath = 'tools/template/preserve-identity-checker.mjs';
const markerStart = '      # BEGIN STEADYSTACK CHECKER FIX\n';
const markerEnd = '      # END STEADYSTACK CHECKER FIX\n';

const generator = await readFile(generatorPath, 'utf8');
const anchor =
  "  'tools/workspace-plugin/src/generators/init-output.integration.ts',\n";
const checker = "  'tools/template/check-identity.mjs',\n";
if (!generator.includes(checker)) {
  if (!generator.includes(anchor)) {
    throw new Error('Could not find the preserved-source anchor.');
  }
  await writeFile(generatorPath, generator.replace(anchor, anchor + checker));
}

let workflow = await readFile(workflowPath, 'utf8');
const start = workflow.indexOf(markerStart);
const end = workflow.indexOf(markerEnd);
if (start === -1 || end === -1 || end < start) {
  throw new Error('Could not find the temporary workflow block.');
}
workflow =
  workflow.slice(0, start) + workflow.slice(end + markerEnd.length);
workflow = workflow.replace('  contents: write\n', '  contents: read\n');
await writeFile(workflowPath, workflow);
await unlink(helperPath);
