import { describe, expect, it } from 'vitest';

import {
  classifyJobFailure,
  PermanentJobError,
  RetryableJobError,
} from './failure';

describe('classifyJobFailure', () => {
  it('distinguishes explicit retryable and permanent failures', () => {
    expect(
      classifyJobFailure(new RetryableJobError('dependency_unavailable')),
    ).toEqual({
      disposition: 'retryable',
      errorCode: 'dependency_unavailable',
      errorMessage: 'Agent Task execution failed temporarily.',
    });
    expect(
      classifyJobFailure(new PermanentJobError('business_rule_rejected')),
    ).toEqual({
      disposition: 'permanent',
      errorCode: 'business_rule_rejected',
      errorMessage: 'Agent Task execution failed permanently.',
    });
  });

  it('classifies known infrastructure and programming failures', () => {
    expect(
      classifyJobFailure(
        Object.assign(new Error('socket'), { code: 'ECONNRESET' }),
      ),
    ).toMatchObject({
      disposition: 'retryable',
      errorCode: 'dependency_unavailable',
    });
    expect(classifyJobFailure(new TypeError('bad contract'))).toMatchObject({
      disposition: 'permanent',
      errorCode: 'execution_contract_error',
    });
  });

  it('never exposes arbitrary exception messages in persisted metadata', () => {
    const secret = 'token=super-secret request={customer:42}';
    const failure = classifyJobFailure(new Error(secret));
    expect(failure.errorMessage).not.toContain(secret);
    expect(failure.errorMessage).not.toContain('super-secret');
  });
});
