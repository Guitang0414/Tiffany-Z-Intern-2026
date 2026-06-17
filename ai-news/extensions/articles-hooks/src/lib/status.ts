// Article status enum + actor roles. Single source of truth for the state machine.
// Per hld.md §状态机 and deployment-plan §4.1.7. No DRAFT status (MVP decision).

export const STATUSES = ['PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED'] as const;
export type Status = (typeof STATUSES)[number];

// Who is performing the mutation. Resolved from Directus accountability (see actor.ts).
//   editor  — human reviewer assigned to categories
//   admin   — human admin (superset of editor + retry)
//   service — Agent / n8n API tokens (machine writeback only)
export type Actor = 'editor' | 'admin' | 'service';

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}
