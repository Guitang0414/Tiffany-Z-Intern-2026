<script setup lang="ts">
import { inject, ref, computed, type Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

// Directus 用 prop 传 primaryKey;再兜底 inject,确保拿得到 id
const props = defineProps<{ primaryKey?: string | number }>();
const injPk = inject<Ref<string | number> | string | number>('primaryKey', '');

const api = useApi();
const values = inject<Ref<Record<string, any>>>('values', ref({}));
const errorMessage = ref('');

const pk = computed<string | number>(() => {
	if (props.primaryKey != null && props.primaryKey !== '') return props.primaryKey;
	const v: any = injPk;
	return v && typeof v === 'object' && 'value' in v ? v.value : v;
});
const isNew = computed(() => !pk.value || pk.value === '+');

const busy = ref(false);
const copied = ref(false);

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
	errorMessage.value = e?.response?.data?.errors?.[0]?.message ?? String(e);
}

// 保存并发布:正文编辑 + status=PUBLISHING 原子提交,回列表
async function publish() {
	if (isNew.value) return;
	busy.value = true;
	try {
		// spike 简化:发布时盖发布时间戳(正式上线由 n8n 在真正发到 WP 时写)
		await patch({ ...editablePayload(), status: 'PUBLISHING', published_at: new Date().toISOString() });
		window.location.assign(listUrl());
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// 驳回:status=REJECTED,回列表(无需理由,一键操作)
async function reject() {
	if (isNew.value) return;
	busy.value = true;
	try {
		await patch({ status: 'REJECTED' });
		window.location.assign(listUrl());
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// 复制到 BrightChat:BrightChat 无开放 API,只能人工转发 —— 这里省的是「去几个字段里分别选字复制」
// 的功夫,一键把标题+正文拼成能直接粘贴的文本。不改变文章状态,可以在发布前后任意时候点。
async function copyForBrightChat() {
	const v = values.value || {};
	const title = (v.final_title ?? '').toString().trim();
	const content = (v.final_content ?? '').toString().trim();
	const text = [title, content].filter(Boolean).join('\n\n');
	try {
		await navigator.clipboard.writeText(text);
		copied.value = true;
		setTimeout(() => { copied.value = false; }, 3000);
	} catch (e) {
		fail(e);
	}
}
</script>

<template>
	<div class="review-actions">
		<v-notice v-if="errorMessage" type="danger" style="margin-bottom:8px;width:100%">{{ errorMessage }}</v-notice>
		<v-button :loading="busy" :disabled="isNew" @click="publish">
			<v-icon name="check_circle" left /> 保存并发布
		</v-button>
		<v-button kind="danger" :loading="busy" :disabled="isNew" @click="reject">
			<v-icon name="cancel" left /> 驳回
		</v-button>
		<v-button secondary :disabled="isNew" @click="copyForBrightChat">
			<v-icon :name="copied ? 'check' : 'content_copy'" left /> {{ copied ? '已复制' : '复制到 BrightChat' }}
		</v-button>
	</div>
</template>

<style scoped>
.review-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
