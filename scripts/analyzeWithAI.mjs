const API_BASE = process.env.NVIDIA_API_BASE || 'https://integrate.api.nvidia.com/v1';
const MODELS = ['nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-nano-30b-a3b'];
const MAX_TOKENS = 16384;
const TIMEOUT = 660000;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function truncatePapers(papers, maxChars = 80000) {
  let total = 0;
  const result = [];
  for (const p of papers) {
    const entry = `PMID: ${p.pmid}\nTitle: ${p.title}\nAuthors: ${p.first_author}${p.authors.length > 1 ? ' et al.' : ''}\nJournal: ${p.journal_abbr || p.journal}\nDate: ${p.pub_date}\nAbstract: ${p.abstract.slice(0, 800)}\n---`;
    if (total + entry.length > maxChars) break;
    total += entry.length;
    result.push(entry);
  }
  return result.join('\n\n');
}

function extractJSON(text) {
  let jsonStr = text.trim();
  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  }
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    jsonStr = braceMatch[0];
  }
  jsonStr = jsonStr
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    .replace(/\t/g, '  ');
  try {
    return JSON.parse(jsonStr);
  } catch {}
  const lines = jsonStr.split('\n');
  const cleaned = lines
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#'))
    .join('\n');
  try {
    return JSON.parse(cleaned);
  } catch {}
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch {}
    }}
  }
  return null;
}

function buildFallbackAnalysis(papers) {
  const papersData = papers.map(p => ({
    title: p.title,
    authors: `${p.first_author}${p.authors.length > 1 ? ' et al.' : ''}`,
    journal: p.journal_abbr || p.journal,
    pub_date: p.pub_date,
    pmid: p.pmid,
    url: p.url,
    doi: p.doi,
    summary: p.abstract.slice(0, 200) + (p.abstract.length > 200 ? '...' : ''),
    key_findings: [],
    relevance: 'mid',
    category: 'Uncategorized'
  }));
  return {
    summary: `Today's report covers ${papers.length} new research papers related to road rage, aggressive driving, and driving anger.`,
    top_picks: papersData.slice(0, 5),
    papers: papersData,
    keywords: ['road rage', 'aggressive driving', 'driving anger'],
    topic_distribution: { Uncategorized: papers.length }
  };
}

async function callModel(model, messages, retryCount = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    console.log(`  🤖 Calling ${model} (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 1.0,
        top_p: 0.95,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });
    if (res.status === 429) {
      const waitSec = 60 * (retryCount + 1);
      console.log(`  ⏳ Rate limited, waiting ${waitSec}s...`);
      await sleep(waitSec * 1000);
      return callModel(model, messages, retryCount + 1);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response content');
    console.log(`  ✅ ${model} responded (${content.length} chars)`);
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzePapers(papers) {
  if (papers.length === 0) {
    return {
      summary: '今日沒有新的路怒研究文獻。',
      top_picks: [],
      papers: [],
      keywords: [],
      topic_distribution: {}
    };
  }

  const papersText = truncatePapers(papers);
  const systemPrompt = `你是一位專精於路怒症（road rage）、攻擊性駕駛（aggressive driving）、駕駛憤怒（driving anger）領域的研究分析專家。

你的任務是分析最新的研究文獻，產生結構化的 JSON 報告。

請用繁體中文（台灣）回答，但保留英文專有名詞（如期刊名、量表名稱）。

分類主題請使用以下類別：
- 交通心理與行為（Traffic Psychology）
- 人格與心理學（Personality & Psychology）
- 神經科學與生理（Neuroscience & Physiology）
- 精神醫學與臨床（Psychiatry & Clinical）
- 公共衛生與預防（Public Health & Prevention）
- 社會學與犯罪學（Sociology & Criminology）
- 介入與治療（Intervention & Treatment）
- 物質使用（Substance Use）
- 測量與方法學（Measurement & Methodology）
- 駕駛模擬與實驗（Simulator & Experimental）
- 青少年駕駛（Young Drivers）
- 環境與氣候（Environment & Climate）
- 法律與政策（Legal & Policy）

相關性評估：
- high: 直接探討路怒/攻擊性駕駛的核心研究
- mid: 與路怒相關的周邊研究（情緒調節、衝動性等）
- low: 間接相關（如一般攻擊性研究）

你必須回傳嚴格的 JSON 格式，結構如下：
{
  "summary": "一段 100-200 字的繁體中文日報總結，概述今日文獻的主要發現和趨勢",
  "top_picks": [
    {
      "title": "論文英文標題",
      "authors": "First Author et al.",
      "journal": "期刊縮寫",
      "pub_date": "發表日期",
      "pmid": "PMID",
      "url": "PubMed 連結",
      "doi": "DOI（如有）",
      "summary": "100-150 字繁體中文摘要",
      "key_findings": ["發現1", "發現2", "發現3"],
      "clinical_implications": "臨床或實務應用建議（繁體中文）",
      "relevance": "high/mid/low",
      "category": "分類主題"
    }
  ],
  "papers": [
    {
      "title": "論文標題",
      "authors": "First Author et al.",
      "journal": "期刊",
      "pub_date": "日期",
      "pmid": "PMID",
      "url": "PubMed 連結",
      "doi": "DOI",
      "summary": "50-100 字繁體中文簡述",
      "relevance": "high/mid/low",
      "category": "分類"
    }
  ],
  "keywords": ["關鍵字1", "關鍵字2", ...],
  "topic_distribution": {
    "分類1": 數量,
    "分類2": 數量
  }
}

規則：
1. top_picks 選擇 5-8 篇最重要或最有趣的研究，按重要性排序
2. papers 包含所有論文（包括 top_picks）
3. 所有中文內容使用繁體中文（台灣用語）
4. key_findings 每篇 2-4 點
5. keywords 提取 10-20 個重要關鍵字
6. topic_distribution 的分類數量要與 papers 的 category 對應
7. 只回傳 JSON，不要加任何其他文字`;

  const userPrompt = `以下是今天從 PubMed 抓取的最新路怒相關研究文獻，共 ${papers.length} 篇。請分析這些文獻，生成結構化的 JSON 日報。

${papersText}

請生成完整的 JSON 分析報告。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const raw = await callModel(model, messages, attempt);
        const parsed = extractJSON(raw);
        if (parsed && parsed.papers) {
          console.log(`  ✅ Successfully parsed JSON with ${model}`);
          return parsed;
        }
        console.warn(`  ⚠️ JSON parse failed for ${model}, attempt ${attempt + 1}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(2000 * (attempt + 1));
        }
      } catch (e) {
        console.warn(`  ⚠️ ${model} attempt ${attempt + 1} failed: ${e.message}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(3000 * (attempt + 1));
        }
      }
    }
  }

  console.warn('  ❌ All models failed, using fallback analysis');
  return buildFallbackAnalysis(papers);
}
