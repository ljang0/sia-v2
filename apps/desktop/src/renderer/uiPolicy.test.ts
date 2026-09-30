// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('.', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const cssFiles = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) =>
  file.endsWith('.css'),
);
// Component and shared style modules (companion.module.css is checked on its own).
const moduleFiles = cssFiles.filter(
  (file) => file.endsWith('.module.css') && file !== 'companion.module.css',
);
const styles = moduleFiles.map(read).join('\n');
const companion = read('companion.module.css');
const tokens = read('tokens.css');
const aurora = read('components/effects/aurora.css');
const metal = read('components/effects/liquid-metal-button.css');
const startup = read('components/startup.module.css');
const css = `${tokens}\n${styles}\n${companion}\n${aurora}\n${metal}`;
// The first rule matching `pattern` in any style module, wherever the rule lives.
const find = (pattern: RegExp) =>
  moduleFiles.map((file) => read(file).match(pattern)?.[0]).find(Boolean);

describe('text size', () => {
  it('scales every interface font size with Settings → Appearance → Text size', () => {
    // Brand wordmarks and the hero headings keep their own size; everything else is a token or
    // calc(Npx * var(--text-scale)), so a bare px font size would ignore the person's choice.
    const allowed = new Set([
      'components/navigation.module.css:font-size: 38px',
      'ui.module.css:font-size: 20px',
      'components/startup.module.css:font-size: 17px',
      'components/startup.module.css:font: 650 42px/1 var(--font-brand)',
    ]);
    const bare: string[] = [];
    for (const file of cssFiles) {
      if (file === 'tokens.css') continue;
      const source = read(file);
      for (const match of source.matchAll(/(font(?:-size)?:[^;{}]*);/g)) {
        const declaration = match[1]!.replace(/\s+/g, ' ').trim();
        const outsideScale = declaration.replace(/calc\([^)]*var\(--text-scale\)\)/g, '');
        const scaled =
          /var\(--(text|display)-/.test(outsideScale) || /clamp\(/.test(outsideScale);
        if (!scaled && /\b\d+(\.\d+)?px/.test(outsideScale))
          if (!allowed.has(`${file}:${declaration}`)) bare.push(`${file}: ${declaration}`);
      }
    }
    expect(bare).toEqual([]);
    expect(tokens).toMatch(/--text-scale: 1;/);
    expect(tokens).toMatch(/--text-sm: calc\(12px \* var\(--text-scale\)\);/);
  });
});

describe('renderer accessibility CSS policy', () => {
  it('keeps explicit reduced-motion, increased-contrast, and forced-color modes', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(/prefers-reduced-motion:[^)]+\)[\s\S]+animation: none/);
  });

  it('gives the startup curtain a light variant that matches the first window paint', () => {
    expect(startup).toMatch(
      /prefers-color-scheme: light\)[\s\S]*\.startup \{\s*background: #f4f6f2;/,
    );
  });

  it('keeps the supported 960px window usable at 200% browser text scaling', () => {
    expect(tokens).toMatch(/body\s*{[\s\S]*?min-width:\s*0/);
    expect(tokens).not.toMatch(/min-width:\s*640px/);
    expect(
      find(
        /@media \(max-width: 600px\)[\s\S]*?\.settingsLayout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
      ),
    ).toBeTruthy();
    expect(styles).not.toMatch(/\.workspaceLabel|\.cloudStatus|\.captureControl/);
    expect(find(/\.threadControls\s*{[\s\S]*?border:\s*1px/)).toBeTruthy();
    expect(
      find(
        /@media \(max-width: 1120px\)[\s\S]*?\.inspectorButton > span[\s\S]*?display:\s*none/,
      ),
    ).toBeTruthy();
    expect(
      find(
        /@media \(max-width: 1120px\)[\s\S]*?\.activityPageContent[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
      ),
    ).toBeTruthy();
    // The labelled Tools menu replaces icon-only buttons. Its viewport and
    // keyboard behavior are exercised in the real renderer by ux-layout.spec.ts.
  });

  it('keeps utility controls in document flow and gives transient surfaces real exits', () => {
    expect(find(/\.threadWorkspaceBar\s*{[\s\S]*?display:\s*flex/)).toBeTruthy();
    expect(styles).not.toMatch(/\.threadToolNav\s*{[^}]*position:\s*absolute/);
    expect(styles).toMatch(/\.dialogOverlay\[data-state='closed'\]/);
    expect(styles).toMatch(/\.dialogContent\[data-state='closed'\]/);
    expect(styles).toMatch(/\.threadMenuContent\[data-state='closed'\]/);
  });

  it('defines every CSS custom property it uses', () => {
    // Components set these per element (ScottySprite, VoiceWave).
    const inline = ['--sprite-size', '--sprite-row', '--voice-level'];
    const definitions = new Set([
      ...inline,
      ...[...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
    ]);
    const uses = [...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);

    expect([...new Set(uses.filter((name) => !definitions.has(name)))]).toEqual([]);
  });

  it('limits gradients to deliberate decorative surfaces and rejects cascade overrides', () => {
    expect(css).not.toContain('!important');
    const gradient = /(?:linear|radial|conic)-gradient\(/;
    expect(`${tokens}\n${companion}`).not.toMatch(gradient);
    // Shared effects own their palettes; the core UI only opts in on its welcome
    // heading, background mask, and composer. Transcript and settings stay plain.
    const effectModules = new Set([
      'components/CommandLauncher.module.css',
      'components/navigation.module.css',
      'components/result-card.module.css',
      'components/settings/AppearanceSettings.module.css',
    ]);
    const decorativeSurfaces = new Set([
      '.conversationAurora',
      '.gradientHeading',
      '.composer',
      // Text shimmer on the working status, like Codex and Claude; still under reduced motion.
      '.workingLabel',
    ]);
    for (const file of moduleFiles) {
      if (effectModules.has(file)) continue;
      const rules = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+){([^}]*)}/g);
      for (const rule of rules) {
        if (!gradient.test(rule[2]!)) continue;
        for (const selector of rule[1]!.split(',').map((part) => part.trim())) {
          expect(
            decorativeSurfaces.has(selector),
            `Unexpected gradient on ${selector} in ${file}`,
          ).toBe(true);
        }
      }
    }
  });

  it('uses the brand face for identity and keeps it off controls and body copy', () => {
    expect(tokens).toMatch(/--font-brand:\s*'Bricolage Grotesque',\s*'SF Pro Display'/);
    expect(tokens).toMatch(/--font-display:\s*'Bricolage Grotesque',\s*'SF Pro Display'/);
    expect(tokens).toMatch(
      /@font-face\s*{[^}]*font-family:\s*'Bricolage Grotesque'[^}]*format\('woff2'\)/,
    );

    // Controls, form fields, and body copy never borrow the display face.
    const controlRules = [
      /\.primaryButton,[\s\S]*?\.textButtonDanger\s*{[\s\S]*?}/,
      /\.field input,[\s\S]*?\.field select\s*{[\s\S]*?}/,
      /\.workspacePicker input\s*{[\s\S]*?}/,
      /\.composer textarea\s*{[\s\S]*?}/,
      /\.messageContent\s*{[\s\S]*?}/,
      /\.settingsNav button\s*{[\s\S]*?}/,
    ];
    for (const rule of controlRules) {
      const block = find(rule);
      expect(block, `${rule} should exist`).toBeTruthy();
      expect(block).not.toContain('var(--font-display)');
    }

    // Agent names and headings share the expressive display face with the wordmark.
    const rules = [...styles.matchAll(/([^{}]+){([^}]*)}/g)].map((match) => ({
      selectors: match[1]!.split(',').map((part) => part.trim()),
      body: match[2]!,
    }));
    for (const selector of ['.approvalHeader h3', '.emptyState h1']) {
      const matching = rules.filter((rule) => rule.selectors.includes(selector));
      expect(matching.length, `${selector} should exist`).toBeGreaterThan(0);
      expect(
        matching.some((rule) => rule.body.includes('var(--font-display)')),
        `${selector} should be set in the display face`,
      ).toBe(true);
    }
    const wordmark = rules.find((rule) => rule.selectors.includes('.wordmark'));
    expect(wordmark?.body).toContain('var(--font-brand)');

    // Every agent hue is defined and the room inherits the selected agent's hue.
    for (const slot of ['0', '1', '2', '3']) {
      expect(tokens).toContain(`--hue-${slot}:`);
      expect(styles).toContain(`.workspace[data-identity='${slot}']`);
    }

    // Every agent hue is defined and the room inherits the selected agent's hue.
    for (const hue of ['--hue-0', '--hue-1', '--hue-2', '--hue-3']) {
      expect(tokens).toContain(`${hue}:`);
      expect(styles).toMatch(new RegExp(`\\.workspace\\[data-identity='${hue.slice(-1)}'\\]`));
    }
  });

  it('keeps small text and essential control boundaries at AA contrast', () => {
    const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
    const light = tokens.slice(0, darkStart);
    const dark = tokens.slice(darkStart);

    for (const background of [
      '--bg-app',
      '--bg-canvas',
      '--bg-subtle',
      '--bg-raised',
      '--bg-hover',
      '--bg-selected',
    ]) {
      expect(
        contrast(token(light, '--text-tertiary'), token(light, background)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token(dark, '--text-tertiary'), token(dark, background)),
      ).toBeGreaterThanOrEqual(4.5);
    }

    for (const source of [light, dark]) {
      for (const background of ['--shell-bg', '--shell-bg-deep']) {
        expect(
          contrast(token(source, '--shell-muted'), token(source, background)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    for (const source of [light, dark]) {
      for (const background of ['--bg-canvas', '--bg-subtle', '--bg-raised']) {
        expect(
          contrast(token(source, '--border-strong'), token(source, background)),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

function token(source: string, name: string) {
  const value = source.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  if (!value) throw new Error(`Missing token ${name}.`);
  return value;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}
