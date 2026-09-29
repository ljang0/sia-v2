// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer, microphoneLevel, pcm16Base64 } from './Composer';

class TestMediaRecorder extends EventTarget {
  static isTypeSupported() {
    return true;
  }

  readonly mimeType = 'audio/webm;codecs=opus';
  state: RecordingState = 'inactive';

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    const event = new Event('dataavailable') as BlobEvent;
    Object.defineProperty(event, 'data', { value: new Blob(['voice']) });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event('stop'));
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('composer voice input', () => {
  it('maps microphone energy to a stable five-step presence level', () => {
    expect([0, 0.02, 0.04, 0.08, 0.2].map(microphoneLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it('downsamples microphone audio to little-endian 16 kHz PCM', () => {
    const encoded = pcm16Base64(new Float32Array([-1, -1, 0, 0, 1, 1]), 32_000);
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const view = new DataView(bytes.buffer);

    expect(bytes.byteLength).toBe(6);
    expect(view.getInt16(0, true)).toBe(-32_768);
    expect(view.getInt16(2, true)).toBe(0);
    expect(view.getInt16(4, true)).toBe(32_767);
  });

  it('records on demand and inserts the transcript without sending', async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack }],
        })),
      },
    });
    vi.stubGlobal('MediaRecorder', TestMediaRecorder);
    const transcribe = vi.fn(async () => 'voice request');
    const send = vi.fn();
    render(<Composer voiceEnabled onTranscribe={transcribe} onSend={send} onStop={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    expect(await screen.findByRole('button', { name: 'Stop recording and transcribe' })).toBe(
      screen.getByTestId('composer-voice-input'),
    );
    // A listening waveform shows only while the microphone is open.
    expect(screen.getByTestId('voice-wave').getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording and transcribe' }));

    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value,
      ).toBe('voice request'),
    );
    expect(screen.queryByTestId('voice-wave')).toBeNull();
    expect(transcribe).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('offers a controlled hands-free conversation without replacing dictation', () => {
    const onChange = vi.fn();
    const view = render(
      <Composer
        voiceEnabled
        voiceCanListen={false}
        onTranscribe={vi.fn()}
        onVoiceConversationChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start voice conversation' }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Dictate message' })).toBeTruthy();

    view.rerender(
      <Composer
        voiceEnabled
        voiceConversation
        voiceCanListen={false}
        onTranscribe={vi.fn()}
        onVoiceConversationChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'End voice conversation' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe('shared voice capture ownership', () => {
  function microphone(getUserMedia = vi.fn(async () => ({ getTracks: () => [] }))) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', TestMediaRecorder);
    return getUserMedia;
  }

  it('does not open the microphone while Fn owns capture', async () => {
    const getUserMedia = microphone();
    render(
      <Composer
        voiceEnabled
        onAcquireVoiceCapture={async () => {
          throw new Error('Another voice recording is active.');
        }}
        onTranscribe={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    await screen.findByText('Another voice recording is active.');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('releases ownership when microphone permission is denied', async () => {
    microphone(
      vi.fn(async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      }),
    );
    const release = vi.fn(async () => undefined);
    render(
      <Composer
        voiceEnabled
        onAcquireVoiceCapture={async () => 'lease'}
        onReleaseVoiceCapture={release}
        onTranscribe={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    await waitFor(() => expect(release).toHaveBeenCalledWith('lease'));
    expect(await screen.findByRole('button', { name: 'Dictate message' })).toBeTruthy();
  });

  it('closes a microphone that finishes opening after unmount and sends nothing', async () => {
    let resolve!: (stream: { getTracks(): { stop(): void }[] }) => void;
    const stop = vi.fn();
    const getUserMedia = vi.fn(
      () =>
        new Promise<{ getTracks(): { stop(): void }[] }>((done) => {
          resolve = done;
        }),
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', TestMediaRecorder);
    const release = vi.fn(async () => undefined);
    const send = vi.fn();
    const transcribe = vi.fn();
    const view = render(
      <Composer
        voiceEnabled
        onAcquireVoiceCapture={async () => 'lease'}
        onReleaseVoiceCapture={release}
        onTranscribe={transcribe}
        onSend={send}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    view.unmount();
    resolve({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(release).toHaveBeenCalledWith('lease');
    expect(transcribe).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Mac live dictation', () => {
  function liveMicrophone() {
    const trackStop = vi.fn();
    const processor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as
        | null
        | ((event: { inputBuffer: { getChannelData(index: number): Float32Array } }) => void),
    };
    const close = vi.fn(async () => {});
    vi.stubGlobal(
      'AudioContext',
      class {
        sampleRate = 32_000;
        destination = {};
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect: vi.fn() };
        }
        createScriptProcessor() {
          return processor;
        }
        createGain() {
          return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
        }
        async resume() {}
        close = close;
      },
    );
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const props = {
      voiceEnabled: true,
      realtimeDictation: true,
      onTranscribe: vi.fn(async () => {
        throw new Error('Mac dictation cannot use file upload');
      }),
      onStartRealtime: vi.fn(async () => 'mac-session'),
      onAppendRealtime: vi.fn(async () => {}),
      onStopRealtime: vi.fn(async (_id: string, commit: boolean): Promise<string> =>
        commit ? 'voice request' : '',
      ),
      onAcquireVoiceCapture: vi.fn(async () => 'lease'),
      onReleaseVoiceCapture: vi.fn(async () => {}),
      onSend: vi.fn(),
      onStop: vi.fn(),
    };
    return { props, trackStop, close, processor, getUserMedia };
  }

  it('streams PCM and appends to the latest draft without uploading or sending', async () => {
    const h = liveMicrophone();
    render(<Composer {...h.props} initialValue="First draft" />);
    expect(h.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    await screen.findByRole('button', { name: 'Stop recording and transcribe' });
    await act(async () =>
      h.processor.onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array([0.1, 0.1, 0, 0]) },
      }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Updated draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording and transcribe' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value,
      ).toBe('Updated draft voice request'),
    );
    expect(h.props.onStartRealtime).toHaveBeenCalledOnce();
    expect(h.props.onAppendRealtime).toHaveBeenCalledWith('mac-session', expect.any(String));
    expect(h.props.onStopRealtime).toHaveBeenCalledExactlyOnceWith('mac-session', true);
    expect(h.props.onTranscribe).not.toHaveBeenCalled();
    expect(h.props.onSend).not.toHaveBeenCalled();
    expect(h.trackStop).toHaveBeenCalled();
    expect(h.close).toHaveBeenCalled();
    expect(h.props.onReleaseVoiceCapture).toHaveBeenCalledWith('lease');
  });

  it('cancels live dictation on unmount and discards its transcript', async () => {
    const h = liveMicrophone();
    const view = render(<Composer {...h.props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    await screen.findByRole('button', { name: 'Stop recording and transcribe' });
    view.unmount();
    await waitFor(() =>
      expect(h.props.onStopRealtime).toHaveBeenCalledExactlyOnceWith('mac-session', false),
    );
    expect(h.trackStop).toHaveBeenCalled();
    expect(h.props.onReleaseVoiceCapture).toHaveBeenCalledWith('lease');
    expect(h.props.onTranscribe).not.toHaveBeenCalled();
    expect(h.props.onSend).not.toHaveBeenCalled();
  });

  it('releases the microphone and capture ownership when Speech Recognition is denied', async () => {
    const h = liveMicrophone();
    h.props.onStartRealtime.mockRejectedValue(
      new Error('Allow Speech Recognition in System Settings.'),
    );
    render(<Composer {...h.props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dictate message' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Allow Speech Recognition',
    );
    expect(h.trackStop).toHaveBeenCalled();
    expect(h.props.onReleaseVoiceCapture).toHaveBeenCalledWith('lease');
    expect(h.props.onTranscribe).not.toHaveBeenCalled();
    expect(h.props.onSend).not.toHaveBeenCalled();
  });

  it('surfaces stream failures and stops conversation instead of reopening the microphone', async () => {
    const h = liveMicrophone();
    const onChange = vi.fn();
    h.props.onAppendRealtime.mockRejectedValue(new Error('Voice connection interrupted.'));
    render(<Composer {...h.props} voiceConversation onVoiceConversationChange={onChange} />);
    await waitFor(() => expect(h.processor.onaudioprocess).not.toBeNull());
    await act(async () =>
      h.processor.onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array([0.1, 0.1]) },
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Voice connection interrupted.',
    );
    expect(onChange).toHaveBeenCalledWith(false);
    expect(h.props.onStopRealtime).toHaveBeenCalledWith('mac-session', false);
    expect(h.trackStop).toHaveBeenCalled();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    expect(h.props.onStartRealtime).toHaveBeenCalledOnce();
    expect(h.props.onSend).not.toHaveBeenCalled();
  });

  it('ends conversation while its voice session is starting and discards the late session', async () => {
    const h = liveMicrophone();
    let resolve!: (session: string) => void;
    h.props.onStartRealtime.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onChange = vi.fn();
    const view = render(
      <Composer {...h.props} voiceConversation onVoiceConversationChange={onChange} />,
    );
    await waitFor(() => expect(h.props.onStartRealtime).toHaveBeenCalledOnce());
    expect(screen.getByText('Voice · starting microphone…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'End voice conversation' }));
    view.rerender(
      <Composer {...h.props} voiceConversation={false} onVoiceConversationChange={onChange} />,
    );
    expect(h.trackStop).toHaveBeenCalled();
    await act(async () => resolve('late-session'));
    expect(h.props.onStopRealtime).toHaveBeenCalledWith('late-session', false);
    expect(h.props.onReleaseVoiceCapture).toHaveBeenCalledWith('lease');
    expect(h.processor.onaudioprocess).toBeNull();
    expect(h.props.onSend).not.toHaveBeenCalled();
  });

  it('stops hands-free mode on an empty transcript and does not silently retry', async () => {
    const h = liveMicrophone();
    h.props.onStopRealtime.mockResolvedValue('');
    const onChange = vi.fn();
    render(<Composer {...h.props} voiceConversation onVoiceConversationChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish speaking' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No speech was detected.');
    expect(onChange).toHaveBeenCalledWith(false);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    expect(h.props.onStartRealtime).toHaveBeenCalledOnce();
    expect(h.props.onSend).not.toHaveBeenCalled();
  });

  it('discards a pending transcript when the conversation is ended', async () => {
    const h = liveMicrophone();
    let resolve!: (transcript: string) => void;
    h.props.onStopRealtime.mockImplementation(async (_id, commit) =>
      commit
        ? new Promise<string>((done) => {
            resolve = done;
          })
        : '',
    );
    const onChange = vi.fn();
    const view = render(
      <Composer {...h.props} voiceConversation onVoiceConversationChange={onChange} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Finish speaking' }));
    await waitFor(() =>
      expect(h.props.onStopRealtime).toHaveBeenCalledWith('mac-session', true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'End voice conversation' }));
    view.rerender(
      <Composer {...h.props} voiceConversation={false} onVoiceConversationChange={onChange} />,
    );
    await act(async () => resolve('Do not send this after cancellation.'));
    expect(h.props.onSend).not.toHaveBeenCalled();
    expect(h.props.onReleaseVoiceCapture).toHaveBeenCalledWith('lease');
    expect(h.trackStop).toHaveBeenCalled();
  });

  it('allows finishing a conversation utterance without waiting for silence detection', async () => {
    const h = liveMicrophone();
    const view = render(
      <Composer {...h.props} voiceConversation onVoiceConversationChange={vi.fn()} />,
    );
    await waitFor(() => expect(h.processor.onaudioprocess).not.toBeNull());
    await act(async () =>
      h.processor.onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array([0.01, 0.01]) },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish speaking' }));
    await waitFor(() =>
      expect(h.props.onSend).toHaveBeenCalledExactlyOnceWith('voice request', []),
    );
    expect(h.trackStop).toHaveBeenCalled();
    view.unmount();
  });

  it('keeps voice conversation auto-submit separate from draft dictation', async () => {
    const h = liveMicrophone();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const view = render(
      <Composer {...h.props} voiceConversation onVoiceConversationChange={vi.fn()} />,
    );
    await waitFor(() => expect(h.processor.onaudioprocess).not.toBeNull());
    for (const [time, sample] of [
      [1000, 0.1],
      [3000, 0],
      [4100, 0],
    ]) {
      now = time!;
      await act(async () =>
        h.processor.onaudioprocess?.({
          inputBuffer: { getChannelData: () => new Float32Array([sample!, sample!]) },
        }),
      );
    }
    await waitFor(() =>
      expect(h.props.onSend).toHaveBeenCalledExactlyOnceWith('voice request', []),
    );
    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value,
    ).toBe('');
    expect(h.props.onTranscribe).not.toHaveBeenCalled();
    view.unmount();
  });
});
