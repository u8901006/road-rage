import { XMLParser } from 'fast-xml-parser';

const ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

const QUERIES = [
  {
    name: 'broad',
    query: '("road rage"[tiab] OR "aggressive driving"[tiab] OR "driving anger"[tiab] OR "driver anger"[tiab] OR "traffic aggression"[tiab] OR "Aggressive Driving"[Mesh]) AND humans[Filter]'
  },
  {
    name: 'psychology',
    query: '("aggressive driving"[tiab] OR "driving anger"[tiab] OR "road rage"[tiab]) AND ("trait anger"[tiab] OR impulsiv*[tiab] OR "sensation seeking"[tiab] OR personality[tiab] OR "emotion regulation"[tiab] OR "hostile attribution"[tiab])'
  },
  {
    name: 'neuroscience',
    query: '("road rage"[tiab] OR "driving anger"[tiab] OR "aggressive driving"[tiab]) AND (neuroscience[tiab] OR "prefrontal cortex"[tiab] OR amygdala[tiab] OR "inhibitory control"[tiab] OR "executive function"[tiab] OR psychophysiology[tiab] OR "heart rate variability"[tiab])'
  },
  {
    name: 'psychiatry',
    query: '("road rage"[tiab] OR "aggressive driving"[tiab] OR "driving anger"[tiab]) AND ("intermittent explosive disorder"[tiab] OR "impulsive aggression"[tiab] OR irritability[tiab] OR ADHD[tiab] OR "substance use"[tiab] OR alcohol[tiab] OR stress[tiab])'
  },
  {
    name: 'public_health',
    query: '("aggressive driving"[tiab] OR "road rage"[tiab] OR "driving anger"[tiab]) AND ("traffic injury"[tiab] OR "road traffic crash"[tiab] OR "motor vehicle crash"[tiab] OR injury[tiab] OR prevention[tiab] OR policy[tiab])'
  },
  {
    name: 'sociology',
    query: '("road rage"[tiab] OR "aggressive driving"[tiab] OR "traffic aggression"[tiab]) AND ("social norms"[tiab] OR "urban stress"[tiab] OR congestion[tiab] OR incivility[tiab] OR policing[tiab] OR deterrence[tiab] OR enforcement[tiab])'
  },
  {
    name: 'intervention',
    query: '("aggressive driving"[tiab] OR "road rage"[tiab] OR "driving anger"[tiab]) AND (intervention[tiab] OR "anger management"[tiab] OR "emotion regulation"[tiab] OR CBT[tiab] OR training[tiab] OR prevention[tiab])'
  },
  {
    name: 'substance',
    query: '("aggressive driving"[tiab] OR "road rage"[tiab] OR "driving anger"[tiab]) AND (alcohol[tiab] OR cannabis[tiab] OR intoxication[tiab] OR DUI[tiab] OR "drug use"[tiab])'
  },
  {
    name: 'crash_risk',
    query: '("aggressive driving"[tiab] OR "driving anger"[tiab] OR "road rage"[tiab]) AND ("crash risk"[tiab] OR "traffic accident*"[tiab] OR "near miss*"[tiab] OR collision*[tiab] OR injury[tiab])'
  },
  {
    name: 'young_drivers',
    query: '("aggressive driving"[tiab] OR "road rage"[tiab] OR "driving anger"[tiab]) AND ("young driver*"[tiab] OR adolescent*[tiab] OR teen*[tiab] OR youth[tiab] OR "peer passenger*"[tiab])'
  },
  {
    name: 'measurement',
    query: '("Driving Anger Scale"[tiab] OR "Driving Anger Expression Inventory"[tiab] OR "Dula Dangerous Driving Index"[tiab] OR "Driver Behavior Questionnaire"[tiab]) AND (aggress*[tiab] OR anger[tiab] OR risky[tiab])'
  },
  {
    name: 'high_sensitivity',
    query: '(("road rage"[Title/Abstract]) OR ("driving anger"[Title/Abstract]) OR ("aggressive driving"[Title/Abstract]))'
  }
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['PubmedArticle', 'Author', 'AbstractText'].includes(name)
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildDateFilter(days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const from = since.toISOString().slice(0, 10).replace(/-/g, '/');
  return `"${from}"[Date - Publication] : "3000"[Date - Publication]`;
}

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function esearch(query, days, retmax = 100, retries = 2) {
  const dateFilter = buildDateFilter(days);
  const fullQuery = `(${query}) AND ${dateFilter}`;
  const params = new URLSearchParams({
    db: 'pubmed',
    term: fullQuery,
    retmax: String(retmax),
    retmode: 'json',
    usehistory: 'y'
  });
  const url = `${ESEARCH_URL}?${params}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`  🔍 [${attempt + 1}/${retries + 1}] ${url.slice(0, 100)}...`);
      const res = await fetchWithTimeout(url, 30000);
      if (!res.ok) throw new Error(`esearch HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.esearchresult;
      if (!result) throw new Error('Invalid esearch response');
      return {
        count: parseInt(result.count || '0', 10),
        ids: (result.idlist || []).map(String)
      };
    } catch (e) {
      if (attempt < retries) {
        console.log(`  ⏳ Retry ${attempt + 1} for esearch...`);
        await sleep(2000 * (attempt + 1));
      } else {
        throw e;
      }
    }
  }
}

async function efetch(pmids, retries = 2) {
  if (pmids.length === 0) return [];
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    rettype: 'abstract',
    retmode: 'xml'
  });
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(`${EFETCH_URL}?${params}`, 45000);
      if (!res.ok) throw new Error(`efetch HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parser.parse(xml);
      const articles = parsed?.PubmedArticleSet?.PubmedArticle || [];
      return Array.isArray(articles) ? articles : [articles];
    } catch (e) {
      if (attempt < retries) {
        console.log(`  ⏳ Retry efetch ${attempt + 1}...`);
        await sleep(3000 * (attempt + 1));
      } else {
        throw e;
      }
    }
  }
}

function extractPaper(article) {
  try {
    const medline = article?.MedlineCitation;
    const articleData = medline?.Article;
    const pmid = String(medline?.PMID?.['#text'] || medline?.PMID || '');
    const title = articleData?.ArticleTitle || '';
    const journal = articleData?.Journal?.Title || '';
    const jAbbr = articleData?.Journal?.ISOAbbreviation || articleData?.Journal?.MedlineTA || '';
    const pubDateObj = articleData?.Journal?.JournalIssue?.PubDate;
    let pubDate = '';
    if (pubDateObj) {
      const y = pubDateObj.Year || '';
      const m = pubDateObj.Month || '';
      const d = pubDateObj.Day || '';
      pubDate = [y, m, d].filter(Boolean).join(' ');
    }
    const abstractTexts = articleData?.Abstract?.AbstractText;
    let abstract = '';
    if (Array.isArray(abstractTexts)) {
      abstract = abstractTexts.map(t => {
        if (typeof t === 'string') return t;
        const label = t['@_Label'] ? `${t['@_Label']}: ` : '';
        return label + (t['#text'] || '');
      }).join(' ');
    } else if (typeof abstractTexts === 'string') {
      abstract = abstractTexts;
    } else if (abstractTexts?.['#text']) {
      abstract = abstractTexts['#text'];
    }
    const authors = articleData?.AuthorList?.Author || [];
    const authorList = (Array.isArray(authors) ? authors : [authors])
      .map(a => `${a.LastName || ''} ${a.ForeName || ''}`.trim())
      .filter(Boolean);
    const keywords = (medline?.KeywordList?.Keyword || []).map(k =>
      typeof k === 'string' ? k : k?.['#text'] || ''
    ).filter(Boolean);
    const meshTerms = (medline?.MeshHeadingList?.MeshHeading || []).map(m => {
      const d = m.DescriptorName;
      return typeof d === 'string' ? d : d?.['#text'] || '';
    }).filter(Boolean);
    const elocation = articleData?.ELocationID;
    let doi = '';
    if (Array.isArray(elocation)) {
      const found = elocation.find(e => e?.['@_EIdType'] === 'doi');
      doi = found?.['#text'] || '';
    } else if (elocation?.['@_EIdType'] === 'doi') {
      doi = elocation?.['#text'] || '';
    }
    return {
      pmid,
      title: typeof title === 'string' ? title : title?.['#text'] || '',
      journal,
      journal_abbr: jAbbr,
      pub_date: pubDate,
      authors: authorList,
      first_author: authorList[0] || 'Unknown',
      abstract,
      keywords,
      mesh_terms: meshTerms,
      doi,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    };
  } catch (e) {
    console.warn(`  ⚠️ Failed to parse article: ${e.message}`);
    return null;
  }
}

export async function fetchRecentPapers(days = 7) {
  const allPmids = new Set();
  const errors = [];

  for (const q of QUERIES) {
    try {
      const result = await esearch(q.query, days, 100);
      console.log(`  📋 ${q.name}: ${result.count} results, fetched ${result.ids.length} IDs`);
      result.ids.forEach(id => allPmids.add(id));
      await sleep(350);
    } catch (e) {
      console.warn(`  ⚠️ Query "${q.name}" failed: ${e.message}`);
      errors.push(q.name);
    }
  }

  console.log(`\n📊 Total unique PMIDs: ${allPmids.size}`);

  if (allPmids.size === 0) {
    console.log('ℹ️ No papers found');
    return [];
  }

  const pmidArray = [...allPmids];
  const BATCH = 50;
  const allPapers = [];

  for (let i = 0; i < pmidArray.length; i += BATCH) {
    const batch = pmidArray.slice(i, i + BATCH);
    console.log(`  📥 Fetching batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(pmidArray.length / BATCH)} (${batch.length} PMIDs)...`);
    try {
      const articles = await efetch(batch);
      for (const art of articles) {
        const paper = extractPaper(art);
        if (paper && paper.pmid && paper.title) {
          allPapers.push(paper);
        }
      }
    } catch (e) {
      console.warn(`  ⚠️ Batch fetch failed: ${e.message}`);
    }
    await sleep(350);
  }

  const seen = new Set();
  const unique = allPapers.filter(p => {
    if (seen.has(p.pmid)) return false;
    seen.add(p.pmid);
    return true;
  });

  console.log(`✅ Extracted ${unique.length} unique papers with details`);
  if (errors.length > 0) {
    console.log(`⚠️ Queries with errors: ${errors.join(', ')}`);
  }
  return unique;
}
