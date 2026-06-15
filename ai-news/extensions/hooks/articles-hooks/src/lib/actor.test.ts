import { describe, it, expect } from 'vitest';
import { resolveActor, parseServiceRoleIds } from './actor';

const SERVICE = new Set(['svc-role-1', 'svc-role-2']);

describe('resolveActor', () => {
  it('null/undefined accountability => service (system call)', () => {
    expect(resolveActor(null, SERVICE)).toBe('service');
    expect(resolveActor(undefined, SERVICE)).toBe('service');
  });

  it('admin flag => admin (wins over role checks)', () => {
    expect(resolveActor({ admin: true, role: 'svc-role-1' }, SERVICE)).toBe('admin');
  });

  it('role in the service set => service', () => {
    expect(resolveActor({ admin: false, role: 'svc-role-2' }, SERVICE)).toBe('service');
  });

  it('any other authenticated role => editor', () => {
    expect(resolveActor({ admin: false, role: 'some-editor-role' }, SERVICE)).toBe('editor');
  });

  it('no role => editor (authenticated but unmatched)', () => {
    expect(resolveActor({ admin: false, role: null }, SERVICE)).toBe('editor');
  });
});

describe('parseServiceRoleIds', () => {
  it('splits, trims, and drops blanks', () => {
    const set = parseServiceRoleIds(' a , b ,, c ');
    expect([...set].sort()).toEqual(['a', 'b', 'c']);
  });

  it('empty / nullish => empty set', () => {
    expect(parseServiceRoleIds('').size).toBe(0);
    expect(parseServiceRoleIds(undefined).size).toBe(0);
    expect(parseServiceRoleIds(null).size).toBe(0);
  });
});
