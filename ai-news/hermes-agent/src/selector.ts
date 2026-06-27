// 选题:用便宜的 haiku 给标题打「是否值得报道」分,过滤掉体育选秀/名人八卦/琐事等低价值新闻。
// 在 dedupe 之后、取材之前做 —— 既减少垃圾入库,又省下对低价值新闻的 Jina/Claude 开销。
// (taxonomy 定了之后,这里可以顺带做正式 AI 分类。)
import OpenAI from 'openai';
import { config } from './config';
import { budget } from './budget';
import type { Lead } from './types';
import { log } from './logger';

const client = new OpenAI({ baseURL: config.GATEWAY_BASE_URL, apiKey: config.GATEWAY_API_KEY });
const lg = log('selector');

const PROMPT = `【严格要求】只输出一个 0-10 的整数,别的都不要。
你在为面向西雅图华人社区的新闻站做选题,标准要严:这条是不是**真正值得报道的新闻**?
高分(7-10):本地政策/治安/安全/交通/住房/教育/民生、重大国内外事件、对华人社区有实质影响、健康/经济提醒、官方通告、有公共意义的调查报道。
低分(0-4):大学或职业体育的选秀·签约·招募·球员动态、比分赛果、名人八卦/红毯/绯闻、星座运势、宠物寻物、讣告/逝者名单、生活礼仪/小贴士、本地小店开业/餐厅推荐、个人轶事/趣闻、社区吐槽/闲聊/段子、纯娱乐资讯。
拿不准、或只是"有点意思"但没有公共新闻价值的,给 4 分。
新闻标题:`;

/** 这条标题值不值得报道。解析失败 / 没预算 → 放行(不误杀)。 */
export async function isNewsworthy(lead: Lead): Promise<boolean> {
	if (!budget.ok()) return true; // 没预算就不额外花钱筛;后面的预算 gate 会拦
	const threshold = lead.lane === 'B' ? 6 : 5; // reddit 短讯门槛更高(多是社区闲聊,非真新闻)
	try {
		const resp = await client.chat.completions.create({
			model: config.MODEL_SHORT,
			messages: [{ role: 'user', content: PROMPT + lead.sourceTitle }],
			max_tokens: 8,
			temperature: 0,
		});
		budget.add(resp.usage?.total_tokens ?? 0);
		const m = (resp.choices[0]?.message?.content ?? '').match(/\d+/);
		const score = m ? parseInt(m[0], 10) : threshold;
		if (score < threshold) lg.debug({ title: lead.sourceTitle, score }, 'skipped low-value');
		return score >= threshold;
	} catch (err) {
		lg.warn({ err: (err as Error).message }, 'selector failed — 放行');
		return true;
	}
}
