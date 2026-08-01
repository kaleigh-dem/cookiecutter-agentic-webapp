import { expect, test } from '@playwright/test';

test('creates an authenticated correlated task through the generated client', async ({
  page,
}) => {
  const taskId = '11111111-1111-4111-8111-111111111111';
  await page.route('http://localhost:4000/api/agent-tasks', async (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.headers().authorization).toBe(
      'Bearer local-development-token',
    );
    expect(request.headers()['x-actor-id']).toBeUndefined();
    const body = request.postDataJSON() as { title: string; prompt: string };
    expect(body).toEqual({
      title: 'Summarize feedback',
      prompt: 'Group feedback into themes.',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: taskId,
        title: body.title,
        prompt: body.prompt,
        status: 'queued',
        correlationId: request.headers()['x-correlation-id'],
        createdAt: '2026-07-31T17:00:00.000Z',
      }),
    });
  });

  await page.goto('/agent-tasks');
  await page.getByLabel('Task title').fill('Summarize feedback');
  await page.getByLabel('Agent prompt').fill('Group feedback into themes.');
  await page.getByRole('button', { name: 'Create task' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Queued Summarize feedback',
  );
  await expect(page.getByLabel('Task identifier')).toHaveValue(taskId);
});
