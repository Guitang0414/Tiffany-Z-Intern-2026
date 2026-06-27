// Claude 改写:走 OpenAI 兼容网关(Tailscale)。
// 合规规则(mentor 定):提取事实 + 原创分析 + 本地视角重写,**不翻译、不照搬原文表达**;不抓图;不署名。
// ⚠️ 网关前置了 Claude-Code system prompt → 指令必须放 user 消息(别用 system role)。
import OpenAI from 'openai';
import { config } from './config';
import type { Lead, Rewritten, Usage } from './types';

const client = new OpenAI({ baseURL: config.GATEWAY_BASE_URL, apiKey: config.GATEWAY_API_KEY });

const COMMON = '【严格要求】直接输出结果,不要提问、不要解释、不要客套。';

// 反 AI 腔的硬规则(DEEP/SHORT 共用)。目标:像 People / Variety / Deadline / 报社记者写的稿,
// 不是 AI 总结。核心 = 具体事实优先、有引语就引、不脑补情绪、不编造、新闻式收尾。
const ANTI_AI = `【像记者写稿,不是 AI 总结 —— 严格遵守】
1. 只用原文里**确实有的事实**。绝对不要编造引语、人物、时间、地点、数字、情节;原文没有的细节一个字都别加。
2. **具体优先于概括**:多写原文里的具体细节(谁、何时、在哪、做了什么、说了什么、多少、什么结果),少写抽象总结。
3. **有原话就用直接引语**(译成中文并注明是谁说的);原文没有引语就不要硬造一句出来。
4. **不要替人物揣测情绪/心理**:除非原文明确写了,否则不要写「平静与笃定」「历经波折」「言语间流露出」这类脑补。
5. **每一段都要带出新的事实**,不要把上一段换个说法重复,也不要纯抒情。
6. **段落长短不一、句子节奏有变化**;不要每段都「背景→总结→升华」的规整套路。
7. **新闻式收尾**:结尾落在一个具体事实、下一步或未决问题上;**不要写评论式升华总结**(如「多了几分真实的人情味」)。
【禁用词/套话(出现即算失败,用具体事实替代)】
近日、引发关注、引发外界关注、保持低调、感情风波、坦诚分享、人情味、真实的人情味、流于形式、言语间流露出、历经波折、平静与笃定、婚姻稳固、长情组合、值得注意的是、与此同时、在……背景下、这一……;
英文同理:sparked attention、opened up、kept a low profile、heartwarming、showed resilience。
【合规:不署名、不暴露来源】绝不点名来源媒体(不写「据/由《西雅图时报》报道」「KING 5 称」「据报道」等),不出现「原文」「来源」「转载」等字样;以**本站独立报道**的口吻写,就当是本站记者自己采写的。信息不足时只说事实本身不知道,别把它归因到"原文/来源"。
【写法】原创重写、无翻译腔;正文用 Markdown 段落(段间空行),不要 bullet/列表(-)/小标题(##)/HTML;少用加粗;**禁止使用破折号(——、—、–)。中文不用破折号,需要停顿就用逗号或句号**。
【信息不足时】如果原文只给了导语、被付费墙截断、或内容太少,**就只写你确实掌握的那几句,该多短就多短;绝对不要写「内容缺失/正文被截断/请看原文/无法核实」这类元说明,也不要为了凑长度而编造或空泛展开**。`;

const DEEP = `${COMMON}
你是一名专业中文新闻记者(娱乐/文化稿参照 People / Variety / Deadline / Entertainment Weekly 的笔法),为面向西雅图华人社区的新闻站写稿。根据下面英文原文,用中文写一篇有细节、有深度的新闻报道。
${ANTI_AI}
【本地视角】只有当确实跟西雅图/华盛顿州有真实关联(本地事件,或对本地居民有直接影响)才点出本地角度;纯国际/全国新闻就老实报道,**不要牵强地扯西雅图**。
严格按下面格式输出(不要 JSON、不要多余文字):
===TITLE===
中文标题(具体、不标题党)
===SUMMARY===
<=120字摘要(陈述核心事实,别用套话)
===CONTENT===
新闻正文`;

const SHORT = `${COMMON}
你是一名专业中文记者,为西雅图华人社区新闻站写**短而精**的快讯(150-300字)。根据下面内容用中文写。
${ANTI_AI}
【本地视角】本地相关性有就点,没有别硬凑。短讯写连贯的 1-2 段即可。
严格按下面格式输出(不要 JSON、不要多余文字):
===TITLE===
中文标题
===SUMMARY===
<=80字摘要
===CONTENT===
新闻正文`;

// 确定性后处理:中文基本不用破折号,模型常漏改 → 代码强制替换,作为可靠保证。
function cleanStyle(s: string): string {
	return s
		.replace(/[—–]+/g, '，') // 破折号(——/—/–)→ 逗号
		.replace(/，{2,}/g, '，') // 收掉连续逗号
		.replace(/([。！？；：、，])，/g, '$1') // 标点后多余逗号
		.replace(/，([。！？；：])/g, '$1'); // 标点前多余逗号
}

function parseSections(text: string): Rewritten {
	const grab = (tag: string) => {
		const m = text.match(new RegExp(`===${tag}===(.*?)(?=\\n===|$)`, 's'));
		return m ? m[1].trim() : '';
	};
	const content = grab('CONTENT').replace(/^```(?:markdown|md)?\s*|\s*```$/gs, '').trim();
	return { title: cleanStyle(grab('TITLE')), summary: cleanStyle(grab('SUMMARY')), content: cleanStyle(content) };
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
