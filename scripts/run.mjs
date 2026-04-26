import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchRecentPapers } from './fetchPapers.mjs';
import { analyzePapers } from './analyzeWithAI.mjs';
import { generateReportHTML } from './generateReport.mjs';
import { generateIndexHTML } from './generateIndex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const targetDate = process.env.TARGET_DATE ||
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

  console.log(`\n🚗 Road Rage Daily Report — ${targetDate}`);
  console.log('═'.repeat(50));

  if (!process.env.ZHIPU_API_KEY) {
    console.error('❌ ZHIPU_API_KEY environment variable is required');
    process.exit(1);
  }

  const summarizedPath = path.join(ROOT, 'data', 'summarized.json');
  let summarized = { pmids: [] };
  try {
    const raw = await fs.readFile(summarizedPath, 'utf-8');
    summarized = JSON.parse(raw);
    console.log(`📋 Loaded ${summarized.pmids.length} previously summarized PMIDs`);
  } catch {
    console.log('📋 No previous summarization record found');
  }

  console.log('\n📡 Fetching papers from PubMed...');
  const allPapers = await fetchRecentPapers(7);

  const summarizedSet = new Set(summarized.pmids);
  const newPapers = allPapers.filter(p => !summarizedSet.has(p.pmid));
  console.log(`\n📊 Results: ${allPapers.length} total, ${newPapers.length} new (not yet summarized)`);

  if (newPapers.length === 0) {
    console.log('✅ No new papers to summarize. Generating index only...');
    await generateIndex(targetDate);
    console.log('✅ Done!');
    return;
  }

  console.log(`\n🤖 Analyzing ${newPapers.length} papers with GLM AI...`);
  const analysis = await analyzePapers(newPapers);

  console.log('\n📄 Generating HTML report...');
  const html = generateReportHTML(analysis, targetDate, newPapers.length);
  const docsDir = path.join(ROOT, 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  const reportPath = path.join(docsDir, `road-rage-${targetDate}.html`);
  await fs.writeFile(reportPath, html, 'utf-8');
  console.log(`  ✅ Report saved: docs/road-rage-${targetDate}.html`);

  const newPmids = newPapers.map(p => p.pmid);
  summarized.pmids = [...new Set([...summarized.pmids, ...newPmids])];
  if (summarized.pmids.length > 2000) {
    summarized.pmids = summarized.pmids.slice(-2000);
  }
  summarized.last_updated = targetDate;
  await fs.writeFile(summarizedPath, JSON.stringify(summarized, null, 2), 'utf-8');
  console.log(`  ✅ Updated summarized list (${summarized.pmids.length} total PMIDs)`);

  await generateIndex(targetDate);

  console.log('\n' + '═'.repeat(50));
  console.log('✅ All done!');
}

async function generateIndex(currentDate) {
  const docsDir = path.join(ROOT, 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  const html = await generateIndexHTML(docsDir, currentDate);
  await fs.writeFile(path.join(docsDir, 'index.html'), html, 'utf-8');
  console.log('  ✅ Index page updated');
}

main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
