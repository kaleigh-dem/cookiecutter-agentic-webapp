import { describe, expect, it } from 'vitest';

import { validateAgentTaskDraft } from './agent-tasks-model';

describe('validateAgentTaskDraft', () => {
  it('reports accessible client-side validation issues', () => {
    expect(validateAgentTaskDraft({ title: '', prompt: '  ' })).toEqual([
      'Title is required.',
      'Prompt is required.',
    ]);
  });
});
