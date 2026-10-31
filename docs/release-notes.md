# Sia 0.1.0-alpha.39

Pilot candidate — acceptance and distribution pending.

Sia is a private macOS 14+ alpha of a personal assistant that works in your apps for you. Sign in
with your invited email, then connect your ChatGPT plan in Settings → AI. You don't need to install
anything else or paste an API key.

## Concurrent background work

Alpha.39 isolates each task's computer access and lets independent background windows progress
without waiting for another task's entire GUI loop. Work on the same window stays ordered; stopping
one task releases its own access. On my screen remains exclusive. This change is awaiting full
signed-app acceptance; see [release status](./release-status.md) for verified scope.

## What's new since alpha.24

- **Use my Mac works in the background.** Sia can work in your apps while you keep using your Mac.
  Choose On my screen in Settings → Computer if you'd rather watch it work. Sia keeps your display
  awake during a Mac task and pauses if your Mac locks or sleeps; unlock it and press Continue task.
- **Simpler setup.** One setup flow covers AI access and the Mac permissions Sia needs. Google
  Workspace, Slack, GitHub, and Notion connections stay optional. Chrome setup is included, with an
  explicit option to continue without it. Use my Mac walks through
  Accessibility, Screen Recording, app Automation, and Full Disk Access; macOS approves each grant.
  Connected-app setup skips Mac permissions, and ordinary chat remains available before screen access.
- **Visible setup progress.** Codex setup shows downloaded megabytes and handles slow connections;
  a stalled download offers a clear retry without replacing a working installation.
- **Reports you can open.** Final file links from ordinary provider replies now also receive
  verified result controls. Generated documents have Preview, Open, and Reveal controls that
  remain available when you reopen the conversation. Phone remote can download saved results.
- **Monthly and yearly schedules.** Create schedules directly from Scheduled. Month-end and
  leap-day dates are preserved, and successful monitoring checks with no new findings stay quiet.
- **Clearer conversations.** Sia shows what it is doing while it works, folds finished steps,
  formats replies, and lets you queue follow-up messages. Messages you send while offline wait and
  go out when you're back online.
- **Approvals that wait for you.** Sia waits for your answer instead of timing out, names the files
  it wants to change, and notifies you when it needs your OK. Turning off approvals asks first.
- **Safer everyday controls.** Deleting or disconnecting asks first, archiving offers Undo, and
  quitting while a task runs asks before stopping it. The window reopens where you left it.
- **Faster startup and streaming.** The window opens while startup checks finish, streamed replies
  use smaller updates, and long tasks show their progress with calmer animations.
- **GitHub and Notion.** Connect them from Settings → Connections. Calendar, Tasks, and Outlook
  remain unavailable in this candidate; Slack behavior is unchanged.
- **Your own API key.** Settings → AI can optionally use an OpenAI Responses-compatible model.
  The key is encrypted and never shown again after saving.
- **Scotty and phone access.** The desktop companion and Wi-Fi remote remain available. Text Sia
  adds iMessage, Telegram, and Discord channels, off by default. Your own paired phone and texting numbers follow your Computer approval setting; trusted
  people's Sia and the plain-HTTP Wi-Fi link always ask. Optional YES/NO replies approve one exact step. Voice notes, photos, and
  result files are implemented. Real phone and bot acceptance remains a release gate.
- **Native iPhone companion.** Pair the TestFlight app with your Mac to send tasks and view
  results over the encrypted relay. Your Mac must remain awake with Sia running.
- **Voice.** Hold Fn to talk to Sia and hear results read back.
- **Feedback.** Rate finished tasks with thumbs up or down and optional reasons. Notes are previewed
  before sending. Ratings queue for cloud sync; account deletion removes their cloud notes and
  report contributions.
- **Refreshed interface.** More readable controls, clearer working states, responsive menus, and
  reduced-motion support on Mac and phone.
- **Computer-use recovery.** When a dialog takes focus, Sia can find it and continue the task.
- **Setup and pairing fixes.** Included AI can finish setup without ChatGPT sign-in; another phone
  can pair while one is connected; self-addressed replies no longer start an echo task.

## Changes since alpha.37

- **Chrome setup before the first task.** Default Mac setup offers a window connection and checks
  that a website is available. Chrome's own permission prompts still require your approval.
- **Continue after browser access expires.** A conversation offers Connect Chrome & continue when
  the host reports missing browser access. It preserves the request and asks for the task window.
- **All saved documents are accessible.** A multi-file response gives each verified result its
  own Preview and Open controls, including file links returned alongside the primary result.
- **Independent document tasks.** Background file and planning work no longer reserves the whole
  computer before it starts. GUI action loops still wait for exclusive control, and tasks sharing
  a folder still queue to protect each other’s files.
- **Clearer file guidance.** When a source document is outside the task folder, Sia points to
  Add files instead of asking you to copy it into an internal workspace.

These changes are undergoing signed-app acceptance. Real-work and concurrent-use checks are
tracked in [release status](./release-status.md).

## Earlier Chrome setup changes

- **Clearer Chrome connection.** Connect Chrome explains that setup may briefly show Chrome.
  You review any Chrome permission prompt yourself. Automatic background connection never starts
  this foreground setup, and a refused browser read no longer reports a successful connection.

## Good to know

- Sia and your Mac need to stay on and awake for tasks and schedules to run.
- Sia won't type into password fields, sign-in screens, Keychain, or password managers.
- Research sharing is off unless you separately agree to it in Privacy.

Read [`PRIVACY.md`](../PRIVACY.md) before connecting an app or joining research. Report problems
through the private alpha support channel described in [`SUPPORT.md`](../SUPPORT.md).
