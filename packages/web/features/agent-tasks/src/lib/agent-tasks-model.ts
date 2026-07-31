export interface AgentTaskDraft {
  readonly title: string;
  readonly prompt: string;
}

export interface AgentTaskFeatureState {
  readonly status: 'idle' | 'submitting' | 'success' | 'error';
  readonly message: string;
}

export function validateAgentTaskDraft(draft: AgentTaskDraft): string[] {
  const issues: string[] = [];
  if (!draft.title.trim()) issues.push('Title is required.');
  if (draft.title.trim().length > 120) issues.push('Title is too long.');
  if (!draft.prompt.trim()) issues.push('Prompt is required.');
  if (draft.prompt.trim().length > 4000) issues.push('Prompt is too long.');
  return issues;
}
