// @vitest-environment node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(fileURLToPath(new URL('./ui.module.css', import.meta.url)), 'utf8');
const companion = readFileSync(
  fileURLToPath(new URL('./companion.module.css', import.meta.url)),
  'utf8',
);
const tokens = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const aurora = readFileSync(
  fileURLToPath(new URL('./components/effects/aurora.css', import.meta.url)),
  'utf8',
);
const metal = readFileSync(
  fileURLToPath(new URL('./components/effects/liquid-metal-button.css', import.meta.url)),
  'utf8',
);
const navigation = readFileSync(
  fileURLToPath(new URL('./components/navigation.module.css', import.meta.url)),
  'utf8',
);
const appearance = readFileSync(
  fileURLToPath(
    new URL('./components/settings/AppearanceSettings.module.css', import.meta.url),
  ),
  'utf8',
);
const startup = readFileSync(
  fileURLToPath(new URL('./components/startup.module.css', import.meta.url)),
  'utf8',
);
const css = `${tokens}\n${styles}\n${companion}\n${aurora}\n${metal}\n${navigation}\n${appearance}\n${startup}`;

describe('renderer accessibility CSS policy', () => {
  it('keeps explicit reduced-motion, increased-contrast, and forced-color modes', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(/prefers-reduced-motion:[^)]+\)[\s\S]+animation: none/);
  });

  it('keeps the supported 960px window usable at 200% browser text scaling', () => {
    expect(tokens).toMatch(/body\s*{[\s\S]*?min-width:\s*0/);
    expect(tokens).not.toMatch(/min-width:\s*640px/);
    expect(styles).toMatch(
      /@media \(max-width: 600px\)[\s\S]*?\.settingsLayout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(styles).not.toMatch(/\.workspaceLabel|\.cloudStatus|\.captureControl/);
    expect(styles).toMatch(/\.threadControls\s*{[\s\S]*?border:\s*1px/);
    expect(styles).toMatch(
      /@media \(max-width: 1120px\)[\s\S]*?\.inspectorButton > span[\s\S]*?display:\s*none/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 1120px\)[\s\S]*?\.activityPageContent[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    // The labelled Tools menu replaces icon-only buttons. Its viewport and
    // keyboard behavior are exercised in the real renderer by ux-layout.spec.ts.
  });

  it('keeps utility controls in document flow and gives transient surfaces real exits', () => {
    expect(styles).toMatch(/\.threadWorkspaceBar\s*{[\s\S]*?display:\s*flex/);
    expect(styles).not.toMatch(/\.threadToolNav\s*{[^}]*position:\s*absolute/);
    expect(styles).toMatch(/\.dialogOverlay\[data-state='closed'\]/);
    expect(styles).toMatch(/\.dialogContent\[data-state='closed'\]/);
    expect(styles).toMatch(/\.threadMenuContent\[data-state='closed'\]/);
  });

  it('defines every CSS custom property it uses', () => {
    const definitions = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    const uses = [...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);

    expect([...new Set(uses.filter((name) => !definitions.has(name)))]).toEqual([]);
  });

  it('limits gradients to deliberate decorative surfaces and rejects cascade overrides', () => {
    expect(css).not.toContain('!important');
    const gradient = /(?:linear|radial|conic)-gradient\(/;
    expect(`${tokens}\n${companion}`).not.toMatch(gradient);
    // Shared effects own their palettes; the core UI only opts in on its welcome
    // heading, background mask, and composer. Transcript and settings stay plain.
    const decorativeSurfaces = new Set([
      '.conversationAurora',
      '.gradientHeading',
      '.composer',
    ]);
    const rules = styles.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+){([^}]*)}/g);
    for (const rule of rules) {
      if (!gradient.test(rule[2]!)) continue;
      for (const selector of rule[1]!.split(',').map((part) => part.trim())) {
        expect(decorativeSurfaces.has(selector), `Unexpected gradient on ${selector}`).toBe(
          true,
        );
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
      /\.field input,[\s\S]*?\.workspacePicker input\s*{[\s\S]*?}/,
      /\.composer textarea\s*{[\s\S]*?}/,
      /\.messageContent\s*{[\s\S]*?}/,
      /\.settingsNav button\s*{[\s\S]*?}/,
    ];
    for (const rule of controlRules) {
      const block = styles.match(rule)?.[0];
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
