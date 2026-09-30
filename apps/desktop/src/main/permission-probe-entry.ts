// Runs as a short-lived child (Electron as Node) so macOS reports Sia's current grants
// instead of the running app's cached view. Prints two booleans and exits; reads no content.
import { currentMacOsPermissionStatus } from '@trycua/cua-driver';

const status = currentMacOsPermissionStatus();
process.stdout.write(
  JSON.stringify({
    accessibility: Boolean(status.accessibility),
    screenRecording: Boolean(status.screenRecording),
  }),
);
