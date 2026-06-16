import { describe, it, expect } from 'vitest';
import { isTransitionAllowed, isHumanApproval } from './state-machine';

describe('isTransitionAllowed', () => {
  it('editor: allows the three human transitions', () => {
    expect(isTransitionAllowed('PENDING', 'PUBLISHING', 'editor')).toBe(true);
    expect(isTransitionAllowed('PENDING', 'REJECTED', 'editor')).toBe(true);
    expect(isTransitionAllowed('REJECTED', 'PENDING', 'editor')).toBe(true);
  });

  it('editor: cannot retry a FAILED article', () => {
    expect(isTransitionAllowed('FAILED', 'PUBLISHING', 'editor')).toBe(false);
  });

  it('editor: cannot jump PENDING straight to PUBLISHED', () => {
    expect(isTransitionAllowed('PENDING', 'PUBLISHED', 'editor')).toBe(false);
  });

  it('admin: is a superset of editor and may retry FAILED', () => {
    expect(isTransitionAllowed('PENDING', 'PUBLISHING', 'admin')).toBe(true);
    expect(isTransitionAllowed('FAILED', 'PUBLISHING', 'admin')).toBe(true);
  });

  it('admin: still cannot mark an article PUBLISHED by hand', () => {
    expect(isTransitionAllowed('PUBLISHING', 'PUBLISHED', 'admin')).toBe(false);
  });

  it('service: may settle PUBLISHING and auto-retry FAILED only', () => {
    expect(isTransitionAllowed('PUBLISHING', 'PUBLISHED', 'service')).toBe(true);
    expect(isTransitionAllowed('PUBLISHING', 'FAILED', 'service')).toBe(true);
    expect(isTransitionAllowed('FAILED', 'PUBLISHING', 'service')).toBe(true);
  });

  it('service: cannot approve or reject (no human transitions)', () => {
    expect(isTransitionAllowed('PENDING', 'PUBLISHING', 'service')).toBe(false);
    expect(isTransitionAllowed('PENDING', 'REJECTED', 'service')).toBe(false);
  });
});

describe('isHumanApproval', () => {
  it('is true only for editor/admin doing PENDING -> PUBLISHING', () => {
    expect(isHumanApproval('PENDING', 'PUBLISHING', 'editor')).toBe(true);
    expect(isHumanApproval('PENDING', 'PUBLISHING', 'admin')).toBe(true);
  });

  it('is false for a service account (even on the same transition)', () => {
    expect(isHumanApproval('PENDING', 'PUBLISHING', 'service')).toBe(false);
  });

  it('is false for any other transition', () => {
    expect(isHumanApproval('FAILED', 'PUBLISHING', 'admin')).toBe(false);
    expect(isHumanApproval('PENDING', 'REJECTED', 'editor')).toBe(false);
  });
});
