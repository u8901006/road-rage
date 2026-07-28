export function generateReportHTML(analysis, date, totalCount) {
  const topPicks = analysis.top_picks || [];
  const papers = analysis.papers || [];
  const keywords = analysis.keywords || [];
  const topicDist = analysis.topic_distribution || {};
  const summary = analysis.summary || '';
  const otherPapers = papers.filter(p =>
    !topPicks.some(tp => tp.pmid === p.pmid)
  );
  const topPickPmids = new Set(topPicks.map(p => p.pmid));

  function esc(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function relevanceBadge(level) {
    const config = {
      high: { label: '核心研究', color: '#5a7a3a', bg: 'rgba(90,122,58,0.1)' },
      mid: { label: '相關研究', color: '#9f7a2e', bg: 'rgba(159,122,46,0.1)' },
      low: { label: '周邊研究', color: '#766453', bg: 'rgba(118,100,83,0.08)' }
    };
    const c = config[level] || config.mid;
    return `<span class="badge" style="color:${c.color};background:${c.bg};border:1px solid ${c.color}30">${c.label}</span>`;
  }

  function topicBadge(category) {
    return `<span class="topic-badge">${esc(category)}</span>`;
  }

  const topicEntries = Object.entries(topicDist).sort((a, b) => b[1] - a[1]);
  const maxTopicCount = topicEntries.length > 0 ? topicEntries[0][1] : 1;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>路怒研究日報 ${date} | Road Rage Research Daily</title>
<meta name="description" content="路怒症、攻擊性駕駛、駕駛憤怒研究文獻日報 - ${date}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f6f1e8;
  --surface: #fffaf2;
  --line: #d8c5ab;
  --text: #2b2118;
  --muted: #766453;
  --accent: #8c4f2b;
  --accent-soft: #ead2bf;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif;
  color: var(--text);
  background: radial-gradient(circle at top, #fff6ea 0, #f6f1e8 55%, #ead8c6 100%);
  background-attachment: fixed;
  min-height: 100vh;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
.container {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 20px;
}

/* ── Header ── */
header {
  text-align: center;
  padding: 48px 24px 36px;
  animation: fadeDown 0.6s ease-out;
}
header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
header .subtitle {
  font-family: "Inter", "Noto Sans TC", sans-serif;
  font-size: 0.95rem;
  color: var(--muted);
  font-weight: 400;
}
.header-badges {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.header-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 4px 14px;
  font-size: 0.82rem;
  color: var(--muted);
  font-weight: 500;
}
.header-badge .icon { font-size: 0.9rem; }

/* ── Summary Card ── */
.summary-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 24px 28px;
  margin: 24px 0 32px;
  font-size: 0.95rem;
  color: var(--text);
  line-height: 1.85;
  box-shadow: 0 1px 4px rgba(139,79,43,0.06);
  animation: fadeUp 0.5s ease-out 0.1s both;
}
.summary-card .label {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--accent);
  margin-bottom: 8px;
}

/* ── Sections ── */
.section {
  margin: 32px 0;
  animation: fadeUp 0.5s ease-out both;
}
.section:nth-child(3) { animation-delay: 0.2s; }
.section:nth-child(4) { animation-delay: 0.3s; }
.section:nth-child(5) { animation-delay: 0.4s; }
.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  padding-bottom: 10px;
  border-bottom: 2px solid var(--accent);
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title .emoji { font-size: 1.2rem; }

/* ── News Cards ── */
.news-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 22px 24px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(139,79,43,0.05);
  transition: box-shadow 0.2s, transform 0.15s;
}
.news-card:hover {
  box-shadow: 0 4px 14px rgba(139,79,43,0.1);
  transform: translateY(-1px);
}
.news-card.featured {
  border-left: 4px solid var(--accent);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.card-rank {
  background: var(--accent);
  color: #fff7f0;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 10px;
  white-space: nowrap;
}
.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.5;
  flex: 1;
}
.card-title a {
  color: var(--text);
  text-decoration: none;
}
.card-title a:hover {
  color: var(--accent);
}
.card-meta {
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.card-meta .journal {
  font-weight: 500;
  font-style: italic;
}
.card-summary {
  font-size: 0.9rem;
  color: #3d3228;
  line-height: 1.75;
  margin: 8px 0;
}
.card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
}
.topic-badge {
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
}
.key-findings {
  margin: 10px 0;
  padding-left: 18px;
}
.key-findings li {
  font-size: 0.86rem;
  color: #3d3228;
  margin-bottom: 4px;
  line-height: 1.6;
}
.clinical-implications {
  background: rgba(90,122,58,0.06);
  border-left: 3px solid #5a7a3a;
  border-radius: 0 8px 8px 0;
  padding: 10px 14px;
  margin-top: 10px;
  font-size: 0.84rem;
  color: #4a5a2e;
  line-height: 1.65;
}
.clinical-implications .label {
  font-weight: 600;
  color: #5a7a3a;
  font-size: 0.75rem;
  display: block;
  margin-bottom: 2px;
}

/* ── Topic Distribution ── */
.topic-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.topic-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.topic-bar-label {
  width: 180px;
  font-size: 0.82rem;
  color: var(--text);
  text-align: right;
  flex-shrink: 0;
  font-weight: 500;
}
.topic-bar-track {
  flex: 1;
  height: 22px;
  background: rgba(139,79,43,0.06);
  border-radius: 6px;
  overflow: hidden;
}
.topic-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #c47a4a);
  border-radius: 6px;
  min-width: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff7f0;
  transition: width 0.6s ease-out;
}

/* ── Keywords ── */
.keywords-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.keyword-tag {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 4px 14px;
  font-size: 0.8rem;
  color: var(--muted);
  transition: background 0.2s, color 0.2s;
}
.keyword-tag:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

/* ── Clinic Banner ── */
.clinic-banner {
  background: linear-gradient(135deg, var(--accent) 0%, #c47a4a 100%);
  border-radius: 14px;
  padding: 28px 24px;
  margin: 36px 0 20px;
  text-align: center;
  color: #fff7f0;
  animation: fadeUp 0.5s ease-out 0.5s both;
}
.clinic-banner h3 {
  font-size: 1.1rem;
  margin-bottom: 12px;
  font-weight: 600;
}
.clinic-banner .links {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}
.clinic-banner a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.18);
  color: #fff7f0;
  text-decoration: none;
  padding: 8px 18px;
  border-radius: 24px;
  font-size: 0.88rem;
  font-weight: 500;
  transition: background 0.2s;
  backdrop-filter: blur(4px);
}
.clinic-banner a:hover {
  background: rgba(255,255,255,0.3);
}

/* ── Footer ── */
footer {
  text-align: center;
  padding: 24px 0 16px;
  font-size: 0.78rem;
  color: var(--muted);
  border-top: 1px solid var(--line);
  margin-top: 20px;
}
footer a { color: var(--accent); text-decoration: none; }
footer a:hover { text-decoration: underline; }
footer .source { margin-bottom: 4px; }

/* ── Animations ── */
@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Responsive ── */
@media (max-width: 600px) {
  .container { padding: 16px 12px; }
  header { padding: 32px 12px 24px; }
  header h1 { font-size: 1.35rem; }
  .news-card { padding: 16px; }
  .topic-bar-label { width: 120px; font-size: 0.75rem; }
  .clinic-banner .links { flex-direction: column; align-items: center; }
}

/* ── Print ── */
@media print {
  body { background: #fff; }
  .news-card, .summary-card { break-inside: avoid; box-shadow: none; }
}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>🚗 路怒研究日報</h1>
    <div class="subtitle">Road Rage Research Daily Report</div>
    <div class="header-badges">
      <span class="header-badge"><span class="icon">📅</span> ${date}</span>
      <span class="header-badge"><span class="icon">📄</span> ${totalCount} 篇新文獻</span>
      <span class="header-badge"><span class="icon">🏷️</span> ${topPicks.length} 篇精選</span>
    </div>
  </header>

  <div class="summary-card">
    <span class="label">📊 今日總結</span>
    <p>${esc(summary)}</p>
  </div>

  ${topPicks.length > 0 ? `
  <div class="section">
    <h2 class="section-title"><span class="emoji">⭐</span> 精選研究 Top Picks</h2>
    ${topPicks.map((p, i) => `
    <div class="news-card featured">
      <div class="card-header">
        <div class="card-title">
          <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        </div>
        <span class="card-rank">#${i + 1}</span>
      </div>
      <div class="card-meta">
        <span class="journal">${esc(p.journal)}</span>
        <span>${esc(p.authors)}</span>
        <span>${esc(p.pub_date)}</span>
        ${p.doi ? `<span>DOI: <a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(p.doi)}</a></span>` : ''}
      </div>
      <div class="card-summary">${esc(p.summary)}</div>
      ${p.key_findings && p.key_findings.length > 0 ? `
      <ul class="key-findings">
        ${p.key_findings.map(f => `<li>${esc(f)}</li>`).join('')}
      </ul>` : ''}
      ${p.clinical_implications ? `
      <div class="clinical-implications">
        <span class="label">🏥 臨床 / 實務應用</span>
        ${esc(p.clinical_implications)}
      </div>` : ''}
      <div class="card-badges">
        ${relevanceBadge(p.relevance)}
        ${p.category ? topicBadge(p.category) : ''}
      </div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${otherPapers.length > 0 ? `
  <div class="section">
    <h2 class="section-title"><span class="emoji">📚</span> 其他研究文獻</h2>
    ${otherPapers.map(p => `
    <div class="news-card">
      <div class="card-title" style="margin-bottom:8px">
        <a href="${esc(p.url)}" target="_blank" rel="noopener" style="font-size:0.92rem">${esc(p.title)}</a>
      </div>
      <div class="card-meta">
        <span class="journal">${esc(p.journal)}</span>
        <span>${esc(p.authors)}</span>
        <span>${esc(p.pub_date)}</span>
      </div>
      <div class="card-summary" style="font-size:0.85rem">${esc(p.summary)}</div>
      <div class="card-badges">
        ${relevanceBadge(p.relevance)}
        ${p.category ? topicBadge(p.category) : ''}
      </div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${topicEntries.length > 0 ? `
  <div class="section">
    <h2 class="section-title"><span class="emoji">📊</span> 主題分布</h2>
    <div class="topic-bars">
      ${topicEntries.map(([topic, count]) => `
      <div class="topic-bar-row">
        <div class="topic-bar-label">${esc(topic)}</div>
        <div class="topic-bar-track">
          <div class="topic-bar-fill" style="width:${Math.max(8, (count / maxTopicCount) * 100)}%">${count}</div>
        </div>
      </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  ${keywords.length > 0 ? `
  <div class="section">
    <h2 class="section-title"><span class="emoji">🏷️</span> 關鍵字</h2>
    <div class="keywords-cloud">
      ${keywords.map(k => `<span class="keyword-tag">${esc(k)}</span>`).join('')}
    </div>
  </div>
  ` : ''}

  <div class="clinic-banner">
    <h3>🏥 李政洋身心診所</h3>
    <div class="links">
      <a href="https://www.leepsyclinic.com/" target="_blank" rel="noopener">🌐 診所首頁</a>
      <a href="https://blog.leepsyclinic.com/" target="_blank" rel="noopener">📬 訂閱電子報</a>
      <a href="https://buymeacoffee.com/CYlee" target="_blank" rel="noopener">☕ Buy Me a Coffee</a>
    </div>
  </div>

  <footer>
    <div class="source">資料來源：PubMed NCBI E-utilities | AI 分析：NVIDIA Nemotron</div>
    <div>
      <a href="index.html">📅 所有日報</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/u8901006/road-rage" target="_blank" rel="noopener">GitHub</a>
    </div>
  </footer>
</div>
</body>
</html>`;
}
