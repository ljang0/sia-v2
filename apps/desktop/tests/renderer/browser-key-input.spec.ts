import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Run the shipped protection expression in Chromium, not a mocked JS evaluator.
const source = readFileSync(
  new URL('../../../../patches/cua-driver-0.38.0-chrome-consent.patch', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n');
const guard = source.match(/const FOCUSED_KEY_GUARD: &str = r#"([\s\S]*?)"#;/)?.[1];
if (!guard) throw new Error('Native visual key guard is missing.');

test('visual key protection admits ordinary focus and refuses protected/new-context controls', async ({
  page,
}) => {
  await page.setContent(`
    <input id="text"><textarea id="notes"></textarea><button id="button">Page action</button>
    <div id="editor" contenteditable>Editable paragraph</div>
    <input id="password" type="password"><input id="otp" autocomplete="one-time-code">
    <input id="upload" type="file"><input id="readonly" readonly>
    <a id="self" href="/next" target="_self">Same page</a>
    <a id="blank" href="/next" target="_blank">New page</a>
    <form target="_blank"><input id="new-form"></form>
    <form><input id="submit-override"><button formtarget="report">Submit elsewhere</button></form>
    <form><input id="login-name"><input type="password"></form>
    <form id="external"><input id="external-target"></form>
    <button form="external" formtarget="_blank">External submitter</button>
    <form id="external-login"><input id="external-name"></form>
    <input form="external-login" type="password">
  `);
  const cdp = await page.context().newCDPSession(page);
  for (const [id, ordinary, editable] of [
    ['text', true, true],
    ['notes', true, true],
    ['editor', true, true],
    ['button', true, false],
    ['self', true, false],
    ['password', false, false],
    ['otp', false, false],
    ['upload', false, false],
    ['readonly', false, false],
    ['blank', false, false],
    ['new-form', false, false],
    ['submit-override', false, false],
    ['login-name', false, false],
    ['external-target', false, false],
    ['external-name', false, false],
  ] as const) {
    await page.locator(`#${id}`).focus();
    for (const requireEditable of [false, true]) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(${guard})(${requireEditable}, true)`,
        returnByValue: true,
        silent: true,
        throwOnSideEffect: true,
      });
      expect(result.exceptionDetails, `${id}/${requireEditable}`).toBeUndefined();
      expect(result.result.value, `${id}/${requireEditable}`).toBe(
        requireEditable ? editable : ordinary,
      );
    }
  }
  expect(page.context().pages()).toHaveLength(1);
});

test('visual key guard reads shadow and same-origin frame focus and rejects side effects', async ({
  page,
}) => {
  await page.setContent('<div id="host"></div><iframe srcdoc="<input id=inside>"></iframe>');
  await page.locator('iframe').waitFor();
  await page.evaluate(() => {
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input id="shadow-input">';
    (shadow.querySelector('input') as HTMLInputElement).focus();
  });
  const cdp = await page.context().newCDPSession(page);
  const check = () =>
    cdp.send('Runtime.evaluate', {
      expression: `(${guard})(true, true)`,
      returnByValue: true,
      silent: true,
      throwOnSideEffect: true,
    });
  expect((await check()).result.value).toBe(true);
  await page.frameLocator('iframe').locator('input').focus();
  expect((await check()).result.value).toBe(true);
  await page.evaluate(() => {
    const field = document.querySelector('iframe')!.contentDocument!.querySelector('input')!;
    Object.defineProperty(field, 'readOnly', {
      get() {
        document.body.dataset.guardMutation = 'unexpected';
        return false;
      },
    });
  });
  expect((await check()).exceptionDetails).toBeDefined();
  expect(await page.locator('body').getAttribute('data-guard-mutation')).toBeNull();
});

test('page key contract supports selection, replacement, Tab and Enter through CDP', async ({
  page,
}) => {
  await page.setContent(
    '<form><input id="query" value="old text"><button>Search</button><output></output></form>',
  );
  await page.evaluate(() =>
    document.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      document.querySelector('output')!.textContent = document.querySelector('input')!.value;
    }),
  );
  await page.locator('input').focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  try {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 4,
      commands: ['selectAll'],
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 4,
    });
    await cdp.send('Input.insertText', { text: 'replacement query' });
    await expect(page.locator('input')).toHaveValue('replacement query');
    for (const [command, key, modifiers, expected] of [
      ['undo', 'z', 4, 'old text'],
      ['redo', 'Z', 12, 'replacement query'],
    ] as const) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: 'KeyZ',
        windowsVirtualKeyCode: 90,
        modifiers,
        commands: [command],
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: 'KeyZ',
        windowsVirtualKeyCode: 90,
        modifiers,
      });
      await expect(page.locator('input')).toHaveValue(expected);
    }
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      modifiers: 0,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      modifiers: 0,
    });
    await expect(page.locator('button')).toBeFocused();
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      modifiers: 0,
      text: '\r',
      unmodifiedText: '\r',
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      modifiers: 0,
    });
    await expect(page.locator('output')).toHaveText('replacement query');
  } finally {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  }
  expect(page.context().pages()).toHaveLength(1);
});

test('non-activating keys can leave new-context links while cross-origin focus stays unproven', async ({
  page,
}) => {
  await page.setContent('<a href="/next" target="_blank">New tab</a>');
  await page.locator('a').focus();
  const cdp = await page.context().newCDPSession(page);
  const check = (activates: boolean) =>
    cdp.send('Runtime.evaluate', {
      expression: `(${guard})(false, ${activates})`,
      returnByValue: true,
      silent: true,
      throwOnSideEffect: true,
    });
  expect((await check(false)).result.value).toBe(true);
  expect((await check(true)).result.value).toBe(false);
  await page.route('https://outside.test/frame', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<input>' }),
  );
  await page.setContent('<iframe src="https://outside.test/frame"></iframe>');
  await page.frameLocator('iframe').locator('input').focus();
  expect((await check(false)).result.value).toBe(false);
});
