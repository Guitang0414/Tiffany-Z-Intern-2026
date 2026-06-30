// Claude 改寫：走 OpenAI 相容閘道（Tailscale）。
// 輸出風格：《大紀元》西雅圖版（epochtimesnw.com）繁體中文。
// 合規：提取事實重寫，不翻譯照搬，不點名來源媒體，不署具名記者。
// ⚠️ 閘道前置了 Claude-Code system prompt → 指令必須放 user 消息（別用 system role）。
import OpenAI from 'openai';
import { config } from './config';
import type { Lead, Rewritten, Usage } from './types';

const client = new OpenAI({ baseURL: config.GATEWAY_BASE_URL, apiKey: config.GATEWAY_API_KEY });

const COMMON = '【嚴格要求】直接輸出結果，不要提問、不要解釋、不要客套。';

// 大紀元西雅圖版核心風格規範（ARTICLE / SHORT 共用）。
const EPOCH_STYLE = `【語言】繁體中文；台灣用語（資訊/短片/軟體/網際網路）；引號「」；書名號《》；省略號……；破折號——。
【人名】首次出現：中文音譯（English Full Name），之後只用中文姓，不重複括號。使用台灣/港澳通行譯法，不用大陸譯法。
【機構/組織】中文全名（English Name，英文縮寫），例：西雅圖市中心協會（Downtown Seattle Association，DSA）。
【地名】固定用名：西雅圖、華盛頓州（簡稱華州）、美國。
【數字】大數字用萬/億（1,400億美元、1萬8,000人）；百分比用%；距離英制+公制並列（400英里（644公里））；溫度以攝氏為主。
【引述】姓說：「……」 或 姓表示，……；忠實翻譯，不改動政策數字或官員原話。
【像記者寫稿，不是 AI 總結——嚴格遵守】
1. 只用原文裡確實有的事實。絕對不要編造引語、人物、時間、數字、情節；原文沒有的細節一個字都別加。
2. 具體優先於概括：寫原文裡的具體細節（誰、何時、在哪、做了什麼、說了什麼、多少、什麼結果），少寫抽象總結。
3. 有原話就用直接引語（譯成中文並注明是誰說的）；原文沒有引語就不要硬造。
4. 不要替人物揣測情緒/心理：除非原文明確寫了，否則不要寫「平靜與篤定」「歷經波折」「言語間流露出」這類腦補。
5. 每段帶出新事實，不要把上一段換說法重複，也不要純抒情。
6. 新聞式收尾：結尾落在具體事實、下一步或未決問題上，不寫評論式升華（如「多了幾分真實的人情味」）。
【合規：不點名來源】絕不點名來源媒體（不寫「據《西雅圖時報》」「KING 5 稱」「據報導」等），不出現「原文」「翻譯」「轉載」等字樣；以本站獨立報道的口吻寫。
【禁用套話】近日、引發關注、保持低調、值得注意的是、與此同時、在……背景下。`;

// 今天日期字串，供正文第一行固定格式使用。
function todayStr(): string {
	const d = new Date();
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}年${mm}月${dd}日`;
}

function buildDeepPrompt(date: string): string {
	return `${COMMON}
你是《大紀元》西雅圖版（epochtimesnw.com）的中文編輯，請將下面英文新聞改寫成符合本報風格的繁體中文深度報導。

${EPOCH_STYLE}

【標題】10–25個中文字；可用一個空格分隔兩個語意組（「赤字逼近5億 西雅圖再尋稅源」）；數字用阿拉伯數字；動詞前置；不加標點結尾（問句除外）。

【正文結構】
- 第一行固定格式（直接輸出，不另起標題）：【${date}訊】（本報綜合編譯）第一句導言緊接著寫，即點出人物、事件、影響。
- 之後自然分段，每段3–5句；正文超過500字時可加粗體小標（不加「：」），500字以內一律不加小標。
- 結尾落在具體事實或未決問題，不寫評論式升華。
- 素材足夠時正文寫到500–900字，充實靠事實，不是套話注水。

嚴格按下面格式輸出（不要 JSON、不要多餘文字）：
===TITLE===
繁體中文標題
===SUMMARY===
<=120字摘要（陳述核心事實，不用套話）
===CONTENT===
新聞正文（第一行即【${date}訊】格式）`;
}

function buildShortPrompt(date: string): string {
	return `${COMMON}
你是《大紀元》西雅圖版（epochtimesnw.com）的中文編輯，請將下面英文新聞改寫成符合本報風格的繁體中文快訊（150–300字）。

${EPOCH_STYLE}

【標題】10–20個中文字；數字用阿拉伯數字；動詞前置。

【正文結構】
- 第一行固定格式：【${date}訊】（本報綜合編譯）第一句導言。
- 之後寫1–2段，每段3–4句；結尾落在具體事實上。

嚴格按下面格式輸出：
===TITLE===
繁體中文標題
===SUMMARY===
<=80字摘要
===CONTENT===
快訊正文（第一行即【${date}訊】格式）`;
}

// 確定性後處理：去掉連續逗號等排版問題。
// 大紀元風格允許破折號（——），故不做替換。
function cleanStyle(s: string): string {
	return s
		.replace(/，{2,}/g, '，')
		.replace(/([。！？；：、，])，/g, '$1')
		.replace(/，([。！？；：])/g, '$1');
}

function parseSections(text: string): Rewritten {
	const grab = (tag: string) => {
		const m = text.match(new RegExp(`===${tag}===(.*?)(?=\\n===|$)`, 's'));
		return m ? m[1].trim() : '';
	};
	const content = grab('CONTENT').replace(/^```(?:markdown|md)?\s*|\s*```$/gs, '').trim();
	return { title: cleanStyle(grab('TITLE')), summary: cleanStyle(grab('SUMMARY')), content: cleanStyle(content) };
}

/** 把一條線索的原文改寫成繁體中文。返回改寫結果 + token 用量（供 budget 計）。 */
export async function rewrite(lead: Lead, sourceText: string): Promise<{ rewritten: Rewritten; usage: Usage }> {
	const isDeep = lead.contentType === 'ARTICLE';
	const date = todayStr();
	const prompt = isDeep ? buildDeepPrompt(date) : buildShortPrompt(date);
	const resp = await client.chat.completions.create({
		model: isDeep ? config.MODEL_DEEP : config.MODEL_SHORT,
		messages: [{ role: 'user', content: `${prompt}\n\n原標題: ${lead.sourceTitle}\n\n原文（截斷）:\n${sourceText}` }],
		max_tokens: isDeep ? 3000 : 900,
		temperature: 0.3,
	});
	const rewritten = parseSections(resp.choices[0]?.message?.content ?? '');
	return { rewritten, usage: { totalTokens: resp.usage?.total_tokens ?? 0 } };
}
