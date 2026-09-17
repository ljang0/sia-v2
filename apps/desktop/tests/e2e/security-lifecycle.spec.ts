import { _electron as electron, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function launchTestApplication() {
  const testRoot = await mkdtemp(join(tmpdir(), 'sia-security-e2e-'));
  const userData = join(testRoot, 'user-data');
  const workspace = join(testRoot, 'workspace');
  await Promise.all([mkdir(userData), mkdir(workspace)]);
  const application = await electron.launch({
    args: [desktopRoot],
    env: {
      ...process.env,
      SIA_FAKE_SERVICES: '1',
      SIA_TEST_PLAINTEXT_STORAGE: '1',
      SIA_TEST_USER_DATA: userData,
      SIA_TEST_WORKSPACE: workspace,
    },
  });
  return { application, testRoot };
}

test('the file renderer installs and enforces the production CSP', async () => {
  const [rendererHtml, mainBundle] = await Promise.all([
    readFile(join(desktopRoot, 'out/renderer/index.html'), 'utf8'),
    readFile(join(desktopRoot, 'out/main/index.js'), 'utf8'),
  ]);
  const bootstrap = rendererHtml.match(
    /<script data-sia-csp-bootstrap>([\s\S]*?)<\/script>/,
  )?.[1];
  expect(bootstrap).toBeDefined();
  const bootstrapHash = `sha256-${createHash('sha256').update(bootstrap!).digest('base64')}`;
  expect(mainBundle).toContain(bootstrapHash);

  const { application, testRoot } = await launchTestApplication();
  try {
    const page = await application.firstWindow();
    await expect.poll(() => page.evaluate(() => Boolean(window.sia))).toBe(true);

    const security = await page.evaluate(() => {
      const content =
        document.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')
          ?.content ?? '';
      const marker = '__siaCspInlineScriptRan';
      Reflect.deleteProperty(window, marker);
      const script = document.createElement('script');
      script.textContent = `window.${marker} = true`;
      document.body.append(script);
      const inlineScriptBlocked = !Reflect.get(window, marker);
      script.remove();
      return { content, inlineScriptBlocked, protocol: location.protocol };
    });

    expect(security.protocol).toBe('file:');
    expect(security.content).toContain("script-src 'self'");
    expect(security.content).toContain("connect-src 'none'");
    expect(security.inlineScriptBlocked).toBe(true);
  } finally {
    await application.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});

test('a second-instance event recreates a closed macOS window', async () => {
  test.skip(process.platform !== 'darwin', 'Window reopening behavior is macOS-specific.');
  const { application, testRoot } = await launchTestApplication();
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole('heading', { name: 'Let’s set up Sia.' })).toBeVisible();
    await page.close();
    await expect.poll(() => application.windows().length).toBe(0);

    const reopenedWindow = application.waitForEvent('window');
    await application.evaluate(({ app }) => {
      app.emit('second-instance', {} as never, [], '', {});
    });
    const reopenedPage = await reopenedWindow;

    await expect(
      reopenedPage.getByRole('heading', { name: 'Let’s set up Sia.' }),
    ).toBeVisible();
    await expect.poll(() => application.windows().length).toBe(1);
  } finally {
    await application.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});
