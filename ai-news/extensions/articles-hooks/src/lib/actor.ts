// Resolve a Directus "accountability" object into one of our three actor roles.
// deployment-plan §4.1.7: hooks are actor-aware. Service accounts (Agent / n8n tokens)
// are identified by their role id being in ARTICLES_SERVICE_ROLE_IDS.

import type { Actor } from './status';

// Minimal shape of the bits of Directus accountability we depend on.
export interface AccountabilityLike {
  admin?: boolean;
  role?: string | null;
  user?: string | null;
}

export function resolveActor(
  accountability: AccountabilityLike | null | undefined,
  serviceRoleIds: ReadonlySet<string>
): Actor {
  // No accountability == internal/system call (migrations, flows running as system).
  // Treat as a service account: it can do machine transitions but never human approval.
  if (!accountability) return 'service';
  if (accountability.admin) return 'admin';
  if (accountability.role && serviceRoleIds.has(accountability.role)) return 'service';
  return 'editor';
}

// Parse the comma-separated ARTICLES_SERVICE_ROLE_IDS env var into a Set.
export function parseServiceRoleIds(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}
