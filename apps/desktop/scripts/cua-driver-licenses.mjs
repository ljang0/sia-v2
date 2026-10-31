import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const licenseName = /(?:^|[._-])(?:licen[cs]e|copying|notice|copyright)(?:[._-]|$)/i;
const nestedNotices = new Set(['licenses', 'license', 'vendor', 'third_party', 'quickjs']);

/** Include original license/notice bodies, including embedded C libraries, without source paths. */
async function noticeFiles(root, directory = root, depth = 0) {
  const result = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isFile() && licenseName.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      if (!text.includes('\0') && text.length < 2_000_000)
        result.push({ name: relative(root, path), text });
    } else if (
      entry.isDirectory() &&
      depth < 4 &&
      (depth > 0 || nestedNotices.has(entry.name.toLowerCase()))
    ) {
      result.push(...(await noticeFiles(root, path, depth + 1)));
    }
  }
  return result;
}

export async function cuaLicenseInputs(licenseRoot) {
  const manifestBytes = await readFile(join(licenseRoot, 'cua-sdk-license-sources.json'));
  const supplements = JSON.parse(manifestBytes);
  const names = [
    ...new Set([
      ...supplements.map((item) => item.file),
      'cua-driver-rs-v0.38.0-MIT.txt',
      'MIT.txt',
    ]),
  ].sort();
  const files = new Map();
  for (const name of names) files.set(name, await readFile(join(licenseRoot, name), 'utf8'));
  return {
    supplements,
    files,
    fingerprint: Buffer.concat([
      manifestBytes,
      ...[...files.values()].map((text) => Buffer.from(text)),
    ]),
  };
}

export async function cuaBuildRecipe(desktopRoot) {
  const inputs = await cuaLicenseInputs(join(desktopRoot, 'build/license-sources'));
  const bytes = Buffer.concat([
    await readFile(join(desktopRoot, 'scripts/build-cua-driver.mjs')),
    await readFile(import.meta.filename),
    inputs.fingerprint,
  ]);
  return { inputs, recipeSha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function buildCuaLicenses(metadata, inputs, sourceRoot) {
  const packages = new Map(metadata.packages.map((item) => [item.id, item]));
  const nodes = new Map(metadata.resolve.nodes.map((item) => [item.id, item]));
  const sdk = metadata.packages.find((item) => item.name === 'cua-driver-sdk');
  if (!sdk) throw new Error('Cargo metadata does not contain the Cua SDK.');
  const seen = new Set();
  const pending = [sdk.id];
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of nodes.get(id).deps) {
      if (dep.dep_kinds.some((kind) => kind.kind !== 'dev')) pending.push(dep.pkg);
    }
  }
  const output = [
    'Cua SDK dependencies: normal and build dependency closure for the selected macOS target.',
    'Original declared licenses, authors, sources and available license/notice bodies follow.',
    'No license choices are inferred for expressions containing AND.',
    '',
  ];
  const ordered = [...seen]
    .map((id) => packages.get(id))
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  for (const item of ordered) {
    const root = dirname(item.manifest_path);
    const notices = await noticeFiles(root);
    if (!item.source) {
      notices.push({
        name: 'Cua workspace MIT license',
        text: inputs.files.get('cua-driver-rs-v0.38.0-MIT.txt'),
      });
    } else if (
      !notices.some((file) => !file.name.includes('/') && /licen[cs]e|copying/i.test(file.name))
    ) {
      const vcs = JSON.parse(await readFile(join(root, '.cargo_vcs_info.json'), 'utf8'));
      const repo = item.repository?.replace(/\.git$/, '');
      const supplement = inputs.supplements.find(
        (source) => source.repository === repo && source.commit === vcs.git.sha1,
      );
      if (!supplement)
        throw new Error(`Missing original license terms for ${item.name}@${item.version}`);
      const text = inputs.files.get(supplement.file);
      notices.push({ name: supplement.sourceUrl, text });
      // New objc2 packages publish a license-selection notice referring to MIT.
      // Preserve that notice and its attribution, and include the referenced full terms.
      if (
        repo === 'https://github.com/madsmtm/objc2' &&
        !text.includes('Permission is hereby granted')
      ) {
        notices.push({
          name: 'Referenced MIT terms',
          text: inputs.files
            .get('MIT.txt')
            .replace('Copyright (c) <year> <copyright holders>\n\n', ''),
        });
      }
    }
    if (!notices.length) throw new Error(`No license notices for ${item.name}@${item.version}`);
    output.push(
      `PACKAGE: ${item.name}@${item.version}`,
      `LICENSE: ${item.license ?? 'see license files'}`,
      `AUTHORS: ${item.authors.join('; ')}`,
      `SOURCE: ${item.repository ?? item.source ?? 'pinned Cua workspace'}`,
    );
    for (const file of notices) output.push(`--- ${file.name} ---`, file.text.trimEnd());
    output.push('');
  }
  output.push(
    '--- Cua Driver upstream third-party notices ---',
    await readFile(join(sourceRoot, 'libs/cua-driver/rust/THIRD_PARTY_NOTICES.md'), 'utf8'),
  );
  return output.join('\n') + '\n';
}
