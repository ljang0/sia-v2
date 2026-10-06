# Sia 0.1.0-alpha.25

Sia is a private macOS 14+ alpha of a personal assistant that works in your apps for you. Sign in
with your invited email, then connect your ChatGPT plan in Settings → AI. You don't need to install
anything else or paste an API key.

## What's new since alpha.24

- **Use my Mac works in the background.** Sia can work in your apps while you keep using your Mac.
  Choose On my screen in Settings → Computer if you'd rather watch it work. Sia keeps your display
  awake during a Mac task and pauses if your Mac locks or sleeps; unlock it and press Continue task.
- **Simpler setup.** One setup flow covers AI access and the Mac permissions Sia needs. Google
  Workspace, Slack, GitHub, Notion, and Chrome connections stay optional. Use my Mac walks through
  Accessibility, Screen Recording, app Automation, and Full Disk Access; macOS approves each grant.
  Connected-app setup skips Mac permissions, and ordinary chat remains available before screen access.
- **Visible setup progress.** Codex setup shows downloaded megabytes and handles slow connections;
  a stalled download offers a clear retry without replacing a working installation.
- **Reports you can open.** Generated documents have Preview, Open, and Reveal controls that
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
  adds iMessage, Telegram, and Discord channels, off by default. Every phone action requires its
  own approval; optional YES/NO replies approve one exact pending step. Voice notes, photos, and
  result files are implemented. Real phone and bot acceptance remains a release gate.
- **Voice.** Hold Fn to talk to Sia and hear results read back.
- **Feedback.** Rate replies with thumbs up or down.

## Good to know

- Sia and your Mac need to stay on and awake for tasks and schedules to run.
- Sia won't type into password fields, sign-in screens, Keychain, or password managers.
- Research sharing is off unless you separately agree to it in Privacy.

Read [`PRIVACY.md`](../PRIVACY.md) before connecting an app or joining research. Report problems
through the private alpha support channel described in [`SUPPORT.md`](../SUPPORT.md).
