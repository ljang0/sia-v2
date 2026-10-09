import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EphemeralPayloadCipher } from '../storage/persistence.js';
import {
  ByokCredential,
  ByokForwarder,
  checkByokConfig,
  DEFAULT_BYOK_BASE_URL,
  validateByokConfig,
} from './byok.js';
import { HostedResponsesProxy } from './hosted-responses-proxy.js';

const KEY = 'sk-test-0123456789abcdefghijklmnop';
const directories: string[] = [];
const proxies: HostedResponsesProxy[] = [];
afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.dispose()));
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('your own API key', () => {
  it('accepts https endpoints and loopback http only, without embedded credentials', () => {
    expect(validateByokConfig({ model: 'gpt-5', apiKey: KEY })).toEqual({
      baseUrl: DEFAULT_BYOK_BASE_URL,
      model: 'gpt-5',
      apiKey: KEY,
    });
    expect(
      validateByokConfig({ baseUrl: 'http://127.0.0.1:8080/v1/', model: 'lab/m', apiKey: KEY })
        .baseUrl,
    ).toBe('http://127.0.0.1:8080/v1');
    expect(() =>
      validateByokConfig({ baseUrl: 'http://lab.example/v1', model: 'm', apiKey: KEY }),
    ).toThrow('https://');
    expect(() =>
      validateByokConfig({ baseUrl: 'https://u:p@lab.example/v1', model: 'm', apiKey: KEY }),
    ).toThrow('without a password');
    expect(() => validateByokConfig({ model: 'gpt 5', apiKey: KEY })).toThrow('model name');
    expect(() => validateByokConfig({ model: 'gpt-5', apiKey: 'short' })).toThrow('API key');
  });

  it('stores the key encrypted with private permissions and exposes only model and host', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-byok-'));
    directories.push(directory);
    const path = join(directory, 'byok.enc');
    const credential = new ByokCredential(path, new EphemeralPayloadCipher());
    expect(credential.summary()).toBeUndefined();
    credential.save(validateByokConfig({ model: 'gpt-5', apiKey: KEY }));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path).includes(Buffer.from(KEY))).toBe(false);
    expect(credential.summary()).toEqual({ model: 'gpt-5', host: 'api.openai.com' });
    expect(JSON.stringify(credential.summary())).not.toContain(KEY);
    expect(credential.read().apiKey).toBe(KEY);
    credential.clear();
    expect(credential.configured).toBe(false);
    expect(credential.summary()).toBeUndefined();
  });

  it('gives Codex only a loopback capability and attaches the key upstream', async () => {
    const upstream = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('data: {"type":"response.completed"}\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    const config = validateByokConfig({
      baseUrl: 'https://lab.example/v1',
      model: 'lab/spark',
      apiKey: KEY,
    });
    const proxy = new HostedResponsesProxy(
      new ByokForwarder(() => config, upstream as typeof fetch),
      { id: 'sia_byok', name: 'Your API key' },
    );
    proxies.push(proxy);
    const provider = await proxy.issue('lab/spark');
    expect(provider).toMatchObject({ id: 'sia_byok', name: 'Your API key' });
    expect(JSON.stringify(provider)).not.toContain(KEY);
    expect(provider.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);

    const response = await fetch(`${provider.baseUrl}/responses`, {
      method: 'POST',
      body: JSON.stringify({ model: 'lab/spark', stream: true }),
      headers: {
        authorization: `Bearer ${provider.bearerToken}`,
        'content-type': 'application/json',
      },
    });
    expect(await response.text()).toContain('response.completed');
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe('https://lab.example/v1/responses');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${KEY}`);
  });

  it('rejects a key the endpoint refuses and accepts endpoints without a models list', async () => {
    const config = validateByokConfig({ model: 'gpt-5', apiKey: KEY });
    await expect(
      checkByokConfig(config, (async () => new Response('', { status: 401 })) as typeof fetch),
    ).rejects.toThrow('not accepted');
    await expect(
      checkByokConfig(config, (async () => new Response('', { status: 404 })) as typeof fetch),
    ).resolves.toBeUndefined();
    await expect(
      checkByokConfig(config, (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch),
    ).rejects.toThrow('could not reach');
  });
});
