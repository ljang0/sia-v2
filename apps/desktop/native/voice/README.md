# Native voice helper

Adapted at the repository owner's request from
[romirthedev/notch](https://github.com/romirthedev/notch/tree/6c74c30c31a2ce31a852209eba86f28c8371409e):

- `Core/PushToTalkMonitor.swift`: Fn key code 63, 300 ms hold detection, shortcut exclusion,
  pass-through event tap, and permission retry.
- `Core/EdgeGlowWindowController.swift` and `UI/EdgeGlowView.swift`: transparent nonactivating
  panel, bloom, and interruptible fade. Sia uses a thin forest-green path with a travelling mint tail.
- `Context/ScreenContextProvider.swift`: frontmost-app, selected-text capture, and bounded accessibility outlines, narrowed to explicit
  Fn gestures with Sia’s opt-in and protected-surface filtering. `WindowContext.swift` also adapts
  its static-text/NSNumber reading for explicit Use my Mac snapshots of an exact granted window.
  The latter checks window ownership and unambiguous geometry, scans security metadata first,
  and caps traversal at 2,000 nodes, 40 levels, 12,000 text characters, and a 1.5 second deadline.
  It does not return editable values or mint action references.
- `Core/NotchWindowController.swift` and expanded-view concepts: nonactivating status panel, adapted
  for bounded progress, stop, open, dismiss, and follow-up events.
- `Voice/AudioCaptureEngine.swift`: AVAudioEngine capture and AVAudioConverter to 16 kHz mono PCM.

Sia adds bounded streaming, Escape/sleep/parent-exit cleanup, explicit permission setup, a destination
indicator, reduced-motion support, and removes the private display-corner API. Silence never commits
an utterance: release is the only send gesture. Audio is copied before the engine reuses its buffer.

The original repository at this revision has no license file. These sources retain their provenance;
this adaptation does not claim a new third-party license for the original code.

`pnpm --filter @sia/desktop native:build` builds an ad-hoc signed universal helper on macOS 14+.
Build products stay in ignored `build/native/`. The release signing pipeline signs the embedded helper
with the application. The helper never captures screenshots, runs model-supplied shell commands, or receives provider credentials.
The host may submit an already-authorized window image for local OCR. Voice transport is inherited stdin/stdout; fixed host-only `--browser-window` and `--window-context` operations return bounded JSON. EOF and a parent heartbeat stop recording.

`MacSpeech.swift` is Sia’s original native speech implementation, separate from the Notch adaptations.
The `--speech` mode enumerates installed voices, renders speech to in-memory WAV buffers, and accepts
bounded 16 kHz PCM for Apple on-device recognition. It never installs an event tap or opens the
microphone itself. Catalog/TTS operations request no speech or microphone permission. Recognition
requires the explicit Speech Recognition grant and `supportsOnDeviceRecognition`; every request sets
`requiresOnDeviceRecognition = true`. Parent cancellation, EOF, and heartbeat expiry stop work.

Connected-app Fn context defaults off. Use my Mac enables gesture context with its selected native access mode. Settings → Assistant enables app/window/selection metadata and a static accessibility outline for voice
requests. Connected-app browser content stays behind the Chrome attachment boundary. In Use my Mac, the copied `ScreenContextProvider.swift` reads the foreground browser directly. Text is captured before
the panel appears and sent only with the committed request; it is not written to a local journal.
Fn never opens the command box or main window. The green edge remains through transcription and
Fn task execution; running/queued tasks move the highlight, approval/input waits keep it still,
and completion/failure/cancellation fades it out. The parent sends only an idle/working/waiting
phase, never task text. Reduced Motion uses a steady edge. Approvals remain in the main app.

The Connected apps outline uses Notch’s 400-node, 12-level, 2,800-character budgets with a 600 ms deadline. A
metadata pass excludes protected controls before reading static text; editable field values are
not included. Incomplete protection checks suppress content. This remains gesture-only capture.

`ImageText.swift` uses [Apple Vision text recognition](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
for explicit `computer_snapshot.read_text` requests. `--image-text` reads at most 16 MB of image bytes
from stdin, accepts images up to 8,192 pixels on each axis, and returns at most 16,000 characters.
It uses accurate recognition without word correction, omits low-confidence lines, performs no
additional capture or network access, and is terminated by the host after eight seconds. OCR is
observation evidence, not a guarantee that every letter or number was recognized correctly.

`--mac-context` is an explicit native-mode read: Notch's original accessibility reader plus screen
geometry in points/pixels and display origins. It never requests permissions or takes a screenshot.
Its AX calls have short timeouts and a 600 ms budget; secure controls and password-manager apps are
excluded. This command is made available to the native Codex agent for fresh observations. Native
shell/screenshots run in Codex, not inside the voice helper. Mac Fn uses the same reader before any
Sia panel can take focus. The full native route and its broader access are documented in
`docs/architecture.md`. Permission setup includes System Events, Safari and Chrome Automation.
