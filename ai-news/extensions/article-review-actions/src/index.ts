import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'article-review-actions',
	name: '审核操作(保存并发布/驳回)',
	icon: 'gavel',
	description: '一键保存当前编辑并改状态(原子提交,避免与未保存表单 race)',
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['presentation'],
	group: 'presentation',
	options: null,
});
