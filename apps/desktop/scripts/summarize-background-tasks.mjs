import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const [flag, path] = process.argv.slice(2);
if (flag !== '--evidence' || !path)
  throw new Error('Usage: summarize-background-tasks.mjs --evidence /absolute/evidence-folder');
const directory = resolve(path);
const manifest = JSON.parse(
  await readFile(new URL('../tests/fixtures/reliability/cases.json', import.meta.url), 'utf8'),
);
const text = await readFile(join(directory, 'attempts.jsonl'), 'utf8').catch(() => '');
const lines = text.split('\n');
const attempts = [];
for (let index = 0; index < lines.length; index++) {
  if (!lines[index].trim()) continue;
  try {
    attempts.push(JSON.parse(lines[index]));
  } catch (error) {
    if (index !== lines.length - 1 || text.endsWith('\n')) throw error;
  }
}
const ids = new Set(manifest.map((item) => item.id));
if (attempts.some((item) => !ids.has(item.id)))
  throw new Error('Evidence contains an unknown task ID.');
const triage = (await readFile(join(directory, 'triage.jsonl'), 'utf8').catch(() => ''))
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
const rows = manifest.map((item) => {
  const history = attempts.filter((attempt) => attempt.id === item.id);
  const latest = history.at(-1);
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    status: latest?.status ?? 'not-run',
    attempts: history.length,
    first_status: history[0]?.status ?? 'not-run',
    driver_mode: latest?.driver_mode ?? (latest?.real_cua_driver ? 'native' : 'unknown'),
    expected_attention: latest?.expected_attention ?? !!item.attention,
    elapsed_ms: latest?.elapsed_ms,
    failure: latest?.failure,
    evidence: latest?.evidence,
    history: history.map((attempt) => ({
      status: attempt.status,
      failure: attempt.failure,
      evidence: attempt.evidence,
      source_commit: attempt.source_commit,
      driver_mode: attempt.driver_mode,
    })),
  };
});
const summary = {
  updated_at: new Date().toISOString(),
  total_tasks: manifest.length,
  unique_attempted: rows.filter((row) => row.attempts).length,
  latest_passed: rows.filter((row) => row.status === 'passed').length,
  latest_failed: rows.filter((row) => row.status === 'failed').length,
  not_run: rows.filter((row) => row.status === 'not-run').length,
  expected_attention_passed: rows.filter(
    (row) => row.expected_attention && row.status === 'passed',
  ).length,
  total_attempts: attempts.length,
  driver_modes: [...new Set(attempts.map((attempt) => attempt.driver_mode ?? 'unknown'))],
  triage_notes: triage,
  rows,
};
await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const clean = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
await writeFile(
  join(directory, 'report.md'),
  `# Background reliability test log\n\n${summary.unique_attempted}/100 distinct tasks attempted. Latest: ${summary.latest_passed} passed, ${summary.latest_failed} failed, ${summary.not_run} not run. ${summary.expected_attention_passed} passes are expected incomplete-task handling, not completed app actions. ${summary.total_attempts} total attempts; previous failures remain in attempts.jsonl. Driver modes: ${summary.driver_modes.join(', ')}.\n\nThese are real-model tests through Sia’s background controller with fictional account data. Native uses the bundled Cua Driver against a disposable app; simulated uses in-memory driver observations and does not validate native input delivery. They do not establish accuracy on real external accounts or first-time permissions. The actual app state, output files and source coverage are independently graded. All agent input is restricted to the lab PID with foreground fallback disabled.\n\n| Task | Category | First | Latest | Attempts | Evidence history | Latest failure |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.map((row) => `| ${clean(row.id)} | ${clean(row.category)} | ${row.first_status} | ${row.status} | ${row.attempts} | ${row.history.map((attempt, index) => `[${index + 1}: ${attempt.status}](${encodeURI(join(directory, basename(attempt.evidence), 'trace.json'))})`).join(', ')} | ${clean(row.failure)} |`).join('\n')}\n\n## Failure triage\n\n${triage.length ? triage.map((note) => `- **${clean(note.id)}** (${clean(note.classification)}): ${clean(note.reason)} ${clean(note.remedy)}`).join('\n') : 'No triage notes recorded.'}\n`,
);
console.log(
  JSON.stringify({
    attempted: summary.unique_attempted,
    passed: summary.latest_passed,
    failed: summary.latest_failed,
    not_run: summary.not_run,
    attempts: summary.total_attempts,
    report: join(directory, 'report.md'),
  }),
);
