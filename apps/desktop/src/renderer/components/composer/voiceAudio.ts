// Microphone audio helpers for dictation and voice conversation.

export interface MutableSlot<T> {
  current: T | undefined;
}

export function releaseRealtimeAudio(
  processorRef: MutableSlot<ScriptProcessorNode>,
  sourceRef: MutableSlot<MediaStreamAudioSourceNode>,
  gainRef: MutableSlot<GainNode>,
  contextRef: MutableSlot<AudioContext>,
) {
  if (processorRef.current) processorRef.current.onaudioprocess = null;
  processorRef.current?.disconnect();
  sourceRef.current?.disconnect();
  gainRef.current?.disconnect();
  processorRef.current = undefined;
  sourceRef.current = undefined;
  gainRef.current = undefined;
  const context = contextRef.current;
  contextRef.current = undefined;
  if (context) void context.close();
}

export function rootMeanSquare(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function microphoneLevel(rms: number): number {
  if (rms < 0.012) return 0;
  if (rms < 0.025) return 1;
  if (rms < 0.05) return 2;
  if (rms < 0.1) return 3;
  return 4;
}

/** Converts browser microphone samples to little-endian mono PCM expected by Scribe. */
export function pcm16Base64(samples: Float32Array, inputSampleRate: number): string {
  const outputLength = Math.max(1, Math.round((samples.length * 16_000) / inputSampleRate));
  const output = new Uint8Array(outputLength * 2);
  const view = new DataView(output.buffer);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor((outputIndex * samples.length) / outputLength);
    const end = Math.max(
      start + 1,
      Math.floor(((outputIndex + 1) * samples.length) / outputLength),
    );
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex] ?? 0;
    }
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return btoa(String.fromCharCode(...output));
}

export function preferredRecordingMimeType(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((value) =>
    MediaRecorder.isTypeSupported(value),
  );
}

export async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}
