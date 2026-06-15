// articles lifecycle hooks — deployment-plan §4.1.7.
//
// This file is the thin Directus glue. All decision logic lives in ./lib/* and is
// unit-tested there. The hook itself only: reads current rows, calls the pure
// helpers, mutates the payload, and throws to abort illegal writes.
//
// Scope note (deployment-plan §4.1.9): static field protection (source_* / ai_*
// immutability) is enforced by Directus field permissions, NOT here. These hooks do
// only the *dynamic* logic: url normalization, final_*=ai_* init, and the actor-aware
// state machine + reviewed_by handling.

import { defineHook } from '@directus/extensions-sdk';
import { normalizeSourceUrl } from './lib/normalize-url';
import { isStatus, type Status } from './lib/status';
import { isTransitionAllowed, isHumanApproval } from './lib/state-machine';
import { resolveActor, parseServiceRoleIds } from './lib/actor';

const SERVICE_ROLE_IDS = parseServiceRoleIds(process.env.ARTICLES_SERVICE_ROLE_IDS);

export default defineHook(({ filter }) => {
  // ---- beforeCreate: normalize url + seed final_* from ai_* in one INSERT ----
  filter('articles.items.create', (input) => {
    const payload = input as Record<string, unknown>;

    if (typeof payload.source_url === 'string') {
      payload.source_url = normalizeSourceUrl(payload.source_url);
    }

    // final_* defaults to ai_* so editors open a pre-filled draft (hld.md §字段族).
    // Done here (beforeCreate) so it lands in the single INSERT — never afterCreate.
    if (payload.final_title == null) payload.final_title = payload.ai_title ?? null;
    if (payload.final_content == null) payload.final_content = payload.ai_content ?? null;
    if (payload.final_summary == null) payload.final_summary = payload.ai_summary ?? null;

    return payload;
  });

  // ---- beforeUpdate: actor-aware state machine + reviewed_by guard ----
  filter('articles.items.update', async (input, meta, context) => {
    const payload = input as Record<string, unknown>;
    const keys = (meta.keys ?? []) as Array<string | number>;
    const actor = resolveActor(context.accountability, SERVICE_ROLE_IDS);

    // reviewed_by is hook-managed: never accept a client-supplied value.
    // deployment-plan §4.1.7(c) — strip it (defense in depth, not just reject).
    delete payload.reviewed_by;

    const statusChanging = typeof payload.status === 'string';
    if (!statusChanging) return payload; // non-status PATCH (e.g. n8n wp_*/tweet_*): skip guard

    const newStatus = payload.status as string;
    if (!isStatus(newStatus)) {
      throw new Error(`Invalid status value: ${JSON.stringify(newStatus)}`);
    }

    // Load current rows to know the source state + content_type.
    const rows: Array<{ id: string | number; status: string; content_type: string | null }> =
      await context.database('articles').whereIn('id', keys).select('id', 'status', 'content_type');

    for (const row of rows) {
      const from = row.status as Status;
      if (from === newStatus) continue; // status unchanged for this row -> no guard

      if (!isTransitionAllowed(from, newStatus, actor)) {
        throw new Error(
          `Illegal status transition ${from} -> ${newStatus} for actor "${actor}" (article ${row.id})`
        );
      }

      // content_type must be set before an article can enter PUBLISHING.
      if (newStatus === 'PUBLISHING') {
        const effectiveType = (payload.content_type as string | null | undefined) ?? row.content_type;
        if (effectiveType == null) {
          throw new Error(`content_type is required before publishing (article ${row.id})`);
        }
      }

      // Record the human reviewer exactly once, on approval.
      if (isHumanApproval(from, newStatus, actor) && context.accountability?.user) {
        payload.reviewed_by = context.accountability.user;
      }
    }

    return payload;
  });
});
