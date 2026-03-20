// HTML教材 → 単一PDF変換スクリプト
// 全セッションを1つのPDFに統合する
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR = __dirname;
const OUT_DIR = resolve(__dirname, 'PDF');
const OUTPUT_FILE = resolve(OUT_DIR, 'TMR_Training_All.pdf');

// 変換対象のHTMLファイル（順序付き）
const HTML_FILES = [
  'index.html',
  'session1.html',
  'session2.html',
  'session3.html',
  'session4.html',
  'session5.html',
  'session6.html',
  'session7.html',
];

// 文字サイズ縮小CSS + 閉じコンテンツ展開スクリプト
const PREPARE_PAGE_SCRIPT = `
  // 文字サイズを全体的に縮小
  const shrinkCSS = document.createElement('style');
  shrinkCSS.textContent = \`
    html { font-size: 13.5px !important; }
    .hero h1 { font-size: 1.9rem !important; }
    .hero-sub { font-size: .9rem !important; }
    .hero-meta { font-size: .8rem !important; }
    .hero { padding: 70px 24px 40px !important; }
    .section { padding: 40px 24px 32px !important; }
    .section-title { font-size: 1.15rem !important; }
    .topic-title { font-size: .95rem !important; }
    .topic p, .topic li { font-size: .84rem !important; line-height: 1.7 !important; }
    .card h3 { font-size: .9rem !important; }
    .card p, .card li { font-size: .78rem !important; }
    .callout { padding: 16px 20px !important; margin: 18px 0 !important; }
    .callout-title { font-size: .8rem !important; }
    .callout p { font-size: .8rem !important; }
    .code-block { font-size: .74rem !important; padding: 14px 18px !important; }
    .disc { padding: 18px 22px !important; }
    .disc h3 { font-size: .9rem !important; }
    .disc p, .disc li { font-size: .8rem !important; }
    .flow-step-label { font-size: .8rem !important; }
    .flow-step-desc { font-size: .76rem !important; }
    .quiz-q-text { font-size: .86rem !important; }
    .quiz-choice { font-size: .78rem !important; padding: 10px 14px !important; }
    .quiz-explanation { font-size: .74rem !important; }
    .hint-card h4 { font-size: .84rem !important; }
    .hint-card p { font-size: .74rem !important; }
    .hint-card .ex { font-size: .7rem !important; }
    .tbl-wrap table { font-size: .74rem !important; }
    .tbl-wrap th, .tbl-wrap td { padding: 7px 10px !important; }
    .pattern-card h3 { font-size: .86rem !important; }
    .pattern-card .step-text { font-size: .74rem !important; }
    .pattern-card .target { font-size: .7rem !important; }
    .card-grid { gap: 14px !important; margin-top: 14px !important; margin-bottom: 14px !important; }
    .card { padding: 20px 18px !important; }
    .ref-link { font-size: .68rem !important; }
    .site-footer { padding: 24px 24px !important; font-size: .7rem !important; }
    .footer-links a { font-size: .7rem !important; }
    .card-accent { padding: 20px 18px !important; }
    .card-accent h3 { font-size: .9rem !important; }
    .card-accent p { font-size: .78rem !important; }
    .dir-label { font-size: .66rem !important; }
    .h-flow .box { font-size: .7rem !important; padding: 8px 12px !important; }
    .reveal-content { font-size: .8rem !important; padding: 14px 18px !important; }
    table { font-size: .78rem !important; }
    th, td { padding: 8px 12px !important; }
  \`;
  document.head.appendChild(shrinkCSS);

  // クイズセクションを表示
  document.querySelectorAll('.quiz-questions').forEach(el => {
    el.classList.add('is-visible');
  });
  document.querySelectorAll('.quiz-start-btn').forEach(el => {
    el.style.display = 'none';
  });
  // 正解を表示
  document.querySelectorAll('.quiz-q-block').forEach(block => {
    block.querySelectorAll('.quiz-choice').forEach(choice => {
      const exp = choice.querySelector('.quiz-explanation');
      if (choice.getAttribute('data-correct') === 'true') {
        choice.classList.add('is-correct');
        if (exp) exp.classList.add('is-visible');
      } else {
        choice.classList.add('is-dimmed');
      }
    });
  });
  // reveal-content を全て開く
  document.querySelectorAll('.reveal-wrap').forEach(wrap => {
    wrap.classList.add('is-open');
  });
  document.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.style.display = 'none';
  });
  // sticky headerを解除
  const header = document.querySelector('.site-header');
  if (header) {
    header.style.position = 'static';
    header.style.backdropFilter = 'none';
  }
`;

async function main() {
  console.log('統合PDF変換を開始します...');

  // 0. 既存の個別PDFを削除
  const oldFiles = ['index.pdf','session1.pdf','session2.pdf','session3.pdf','session4.pdf','session5.pdf','session6.pdf','session7.pdf'];
  for (const f of oldFiles) {
    try { await unlink(resolve(OUT_DIR, f)); console.log(`  [削除] ${f}`); } catch {}
  }

  // 1. 個別PDFを一時生成
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const tempPaths = [];

  for (const file of HTML_FILES) {
    const srcPath = resolve(SRC_DIR, file);
    const tmpPath = resolve(OUT_DIR, `_tmp_${file.replace('.html', '.pdf')}`);
    tempPaths.push(tmpPath);

    const label = file.replace('.html', '');
    console.log(`  [生成] ${file}`);

    const page = await context.newPage();
    await page.goto(`file://${srcPath}`, { waitUntil: 'networkidle' });
    await page.evaluate(PREPARE_PAGE_SCRIPT);
    await page.waitForTimeout(500);

    await page.pdf({
      path: tmpPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: false,
    });
    await page.close();
  }
  await browser.close();

  // 2. pdf-lib で統合
  console.log('\n  [統合] 全ファイルを1つのPDFに結合中...');
  const merged = await PDFDocument.create();

  for (const tmpPath of tempPaths) {
    const bytes = await readFile(tmpPath);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }

  const mergedBytes = await merged.save();
  await writeFile(OUTPUT_FILE, mergedBytes);

  // 3. 一時ファイル削除
  for (const tmpPath of tempPaths) {
    await unlink(tmpPath);
  }

  const sizeMB = (mergedBytes.length / 1024 / 1024).toFixed(1);
  console.log(`\n完了: ${OUTPUT_FILE}`);
  console.log(`サイズ: ${sizeMB} MB / ${merged.getPageCount()} ページ`);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
