// Claude 改写:走 OpenAI 兼容网关(Tailscale)。
// 合规规则(mentor 定):提取事实 + 原创分析 + 本地视角重写,**不翻译、不照搬原文表达**;不抓图;不署名。
// ⚠️ 网关前置了 Claude-Code system prompt → 指令必须放 user 消息(别用 system role)。
import OpenAI from 'openai';
import { config } from './config';
import type { Lead, Rewritten, Usage } from './types';

const client = new OpenAI({ baseURL: config.GATEWAY_BASE_URL, apiKey: config.GATEWAY_API_KEY });

const COMMON = '【严格要求】直接输出结果,不要提问、不要解释、不要客套。';

const DEEP = `${COMMON}
你是面向西雅图华人社区新闻站的资深中文编辑。从下面的英文新闻里**提取事实**,然后**用中文重新原创报道**:
- 提取事实后重写,**不要翻译、不要照搬原文的表达或结构**;
- 加入**西雅图本地视角与影响**(对本地居民、社区、政策的意义);
- 事实准确中立,语言专业,有深度有长度;
- 正文用 Markdown(## 小标题、- 列表、**加粗**),不要 HTML。
严格按下面格式输出(不要 JSON、不要多余文字):
===TITLE===
中文标题
===SUMMARY===
<=120字摘要
===CONTENT===
Markdown 正文`;

const SHORT = `${COMMON}
你是西雅图华人社区新闻站的编辑。从下面的内容里**提取事实**,写成一条**短而精**的中文快讯(150-300字):
- 提取事实后原创重写,**不翻译、不照搬原文表达**;
- 事实中立,点出本地相关性;
- 正文用 Markdown(1-2 段)。
严格按下面格式输出(不要 JSON、不要多余文字):
===TITLE===
中文标题
===SUMMARY===
<=80字摘要
===CONTENT===
Markdown 正文`;

function parseSections(text: string): Rewritten {
	const grab = (tag: string) => {
		const m = text.match(new RegExp(`===${tag}===(.*?)(?=\\n===|$)`, 's'));
		return m ? m[1].trim() : '';
	};
	const content = grab('CONTENT').replace(/^```(?:markdown|md)?\s*|\s*```$/gs, '').trim();
	return { title: grab('TITLE'), summary: grab('SUMMARY'), content };
}

/** 把一条线索的原文改写成中文。返回改写结果 + token 用量(供 budget 计)。 */
export async function rewrite(lead: Lead, sourceText: string): Promise<{ rewritten: Rewritten; usage: Usage }> {
	const isDeep = lead.contentType === 'ARTICLE';
	const resp = await client.chat.completions.create({
		model: isDeep ? config.MODEL_DEEP : config.MODEL_SHORT,
		messages: [{ role: 'user', content: `${isDeep ? DEEP : SHORT}\n\n原标题: ${lead.sourceTitle}\n\n原文(截断):\n${sourceText}` }],
		max_tokens: isDeep ? 3000 : 900,
		temperature: 0.3,
	});
	const rewritten = parseSections(resp.choices[0]?.message?.content ?? '');
	return { rewritten, usage: { totalTokens: resp.usage?.total_tokens ?? 0 } };
}
