<script setup lang="ts">
import { inject, ref, computed, type Ref } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';

// Directus 用 prop 传 primaryKey;再兜底 inject,确保拿得到 id
const props = defineProps<{ primaryKey?: string | number }>();
const injPk = inject<Ref<string | number> | string | number>('primaryKey', '');

const api = useApi();
const { useNotificationsStore } = useStores();
const notifications = useNotificationsStore();
const values = inject<Ref<Record<string, any>>>('values', ref({}));

const pk = computed<string | number>(() => {
	if (props.primaryKey != null && props.primaryKey !== '') return props.primaryKey;
	const v: any = injPk;
	return v && typeof v === 'object' && 'value' in v ? v.value : v;
});
const isNew = computed(() => !pk.value || pk.value === '+');

const busy = ref(false);
const rejectOpen = ref(false);
const reason = ref('');

function listUrl() {
	return window.location.href.split('/content/articles')[0] + '/content/articles';
}
function editablePayload() {
	const v = values.value || {};
	const pick: Record<string, any> = {};
	for (const f of ['final_title', 'final_summary', 'final_content', 'content_type']) {
		if (v[f] !== undefined) pick[f] = v[f];
	}
	return pick;
}
async function patch(payload: Record<string, any>) {
	await api.patch(`/items/articles/${pk.value}`, payload);
}
function fail(e: any) {
	notifications.add({
		title: '操作失败',
		text: e?.response?.data?.errors?.[0]?.message ?? String(e),
		type: 'error',
		dialog: true,
	});
}

// 保存并发布:正文编辑 + status=PUBLISHING 原子提交,回列表
async function publish() {
	if (isNew.value) return;
	busy.value = true;
	try {
		// spike 简化:发布时盖发布时间戳(正式上线由 n8n 在真正发到 WP 时写)
		await patch({ ...editablePayload(), status: 'PUBLISHING', published_at: new Date().toISOString() });
		notifications.add({ title: '已保存并发布' });
		window.location.assign(listUrl());
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// 驳回:status=REJECTED + 原因,回列表
async function reject() {
	if (!reason.value.trim() || isNew.value) return;
	busy.value = true;
	try {
		await patch({ status: 'REJECTED', rejection_reason: reason.value.trim() });
		notifications.add({ title: '已驳回' });
		window.location.assign(listUrl());
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
		rejectOpen.value = false;
	}
}
</script>

<template>
	<div class="review-actions">
		<v-button :loading="busy" :disabled="isNew" @click="publish">
			<v-icon name="check_circle" left /> 保存并发布
		</v-button>
		<v-button kind="danger" :loading="busy" :disabled="isNew" @click="rejectOpen = true">
			<v-icon name="cancel" left /> 驳回
		</v-button>

		<v-dialog v-model="rejectOpen" @esc="rejectOpen = false">
			<v-card>
				<v-card-title>驳回原因</v-card-title>
				<v-card-text>
					<v-textarea v-model="reason" placeholder="为什么驳回这篇文章?" />
				</v-card-text>
				<v-card-actions>
					<v-button secondary @click="rejectOpen = false">取消</v-button>
					<v-button kind="danger" :disabled="!reason.trim()" :loading="busy" @click="reject">
						确认驳回
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<style scoped>
.review-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
