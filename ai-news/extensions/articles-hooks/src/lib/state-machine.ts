// Actor-aware article state machine — deployment-plan §4.1.7 (arch review B2) + hld.md §状态机.
//
// Legal transitions per actor:
//   editor  : PENDING->PUBLISHING, PENDING->REJECTED, REJECTED->PENDING
//   admin   : (all editor transitions) + FAILED->PUBLISHING        (retry)
//   service : PUBLISHING->PUBLISHED, PUBLISHING->FAILED, FAILED->PUBLISHING (auto-retry)
//
// The guard only runs when `status` itself changes (see index.ts); n8n PATCHing
// per-platform fields without touching `status` must not trip it.

import type { Actor, Status } from './status';

type Transition = readonly [Status, Status];

const EDITOR_TRANSITIONS: readonly Transition[] = [
  ['PENDING', 'PUBLISHING'],
  ['PENDING', 'REJECTED'],
  ['REJECTED', 'PENDING'],
];

const ADMIN_TRANSITIONS: readonly Transition[] = [
  ...EDITOR_TRANSITIONS,
  ['FAILED', 'PUBLISHING'], // admin-triggered retry
];

const SERVICE_TRANSITIONS: readonly Transition[] = [
  ['PUBLISHING', 'PUBLISHED'],
  ['PUBLISHING', 'FAILED'],
  ['FAILED', 'PUBLISHING'], // n8n auto-retry
];

const TRANSITIONS: Record<Actor, readonly Transition[]> = {
  editor: EDITOR_TRANSITIONS,
  admin: ADMIN_TRANSITIONS,
  service: SERVICE_TRANSITIONS,
};

export function allowedTransitions(actor: Actor): readonly Transition[] {
  return TRANSITIONS[actor];
}

export function isTransitionAllowed(from: Status, to: Status, actor: Actor): boolean {
  return TRANSITIONS[actor].some(([f, t]) => f === from && t === to);
}

// reviewed_by is written only when a human reviewer approves (PENDING -> PUBLISHING).
//
// NOTE: deployment-plan §4.1.7(b) literally says "editor". We extend to admin as well,
// because an admin can also approve and should be recorded as the reviewer; service
// accounts must never be. Flagged to confirm with mentor — if it must be editor-only,
// drop 'admin' from this check.
export function isHumanApproval(from: Status, to: Status, actor: Actor): boolean {
  return (actor === 'editor' || actor === 'admin') && from === 'PENDING' && to === 'PUBLISHING';
}
