// Claude 改写:走 OpenAI 兼容网关(Tailscale)。
// 合规规则(mentor 定):提取事实 + 原创分析 + 本地视角重写,**不翻译、不照搬原文表达**;不抓图;不署名。
// ⚠️ 网关前置了 Claude-Code system prompt → 指令必须放 user 消息(别用 system role)。
import OpenAI from 'openai';
import { config } from './config';
import type { Lead, Rewritten, Usage } from './types';

const client = new OpenAI({ baseURL: config.GATEWAY_BASE_URL, apiKey: config.GATEWAY_API_KEY });

const COMMON = '【严格要求】直接输出结果,不要提问、不要解释、不要客套。';

const DEEP = `${COMMON}
你是面向西雅图华人社区新闻站的资深中文记者。从下面的英文新闻里**提取事实**,然后**用中文重新原创报道**:
- 提取事实后重写,**不要翻译、不要照搬原文的表达或结构**;
- **本地视角要自然,别硬套**:只有当这条新闻确实跟西雅图/华盛顿州有关(本地事件,或对本地居民有直接影响)才点出本地角度;若是纯国际/全国新闻(如外国地震),就当国际新闻老实报道,**不要牵强地扯西雅图**。
- 事实准确中立,语言专业,有深度有长度;
- **句子长短错落**:有短句也有长句,**别每句都差不多长、别用工整对仗的句式**(那是典型 AI 腔);少用「值得注意的是」「与此同时」「在……背景下」「这一……」这类套话转折。
- **写成真正的新闻稿:连贯的段落叙述。** 开头第一段是导语(交代核心事实:谁、何事、何时、何地、为何),后面分段层层展开。
- **绝对不要用 bullet points / 列表(-),不要堆小标题(##)。** 像报纸记者写稿那样,通篇是流畅的段落;加粗也尽量少用,别写成 AI 总结/科普文那种条目堆砌的风格。
- 正文用 Markdown(主要就是段落,段间空行即可),不要 HTML。
严格按下面格式输出(不要 JSON、不要多余文字):
===TITLE===
中文标题
===SUMMARY===
<=120字摘要
===CONTENT===
Markdown 正文`;

const SHORT = `${COMMON}
你是西雅图华人社区新闻站的记者。从下面的内容里**提取事实**,写成一条**短而精**的中文快讯(150-300字):
- 提取事实后原创重写,**不翻译、不照搬原文表达**;
- 事实中立;本地相关性**有就点,没有别硬凑**;
- **句子长短错落**,别一股工整的 AI 腔;
- **写成连贯的新闻段落**(1-2 段),像记者写短消息那样;**不要 bullet points、不要小标题、不要分条**。
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
