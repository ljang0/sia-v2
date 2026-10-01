import { app, shell, systemPreferences } from 'electron';

/** Explicit setup only. Asking for consent does not open an audio stream. */
export async function requestMicrophonePermission(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return;
  if (status === 'not-determined') {
    // Request from the signed app that owns the window, rather than its
    // background command-line helper, so macOS has a visible consent owner.
    app.focus({ steal: true });
    if (await systemPreferences.askForMediaAccess('microphone')) return;
  }
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  );
}
