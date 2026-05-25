#!/usr/bin/env bun
// Reads backlog.csv → writes self-contained dashboard.html
// Usage: bun generate-dashboard.ts [csv_path] [out_html]

const csvPath = process.argv[2] ?? ".agents/no-github-backlog/backlog.csv";
const outPath = process.argv[3] ?? ".agents/no-github-backlog/dashboard.html";
const genTime = new Date().toUTCString().replace("GMT", "UTC");

const csvFile = Bun.file(csvPath);
if (!(await csvFile.exists())) {
  console.error(`ERROR: No CSV at ${csvPath}`);
  process.exit(1);
}

const csvContent = await csvFile.text();
const rowCount = csvContent.split("\n").slice(1).filter((l) => l.trim()).length;

// Escape content for embedding inside a JS template literal
const csvJs = csvContent
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

// NOTE: inside this template literal—
//   ${...}   = TypeScript interpolation (4 uses below: csvJs, genTime, rowCount, csvPath)
//   \`        = literal backtick in output (used to open/close JS template literals)
//   \${...}  = literal ${...} in output (JS template expressions inside HTML <script>)

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Backlog Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0d1117; color: #c9d1d9; min-height: 100vh; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    header { padding: 20px 32px; border-bottom: 1px solid #21262d;
             display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 18px; font-weight: 600; color: #e6edf3; }
    header .meta { font-size: 12px; color: #8b949e; text-align: right; line-height: 1.6; }

    .container { max-width: 1440px; margin: 0 auto; padding: 24px 32px; }

    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
             gap: 14px; margin-bottom: 28px; }
    .card { background: #161b22; border: 1px solid #21262d; border-radius: 8px;
            padding: 18px 16px; text-align: center; }
    .card .value { font-size: 34px; font-weight: 700; color: #e6edf3; line-height: 1; }
    .card .label { font-size: 12px; color: #8b949e; margin-top: 6px; }
    .card.merged   .value { color: #3fb950; }
    .card.closed   .value { color: #8b949e; }
    .card.triaged  .value { color: #d29922; }
    .card.quarantined .value { color: #f85149; }
    .card.in-progress .value { color: #58a6ff; }
    .card.skipped  .value { color: #6e7681; }

    .charts { display: grid; grid-template-columns: 220px 1fr 1.6fr; gap: 18px; margin-bottom: 28px; }
    @media (max-width: 1000px) { .charts { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 640px)  { .charts { grid-template-columns: 1fr; } }
    .chart-box { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 18px; }
    .chart-box h3 { font-size: 11px; font-weight: 600; color: #8b949e;
                    text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px; }
    .chart-box canvas { max-height: 200px; }

    .table-wrap { background: #161b22; border: 1px solid #21262d; border-radius: 8px;
                  overflow: hidden; margin-bottom: 32px; }
    .table-wrap h2 { font-size: 15px; font-weight: 600; color: #e6edf3;
                     padding: 14px 20px; border-bottom: 1px solid #21262d; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #161b22; padding: 9px 14px; text-align: left;
         font-size: 10px; font-weight: 600; color: #8b949e;
         text-transform: uppercase; letter-spacing: 0.5px;
         border-bottom: 1px solid #21262d; white-space: nowrap; }
    td { padding: 9px 14px; border-bottom: 1px solid #161b22; vertical-align: top; }
    tr.issue-row { cursor: pointer; }
    tr.issue-row:hover td, tr.issue-row.expanded td { background: #1c2128; }
    tr.detail-row td { background: #13161b; padding: 0; border-bottom: 1px solid #21262d; }
    tr.detail-row.hidden { display: none; }

    .pipeline { display: flex; gap: 3px; flex-wrap: wrap; }
    .sbadge { font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
    .sbadge.approve, .sbadge.merged { background: #1a3a21; color: #3fb950; }
    .sbadge.reject    { background: #3a1a1a; color: #f85149; }
    .sbadge.fix       { background: #2a2010; color: #d29922; }
    .sbadge.quarantine { background: #3a1a1a; color: #f85149; border: 1px solid #f85149; }
    .sbadge.close, .sbadge.triage, .sbadge.skipped { background: #21262d; color: #8b949e; }
    .sbadge.in-progress { background: #1a2a3a; color: #58a6ff; }

    .obadge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .obadge.merged      { background: #1a3a21; color: #3fb950; }
    .obadge.closed      { background: #21262d; color: #8b949e; }
    .obadge.triaged     { background: #2a2010; color: #d29922; }
    .obadge.quarantined { background: #3a1a1a; color: #f85149; }
    .obadge.in-progress { background: #1a2a3a; color: #58a6ff; }
    .obadge.skipped     { background: #21262d; color: #6e7681; }

    .ci-green { color: #3fb950; font-size: 12px; }
    .ci-red   { color: #f85149; font-size: 12px; }
    .ci-other { color: #d29922; font-size: 12px; }
    .em { color: #6e7681; }
    .issue-num { font-weight: 700; color: #58a6ff; }
    .toggle-icon { font-size: 9px; color: #6e7681; margin-left: 6px; user-select: none; }

    .detail-panel { padding: 14px 20px 20px; }
    .detail-grid  { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 10px; }
    .dstage { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 12px 14px; }
    .dstage-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .dstage-name { font-size: 11px; font-weight: 700; color: #e6edf3;
                   text-transform: uppercase; letter-spacing: 0.6px; }
    .dstage-time { font-size: 11px; color: #6e7681; }
    .dfield { display: grid; grid-template-columns: 110px 1fr; gap: 2px 10px; font-size: 12px; padding: 2px 0; }
    .dfield .k { color: #8b949e; }
    .dfield .v { color: #c9d1d9; word-break: break-word; }
    .dfield .v.mono { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 11px; }
    .dfield .v.pre  { white-space: pre-wrap; }

    footer { text-align: center; padding: 20px; font-size: 11px; color: #6e7681;
             border-top: 1px solid #21262d; }
  </style>
</head>
<body>
<header>
  <h1>&#127881; GitHub Backlog Dashboard</h1>
  <div class="meta">
    Generated ${genTime}<br>
    ${rowCount} log entries &bull; ${csvPath}
  </div>
</header>
<div class="container">
  <div class="cards" id="cards"></div>
  <div class="charts">
    <div class="chart-box"><h3>Outcomes</h3><canvas id="outcomesChart"></canvas></div>
    <div class="chart-box"><h3>Stage Funnel</h3><canvas id="funnelChart"></canvas></div>
    <div class="chart-box"><h3>Daily Activity</h3><canvas id="timelineChart"></canvas></div>
  </div>
  <div class="table-wrap">
    <h2>Issues</h2>
    <table>
      <thead>
        <tr>
          <th style="width:80px">#</th>
          <th>Title</th>
          <th>Pipeline</th>
          <th style="width:80px">PR</th>
          <th style="width:80px">CI</th>
          <th style="width:110px">Outcome</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
</div>
<footer>no-github-backlog &bull; ${csvPath} &bull; ${genTime}</footer>

<script>
const RAW_CSV = \`${csvJs}\`;

function parseCSV(text) {
  const lines = text.trim().split('\\n');
  if (lines.length < 2) return [];
  const hdrs = lines[0].split('|').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split('|');
    const o = {};
    hdrs.forEach((h, i) => { o[h] = (vals[i] ?? '').trim(); });
    return o;
  });
}

const rows = parseCSV(RAW_CSV).filter(r => r.issue && !r.issue.startsWith('SUMMARY'));

const issueMap = {};
for (const row of rows) {
  if (!issueMap[row.issue]) issueMap[row.issue] = { issue: row.issue, title: row.issue_title || '', url: row.issue_url || '', stages: [] };
  issueMap[row.issue].stages.push(row);
}
const issues = Object.values(issueMap).sort((a, b) =>
  (parseInt(b.issue.replace('#','')) || 0) - (parseInt(a.issue.replace('#','')) || 0)
);

function outcome(stages) {
  if (!stages.length) return 'unknown';
  const last = stages[stages.length - 1];
  if (last.stage === 'merge' && last.decision === 'merged') return 'merged';
  if (last.stage === 'investigate') {
    if (last.decision === 'close')   return 'closed';
    if (last.decision === 'triage')  return 'triaged';
    if (last.decision === 'skipped') return 'skipped';
  }
  if (last.decision === 'quarantine') return 'quarantined';
  if (last.decision === 'skipped')    return 'skipped';
  return 'in-progress';
}

function prOf(stages) { return stages.find(s => s.pr_number) ?? null; }
function latestCI(stages) { return [...stages].reverse().find(s => s.ci_status) ?? null; }

const C = { total: issues.length, merged:0, closed:0, triaged:0, quarantined:0, 'in-progress':0, skipped:0 };
for (const iss of issues) { const o = outcome(iss.stages); C[o] = (C[o] || 0) + 1; }

const STAGES = ['investigate','implement','review','security-review','qa','fix','merge'];
const stageCts = Object.fromEntries(STAGES.map(s => [s, 0]));
for (const row of rows) { if (row.stage in stageCts) stageCts[row.stage]++; }

const dayMap = {};
for (const row of rows) { const d = (row.date||'').slice(0,10); if (d) dayMap[d] = (dayMap[d]||0)+1; }
const days = Object.keys(dayMap).sort();

// ---- cards ----
const cardDefs = [
  ['total','Total Issues',''],['merged','Merged','merged'],['closed','Closed','closed'],
  ['triaged','Triaged','triaged'],['quarantined','Quarantined','quarantined'],
  ['in-progress','In Progress','in-progress'],['skipped','Skipped','skipped'],
];
const cardsEl = document.getElementById('cards');
for (const [key, label, cls] of cardDefs) {
  const d = document.createElement('div');
  d.className = \`card \${cls}\`;
  d.innerHTML = \`<div class="value">\${C[key]||0}</div><div class="label">\${label}</div>\`;
  cardsEl.appendChild(d);
}

// ---- charts ----
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#21262d';
const chartOpts = { plugins: { legend: { display: false } },
  scales: { x: { grid:{color:'#21262d'} }, y: { grid:{color:'#21262d'}, beginAtZero:true, ticks:{stepSize:1} } } };

new Chart(document.getElementById('outcomesChart'), {
  type: 'doughnut',
  data: {
    labels: ['Merged','Closed','Triaged','Quarantined','In Progress','Skipped'],
    datasets: [{ data: [C.merged,C.closed,C.triaged,C.quarantined,C['in-progress'],C.skipped],
      backgroundColor: ['#3fb950','#6e7681','#d29922','#f85149','#58a6ff','#484f58'], borderWidth:0 }]
  },
  options: { plugins: { legend: { position:'bottom', labels:{ boxWidth:10, padding:10, font:{size:11} } } }, cutout:'65%' }
});

new Chart(document.getElementById('funnelChart'), {
  type: 'bar',
  data: { labels: STAGES.map(s=>s.replace('-','\\u2011')),
          datasets: [{ data: STAGES.map(s=>stageCts[s]), backgroundColor:'#388bfd', borderRadius:3 }] },
  options: chartOpts,
});

new Chart(document.getElementById('timelineChart'), {
  type: 'line',
  data: { labels: days, datasets: [{ data: days.map(d=>dayMap[d]),
    borderColor:'#388bfd', backgroundColor:'rgba(56,139,253,0.1)', fill:true, tension:0.3, pointRadius:3 }] },
  options: { ...chartOpts, plugins: { legend: { display:false } },
    scales: { x: { grid:{color:'#21262d'}, ticks:{maxTicksLimit:8} }, y: { grid:{color:'#21262d'}, beginAtZero:true } } },
});

// ---- table ----
function sbClass(decision) {
  return { merged:'merged', approve:'approve', reject:'reject', fix:'fix',
           quarantine:'quarantine', close:'close', triage:'triage', skipped:'skipped' }[decision] ?? 'in-progress';
}
function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ciHtml(ci) {
  if (!ci) return '<span class="em">&mdash;</span>';
  const cls = ci==='green' ? 'ci-green' : ci==='red' ? 'ci-red' : 'ci-other';
  return \`<span class="\${cls}">\${esc(ci)}</span>\`;
}

const tbody = document.getElementById('tbody');
let idx = 0;

for (const iss of issues) {
  const out = outcome(iss.stages);
  const pr  = prOf(iss.stages);
  const ci  = latestCI(iss.stages);
  const did = 'dr' + (idx++);

  const latestStage = {};
  for (const s of iss.stages) latestStage[s.stage] = s;
  const pipeline = Object.entries(latestStage).map(([stage, row]) =>
    \`<span class="sbadge \${sbClass(row.decision)}" title="\${esc(stage)}: \${esc(row.decision)}">\${esc(stage)}</span>\`
  ).join('');

  const prCell = pr
    ? (pr.pr_url ? \`<a href="\${esc(pr.pr_url)}" target="_blank" class="issue-num">#\${esc(pr.pr_number)}</a>\`
                 : \`<span class="issue-num">#\${esc(pr.pr_number)}</span>\`)
    : '<span class="em">&mdash;</span>';

  const titleCell = iss.url
    ? \`<a href="\${esc(iss.url)}" target="_blank">\${esc(iss.title || iss.issue)}</a>\`
    : esc(iss.title || iss.issue);

  const issRow = document.createElement('tr');
  issRow.className = 'issue-row';
  issRow.innerHTML = \`
    <td><span class="issue-num">\${esc(iss.issue)}</span></td>
    <td>\${titleCell} <span class="toggle-icon">&#9654;</span></td>
    <td><div class="pipeline">\${pipeline}</div></td>
    <td>\${prCell}</td>
    <td>\${ciHtml(ci?.ci_status)}</td>
    <td><span class="obadge \${out}">\${out}</span></td>
  \`;
  issRow.addEventListener('click', () => toggle(issRow, did));
  tbody.appendChild(issRow);

  const stageCards = iss.stages.map(s => {
    const fields = [
      ['Decision',   s.decision,       false],
      ['Reasoning',  s.reasoning,      true],
      ['Subagent',   s.subagent_type,  false],
      ['Model',      s.model,          false],
      ['Template',   s.prompt_template,true],
      ['Run ID',     s.run_id,         true],
      ['PR',         s.pr_number ? (s.pr_url
        ? \`<a href="\${esc(s.pr_url)}" target="_blank">#\${esc(s.pr_number)}</a>\`
        : '#'+esc(s.pr_number)) : '',           false],
      ['CI',         s.ci_status,      false],
      ['Duration',   s.duration_s && s.duration_s !== '0' ? s.duration_s+'s' : '', false],
      ['Time',       s.date,           false],
    ].filter(([,v]) => v);

    return \`<div class="dstage">
      <div class="dstage-hdr">
        <span class="dstage-name">\${esc(s.stage)}</span>
        <span class="dstage-time">\${esc(s.date||'')}</span>
      </div>
      \${fields.map(([k,v,mono]) => \`<div class="dfield">
        <span class="k">\${esc(k)}</span>
        <span class="v \${mono?'mono':''} \${k==='Reasoning'?'pre':''}">\${k==='Reasoning'||k==='Template'?esc(v):v}</span>
      </div>\`).join('')}
    </div>\`;
  }).join('');

  const detailRow = document.createElement('tr');
  detailRow.id = did;
  detailRow.className = 'detail-row hidden';
  detailRow.innerHTML = \`<td colspan="6"><div class="detail-panel"><div class="detail-grid">\${stageCards}</div></div></td>\`;
  tbody.appendChild(detailRow);
}

function toggle(row, did) {
  const dr = document.getElementById(did);
  const icon = row.querySelector('.toggle-icon');
  const wasHidden = dr.classList.contains('hidden');
  dr.classList.toggle('hidden', !wasHidden);
  row.classList.toggle('expanded', wasHidden);
  if (icon) icon.innerHTML = wasHidden ? '&#9660;' : '&#9654;';
}
</script>
</body>
</html>`;

await Bun.write(outPath, html);
console.error(`Dashboard: ${outPath}`);
