// Run: node tests/updated-at.test.mjs            (also the pre-commit hook: .githooks/pre-commit)
//      node tests/updated-at.test.mjs --refresh  (re-read pushed_at of external tools' repos via `gh`)
//
// `updatedAt` is the day the TOOL last changed (it orders "最近更新"), so it may never be later than the tool's
// own newest change: for a tool in tools/<id>/, the last commit touching that folder (today when the folder has
// uncommitted edits); for an external tool on <owner>.github.io/<repo>/, the newest push to that repo, read
// from the committed snapshot tests/repo-dates.json (GitHub pushed_at, any branch, as an Asia/Taipei day).
// It is an upper bound only: a sweep commit (the 2026-09-04 width clamp) loosens it, never trips it.
// Controls every run: a tool dated a day after its bound must fail; one dated on its bound must pass.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = join(ROOT, 'tests', 'repo-dates.json');
const tpeDay = (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const tools = JSON.parse(readFileSync(join(ROOT, 'tools.json'), 'utf8'));

function externalRepo(path) {
  const m = /^https:\/\/([^.]+)\.github\.io\/([^/]+)\/?/i.exec(path);
  return m ? `${m[1]}/${m[2]}` : null;
}

if (process.argv.includes('--refresh')) {
  const repos = {};
  for (const t of tools) {
    const r = externalRepo(t.path);
    if (!r) continue;
    try {
      repos[r] = tpeDay(new Date(execFileSync('gh', ['api', `repos/${r}`, '--jq', '.pushed_at'], { encoding: 'utf8' }).trim()));
    } catch { repos[r] = null; }
    console.log(`  ${r}: ${repos[r] ?? 'not readable'}`);
  }
  writeFileSync(SNAP, JSON.stringify({ fetchedAt: tpeDay(new Date()), how: 'gh api repos/<owner/repo> --jq .pushed_at as an Asia/Taipei day; null = not readable', repos }, null, 2) + '\n');
  process.exit(0);
}

const snap = JSON.parse(readFileSync(SNAP, 'utf8')).repos;

// bound for one tool: [day, source] or [null, why]
function bound(t) {
  const ext = externalRepo(t.path);
  if (ext) {
    if (!(ext in snap)) return [undefined, `${ext} not in tests/repo-dates.json: run --refresh`];
    return snap[ext] ? [snap[ext], `last push to ${ext}`] : [null, `${ext} not readable`];
  }
  const m = /^\.\/(tools\/[^/]+)\/?/.exec(t.path);
  if (!m) return [undefined, `path ${t.path} is neither tools/<id>/ nor <owner>.github.io/<repo>/`];
  if (git('status', '--porcelain', '--', m[1])) return [tpeDay(new Date()), `uncommitted edits in ${m[1]}`];
  const day = git('log', '-1', '--format=%cs', '--', m[1]);
  return day ? [day, `last commit in ${m[1]}`] : [tpeDay(new Date()), `${m[1]} not committed yet`];
}

function check(list, bounds) {
  const findings = [], notes = [];
  for (const t of list) {
    const [day, why] = bounds.get(t.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.updatedAt ?? '')) findings.push(`${t.id}: updatedAt "${t.updatedAt}" is not YYYY-MM-DD`);
    else if (day === undefined) findings.push(`${t.id}: ${why}`);
    else if (day === null) notes.push(`${t.id}: ${why}, date not checked`);
    else if (t.updatedAt > day) findings.push(`${t.id}: updatedAt ${t.updatedAt} is later than its ${why} (${day})`);
  }
  return { findings, notes };
}

const bounds = new Map(tools.map((t) => [t.id, bound(t)]));
let ok = true;

// controls on an in-memory copy
const probe = tools.find((t) => bounds.get(t.id)[0]);
const day = bounds.get(probe.id)[0];
const next = new Date(Date.parse(day + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10);
for (const [label, value, wantFail] of [['dated on its bound', day, false], ['dated a day after its bound', next, true]]) {
  const r = check([{ ...probe, updatedAt: value }], bounds);
  const good = (r.findings.length > 0) === wantFail;
  console.log(`${good ? 'ok  ' : 'BAD '} control: ${probe.id} ${label} -> ${r.findings.length} finding(s)`);
  ok &&= good;
}

const { findings, notes } = check(tools, bounds);
notes.forEach((n) => console.log('note ' + n));
findings.forEach((f) => console.log('FAIL ' + f));
console.log(`updated-at: ${findings.length} finding(s) over ${tools.length} tools${ok ? '' : '; CONTROLS MISFIRED'}`);
process.exit(findings.length || !ok ? 1 : 0);
