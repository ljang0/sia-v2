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

for (const scale of [1, 1.5]) {
  for (const scrollY of [0, 650]) {
    for (const inactive of [false, true]) {
      test(`native pointer guard resolves an ${inactive ? 'inactive' : 'active'} tab at scroll ${scrollY}, scale ${scale} without DOM initialization`, async ({
        page,
      }) => {
        await page.setContent(
          '<a style="position:fixed;left:40px;top:30px;width:100px;height:40px" target="_blank" href="https://example.com/next">Visit</a><div style="height:3000px"></div>',
        );
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        const other = inactive ? await page.context().newPage() : undefined;
        if (other) {
          await other.setContent('<p>Unrelated foreground page</p>');
          await other.bringToFront();
        }
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
        await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        const { cssVisualViewport } = await cdp.send('Page.getLayoutMetrics');
        const hit = await cdp.send('DOM.getNodeForLocation', {
          x: Math.floor(70 + cssVisualViewport.pageX),
          y: Math.floor(50 + cssVisualViewport.pageY),
          includeUserAgentShadowDOM: true,
        });
        expect(hit.backendNodeId).toBeGreaterThan(0);
        const { object } = await cdp.send('DOM.resolveNode', {
          backendNodeId: hit.backendNodeId,
        });
        if (!object.objectId) throw new Error('No remote object for the hit-test fixture.');
        const result = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration,
          returnByValue: true,
          silent: true,
          throwOnSideEffect: true,
        });
        expect(result.exceptionDetails).toBeUndefined();
        expect(result.result.value).toBe(true);
        await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
        await other?.close();
      });
    }
  }
}
