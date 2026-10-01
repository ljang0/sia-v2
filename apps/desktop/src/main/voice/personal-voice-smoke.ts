import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { EphemeralPayloadCipher, SqliteRecordRepository } from '../storage/persistence.js';
import { ElevenLabsVoiceService, type ManagedVoiceGateway } from './voice-service.js';

/** Explicit opt-in only: synthetic speech, no microphone, user audio, or model turn. */
export async function verifyPersonalVoice(gateway: ManagedVoiceGateway): Promise<void> {
  if (process.env.SIA_VOICE_REAL_SMOKE !== '1')
    throw new Error('Set SIA_VOICE_REAL_SMOKE=1 to run the paid voice round trip.');
  const directory = await mkdtemp(join(tmpdir(), 'sia-voice-live-'));
  const repository = new SqliteRecordRepository(':memory:', new EphemeralPayloadCipher());
  const voice = new ElevenLabsVoiceService({ repository, gateway });
  try {
    const started = Date.now();
    await voice.configure();
    const speech = await voice.speak('Find my Carnegie Mellon professors for this semester.');
    const batch = await voice.transcribe(speech.audioBase64, speech.mimeType);
    verifyTranscript(batch);
    const mp3 = join(directory, 'synthetic.mp3');
    const wav = join(directory, 'synthetic.wav');
    await writeFile(mp3, Buffer.from(speech.audioBase64, 'base64'), { mode: 0o600 });
    await promisify(execFile)('/usr/bin/afconvert', [
      '-f',
      'WAVE',
      '-d',
      'LEI16@16000',
      '-c',
      '1',
      mp3,
      wav,
    ]);
    const audio = await readFile(wav);
    let pcm: Buffer | undefined;
    for (let offset = 12; offset + 8 <= audio.length;) {
      const size = audio.readUInt32LE(offset + 4);
      if (offset + 8 + size > audio.length) throw new Error('Invalid synthetic WAV.');
      if (audio.toString('ascii', offset, offset + 4) === 'data') {
        pcm = audio.subarray(offset + 8, offset + 8 + size);
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (!pcm?.length) throw new Error('Synthetic speech conversion failed.');
    const session = await voice.startRealtime();
    for (let offset = 0; offset < pcm.length; offset += 32_000)
      voice.appendRealtime(
        session.sessionId,
        pcm.subarray(offset, offset + 32_000).toString('base64'),
      );
    const realtime = await voice.stopRealtime(session.sessionId, true);
    verifyTranscript(realtime);
    const cancelled = await voice.startRealtime();
    if ((await voice.stopRealtime(cancelled.sessionId, false)) !== '')
      throw new Error('Cancelled recording produced text.');
    process.stdout.write(
      JSON.stringify({
        voice: voice.view().selectedVoiceName,
        audioBytes: Buffer.from(speech.audioBase64, 'base64').length,
        batch,
        realtime,
        cancellation: 'passed',
        elapsedMs: Date.now() - started,
      }) + '\n',
    );
  } finally {
    voice.dispose();
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function verifyTranscript(text: string): void {
  if (!/Carnegie Mellon/i.test(text) || !/professors/i.test(text) || !/semester/i.test(text))
    throw new Error('Voice round-trip transcription did not preserve the synthetic request.');
}
