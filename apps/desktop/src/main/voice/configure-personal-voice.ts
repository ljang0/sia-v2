import { app } from 'electron';
import { ElectronPayloadCipher } from '../persistence.js';
import { verifyPersonalVoice } from './personal-voice-smoke.js';
import {
  PersonalVoiceCredential,
  PersonalVoiceGateway,
  personalVoicePath,
} from './personal-voice.js';

// A deliberately separate, windowless entry point: secrets never cross renderer IPC.
app.setName('Sia');
void app
  .whenReady()
  .then(async () => {
    const credential = new PersonalVoiceCredential(
      personalVoicePath(app.getPath('appData')),
      new ElectronPayloadCipher(),
    );
    if (process.argv.includes('--verify')) {
      await verifyPersonalVoice(new PersonalVoiceGateway(() => credential.read()));
      app.exit(0);
      return;
    }
    let input = '';
    for await (const chunk of process.stdin) {
      input += String(chunk);
      if (input.length > 1024) throw new Error('Voice credential input is too long.');
    }
    const gateway = new PersonalVoiceGateway(() => input.trim());
    const catalog = await gateway.voiceCatalog();
    if (!catalog.provider.available)
      throw new Error('No ElevenLabs voices are available for this key.');
    // Validate both transcription and speech scopes without consuming generated audio.
    for (const type of ['batch_scribe', 'realtime_scribe', 'tts_websocket'] as const)
      await gateway.mintVoiceToken(type);
    credential.save(input);
    input = '';
    process.stdout.write(
      'Personal ElevenLabs voice configured securely. Restart Sia, then enable voice in Settings → Voice.\n',
    );
    app.exit(0);
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Voice configuration failed.'}\n`,
    );
    app.exit(1);
  });
