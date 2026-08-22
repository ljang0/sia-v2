import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public');
const destination = join(root, 'dist');
const checkOnly = process.argv.includes('--check');

async function filesUnder(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files;
}

const files = await filesUnder(source);
const textFiles = files.filter((file) => /\.(?:html|css|js|txt|xml)$/u.test(file));
const problems = [];

for (const file of textFiles) {
  const text = await readFile(file, 'utf8');
  const displayPath = relative(root, file);
  if (/[—–]/u.test(text)) problems.push(`${displayPath}: contains a forbidden long dash`);
  if (file.endsWith('.html') && !/<title>[^<]+<\/title>/u.test(text)) {
    problems.push(`${displayPath}: missing a non-empty title`);
  }
  if (file.endsWith('.html') && !/<meta\s+name="description"\s+content="[^"]+"/u.test(text)) {
    problems.push(`${displayPath}: missing a non-empty meta description`);
  }
}

if (problems.length > 0) {
  throw new Error(`Site validation failed:\n${problems.join('\n')}`);
}

if (!checkOnly) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
}

console.log(`${checkOnly ? 'Validated' : 'Built'} ${files.length} public site files.`);
