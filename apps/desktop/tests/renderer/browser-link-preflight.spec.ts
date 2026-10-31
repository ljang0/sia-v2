import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Exercise the exact JavaScript shipped in the native patch against Chromium's
// debugger evaluator. Mock CDP replies cannot reveal unsupported side-effect checks.
const addedSource = readFileSync(
  new URL('../../../../patches/cua-driver-0.38.0-chrome-consent.patch', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n');
const matchedDeclaration = addedSource.match(
  /const BACKGROUND_LINK_NEW_CONTEXT: &str = r#"([\s\S]*?)"#;/,
)?.[1];
if (!matchedDeclaration) throw new Error('Native link preflight was not found in the patch.');
const functionDeclaration: string = matchedDeclaration;

for (const baseTarget of ['', '_blank']) {
  test(`native link preflight is side-effect-free in Chromium with base target ${baseTarget || 'unset'}`, async ({
    page,
  }) => {
    await page.setContent(`
      ${baseTarget ? '<base target="_blank">' : ''}
      <a id="ordinary" href="/next">Ordinary link</a>
      <a id="self" href="/next" target="_self"><span id="nested-self">Same tab</span></a>
      <a id="blank" href="/next" target="_blank"><span id="nested-blank">New tab</span></a>
      <a id="named" href="/next" target="report">Named tab</a>
      <button id="button">Ordinary button</button>
    `);
    const cdp = await page.context().newCDPSession(page);
    const { root } = await cdp.send('DOM.getDocument');
    for (const [selector, expected] of [
      ['#ordinary', Boolean(baseTarget)],
      ['#self', false],
      ['#nested-self', false],
      ['#blank', true],
      ['#nested-blank', true],
      ['#named', true],
      ['#button', false],
    ] as const) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { object } = await cdp.send('DOM.resolveNode', { nodeId });
      if (!object.objectId) throw new Error(`No remote object for ${selector}`);
      const result = await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration,
        returnByValue: true,
        silent: true,
        throwOnSideEffect: true,
      });
      expect(result.exceptionDetails, selector).toBeUndefined();
      expect(result.result.value, selector).toBe(expected);
      await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
    }
    expect(page.url()).toBe('about:blank');
    expect(page.context().pages()).toHaveLength(1);
  });
}

test('native preflight retains side-effect rejection for page-defined getters', async ({
  page,
}) => {
  await page.setContent('<button id="button">Button</button>');
  await page.evaluate(() => {
    Object.defineProperty(document.getElementById('button'), 'localName', {
      get() {
        document.body.dataset.preflightMutation = 'unexpected';
        return 'button';
      },
    });
  });
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#button',
  });
  const { object } = await cdp.send('DOM.resolveNode', { nodeId });
  if (!object.objectId) throw new Error('No remote object for the getter fixture.');
  const result = await cdp.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration,
    returnByValue: true,
    silent: true,
    throwOnSideEffect: true,
  });
  expect(result.exceptionDetails).toBeDefined();
  expect(await page.locator('body').getAttribute('data-preflight-mutation')).toBeNull();
  await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
});
