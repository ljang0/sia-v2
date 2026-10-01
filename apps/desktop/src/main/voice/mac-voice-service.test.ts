import { describe, expect, it, vi } from 'vitest';
import {
  createMacSpeechTransport,
  MacVoiceService,
  type MacSpeechTransport,
} from './mac-voice-service.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../persistence.js';

function harness(dictationAvailable = true) {
  const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  const wave = Buffer.alloc(46);
  wave.write('RIFF', 0);
  wave.write('WAVE', 8);
  const request = vi.fn<MacSpeechTransport['request']>(async (command) => {
    if (command.type === 'catalog')
      return {
        voices: [{ id: 'mac-default', name: 'Samantha', category: 'en-US' }],
        defaultVoiceId: 'mac-default',
        dictationAvailable,
        speechRecognition: 'not-requested',
      };
    if (command.type === 'permissions') return { speechRecognition: 'denied' };
    if (command.type === 'speak') return { audioBase64: wave.toString('base64') };
    if (command.type === 'finish')
      return { text: command.commit ? 'Make a plan for today.' : '' };
    return {};
  });
  const pipe = { closed: false, request, send: vi.fn(), dispose: vi.fn() };
  const factory = vi.fn(() => pipe);
  const service = new MacVoiceService(repository, factory);
  return { service, pipe, factory, repository };
}

describe('Mac voice', () => {
  it.skipIf(process.platform === 'win32')(
    'marks an exited helper closed and rejects pending requests',
    async () => {
      const pipe = createMacSpeechTransport('/usr/bin/false');
      await expect(pipe.request({ type: 'authorize' })).rejects.toThrow('stopped unexpectedly');
      expect(pipe.closed).toBe(true);
      await expect(pipe.request({ type: 'catalog' })).rejects.toThrow('stopped unexpectedly');
      pipe.dispose();
    },
  );

  it('reconnects on retry after the helper exits during permission setup', async () => {
    const h = harness();
    await h.service.configure();
    h.pipe.request.mockImplementationOnce(async () => {
      h.pipe.closed = true;
      throw new Error('Mac voice stopped unexpectedly. Please try again.');
    });
    await expect(h.service.prepareDictation()).rejects.toThrow('stopped unexpectedly');
    const replacement = { ...h.pipe, closed: false };
    h.factory.mockReturnValue(replacement);
    await h.service.prepareDictation();
    expect(h.factory).toHaveBeenCalledTimes(2);
    expect((await h.service.speak('Ready.')).mimeType).toBe('audio/wav');
    h.service.dispose();
    h.repository.close();
  });

  it('rechecks speech access without requesting permission or recording and clears stale grants on failure', async () => {
    const h = harness();
    await h.service.refreshPermissions();
    expect(h.factory).not.toHaveBeenCalled();
    await h.service.configure();
    await h.service.prepareDictation();
    expect(h.service.view().speechRecognition).toBe('allowed');
    h.pipe.request.mockClear();
    await h.service.refreshPermissions();
    expect(h.service.view().speechRecognition).toBe('denied');
    expect(h.pipe.request).toHaveBeenCalledExactlyOnceWith({ type: 'permissions' });
    expect(h.pipe.send).not.toHaveBeenCalled();
    await h.service.prepareDictation();
    h.pipe.request.mockRejectedValueOnce(new Error('Helper unavailable'));
    await expect(h.service.refreshPermissions()).rejects.toThrow('Helper unavailable');
    expect(h.service.view().speechRecognition).toBeUndefined();
    h.service.dispose();
    h.repository.close();
  });

  it('does not restore a cached speech grant or apply a late permission result after disconnect', async () => {
    const h = harness();
    await h.service.configure();
    await h.service.prepareDictation();
    const restored = new MacVoiceService(h.repository, () => h.pipe);
    expect(restored.view().status).toBe('connected');
    expect(restored.view().speechRecognition).toBeUndefined();
    let finish!: (value: Record<string, unknown>) => void;
    h.pipe.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const check = h.service.refreshPermissions();
    h.service.disconnect();
    finish({ speechRecognition: 'allowed' });
    await expect(check).rejects.toThrow('cancelled');
    expect(h.service.view()).toMatchObject({ status: 'disconnected' });
    expect(h.service.view().speechRecognition).toBeUndefined();
    h.repository.close();
  });

  it('never resumes a recording on a replacement helper', async () => {
    const h = harness();
    await h.service.configure();
    const { sessionId } = await h.service.startRealtime();
    h.pipe.closed = true;
    expect(() => h.service.appendRealtime(sessionId, 'AAA=')).toThrow('record again');
    expect(h.pipe.send).not.toHaveBeenCalled();
    expect(h.factory).toHaveBeenCalledTimes(1);
    const replacement = { ...h.pipe, closed: false };
    h.factory.mockReturnValue(replacement);
    await h.service.refresh();
    expect(await h.service.stopRealtime(sessionId, true)).toBe('');
    expect(h.pipe.request.mock.calls.some(([command]) => command.type === 'finish')).toBe(
      false,
    );
    h.service.dispose();
    h.repository.close();
  });

  it('enables installed TTS with no cloud credentials or speech/microphone permission requests', async () => {
    const h = harness(false);
    expect(h.service.view()).toMatchObject({ engine: 'macos', status: 'disconnected' });
    const view = await h.service.configure();
    expect(view).toMatchObject({
      status: 'connected',
      selectedVoiceName: 'Samantha',
      dictationAvailable: false,
    });
    expect(view.dictationDetail).toContain('Read aloud still works');
    expect(h.pipe.request).toHaveBeenCalledExactlyOnceWith({ type: 'catalog' });
    const audio = await h.service.speak('Hello.');
    expect(audio.mimeType).toBe('audio/wav');
    expect(h.pipe.request).toHaveBeenLastCalledWith(
      { type: 'speak', text: 'Hello.', voiceId: 'mac-default' },
      45_000,
    );
    h.repository.put('credentials', 'elevenlabs', { apiKey: 'obsolete-test-value' });
    const restored = new MacVoiceService(h.repository, () => h.pipe).view();
    expect(restored.status).toBe('connected');
    expect(restored.dictationDetail).toContain('Read aloud still works');
    expect(h.repository.get('credentials', 'elevenlabs')).toBeUndefined();
    h.service.dispose();
    h.repository.close();
  });

  it('requires permission before live PCM and commits only when explicitly requested', async () => {
    const h = harness();
    await h.service.configure();
    const { sessionId } = await h.service.startRealtime();
    expect(h.pipe.request.mock.calls.map(([value]) => value.type)).toEqual([
      'catalog',
      'authorize',
      'start',
    ]);
    h.service.appendRealtime(sessionId, Buffer.alloc(48_000).toString('base64'));
    expect(h.pipe.send).toHaveBeenCalledTimes(2);
    expect(h.pipe.send.mock.calls[0]?.[0]).toMatchObject({ type: 'audio', sessionId });
    expect(await h.service.stopRealtime(sessionId, true)).toBe('Make a plan for today.');
    const next = await h.service.startRealtime();
    expect(await h.service.stopRealtime(next.sessionId, false)).toBe('');
    expect(() => h.service.appendRealtime(next.sessionId, 'AAA=')).toThrow('no longer active');
    h.service.dispose();
    h.repository.close();
  });

  it('rejects late configuration and speech results after disconnect', async () => {
    const h = harness();
    await h.service.configure();
    let finish!: (result: Record<string, unknown>) => void;
    h.pipe.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const speech = h.service.speak('Hello.');
    h.service.disconnect();
    finish({ audioBase64: Buffer.alloc(46).toString('base64') });
    await expect(speech).rejects.toThrow('cancelled');
    expect(h.service.view().status).toBe('disconnected');
    expect(h.repository.get('voice', 'macos')).toBeUndefined();
    h.repository.close();
  });

  it('retains speech permission errors and never starts recording after denial', async () => {
    const h = harness();
    await h.service.configure();
    h.pipe.request.mockRejectedValueOnce(
      new Error('Allow Speech Recognition in System Settings.'),
    );
    await expect(h.service.startRealtime()).rejects.toThrow('Allow Speech Recognition');
    expect(h.pipe.request.mock.calls.some(([command]) => command.type === 'start')).toBe(false);
    expect(h.pipe.send).not.toHaveBeenCalled();
    h.service.dispose();
    h.repository.close();
  });

  it('rejects stale voice IDs and oversized PCM before sending them to the native helper', async () => {
    const h = harness();
    await h.service.configure();
    await expect(h.service.speak('Hello.', 'cloud-voice')).rejects.toThrow(
      'installed Mac voice',
    );
    const { sessionId } = await h.service.startRealtime();
    expect(() => h.service.appendRealtime(sessionId, 'a'.repeat(700_001))).toThrow(
      'Invalid voice audio',
    );
    expect(h.pipe.send).not.toHaveBeenCalled();
    h.service.dispose();
    h.repository.close();
  });
});
