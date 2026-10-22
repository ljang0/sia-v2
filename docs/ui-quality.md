# UI quality gate

Sia's visual idea is simple and specific: **an agent is a living room for work.** A quiet sidebar
holds distinct agent identities; the selected agent opens a clean, neutral workspace beside it. The
look pairs a neutral sidebar and workspace with one emerald accent and Bricolage
headings, native system body type, hairline edges, and soft layered shadows. The product should feel expressive and companionable
without becoming mascot-like. Safety, consent,
and legal surfaces remain sober. Sia is not an AI dashboard and not a chat template.

## Everyday use

The audience is an average consumer without technical knowledge. Make the next action obvious,
use familiar language, and choose sensible defaults. Keep onboarding to a short welcome and access
check followed by optional Fn practice; offer advanced settings and optional features when relevant. Avoid developer jargon,
mandatory tutorials, and long sequences of setup screens. Archived conversations remain available
in Activity and search, without a dedicated sidebar item.

## Appearance and navigation

Welcome screens greet people for their local time of day. Desktop suggestions follow the selected
agent's stated purpose, with everyday tasks as the default; choosing Codex or naming an agent
“Testing1” does not imply a coding workflow. Up to two recent conversations from the selected agent
appear below the suggestions, prioritizing work that needs attention. Opening one resumes its existing
conversation; it does not resend the original request. Phone greetings identify the paired agent and
retain the existing editable recent prompts.

Desktop and phone suggestions use a restrained pointer-following sage highlight, with a centered
keyboard-focus treatment and native button semantics. Choosing a suggestion fills and focuses an
editable draft; sending is explicit. An applied suggestion is consumed so returning to a conversation
cannot replace its edited draft. Welcome headline gradients drift slowly and pause when
hidden. Calm and Reduce Motion keep these surfaces still, and forced colors restores solid text.
The desktop composer's send and Stop buttons ignore repeat clicks while a send or stop is in
flight. Text typed during a send stays as the next draft, a failed send keeps the draft, and a
failed stop shows an error and permits retry.

The latest finished desktop reply and completed phone replies appear in a soft result card. The
original text, links, copy/read-aloud controls, and phone file downloads remain available. “Reply ready”
describes availability, not independent verification that every requested action succeeded. Running,
waiting, cancelled, and failed work do not receive the completed result treatment.

Switching desktop views or phone tabs uses a short fade and vertical ease on the existing surface.
Navigation is immediate, drafts retain their normal persistence, and incoming task updates do not
restart the transition. Reduce Motion and desktop Calm disable this movement.

The desktop Dither aurora stays animated during conversations as well as on the welcome screen,
with a quieter opacity behind replies. It pauses when the window loses focus or becomes hidden;
Calm and Reduce Motion keep a still gradient and dispose the decorative renderer. Buttons retain
their solid accent treatment, and Use my Mac setup still requires its complete permission checklist.

Desktop startup begins with a large wordmark on the canvas color, then eases the background into a
sidebar-colored shape on the left beside “Loading Sia.” It follows the actual initial load: there is no minimum wait,
the ready workspace is immediately usable, and the decorative curtain clears in 240 ms or less.
It never replays for ordinary navigation, the Fn flow, or the launcher. Reduce Motion uses a still
loading state; Calm dismisses it immediately when the saved appearance becomes available. Startup
errors replace the animation with the existing reconnect action. For local visual review, the demo
supports `?startup-delay=2200#demo`; this delay is unavailable in production.

Desktop navigation and phone branding share the supplied white geometric **Sia** logo. The sidebar,
setup welcome, sign-in, phone header, phone welcome, favicon, and iOS Home Screen icon all load the
same bundled PNG. Only one logo is on screen at a time: the phone welcome hero carries it, so the
header keeps an empty slot there.
The bundled copy is the supplied artwork scaled to 768×512 to keep the app light, and the Home
Screen name remains **Sia**.
The desktop title bar centers the unboxed logo between the Mac window controls and sidebar toggle,
with clear space around the mark. Phone and welcome-screen icon treatments remain independent.
An existing iOS Home Screen shortcut may need to be removed and added again to refresh its cached icon.

Settings → More → Appearance has three choices, all saved in the existing encrypted profile and
applied to the main window, Scotty, and the ⌘E launcher (not the phone):

- **Theme**: System (default, follows the Mac), Light, or Dark. Main sets
  `nativeTheme.themeSource`, so every window's `prefers-color-scheme` and first-paint background
  follow it. A plain `appearance.json` in the app data folder mirrors only the theme name, because
  the first window paints before the encrypted profile unlocks; launch therefore never flashes the
  other scheme.
- **Text size**: Small, Default, Large, or Larger (0.92×, 1×, 1.1×, 1.22×). It scales the type tokens
  in `tokens.css` through `--text-scale`, so layouts reflow instead of magnifying; Larger still keeps
  primary actions on screen at 960×640. Brand wordmarks and hero headings keep their size.
  `uiPolicy.test.ts` rejects new bare px font sizes. The View menu's ⌘+ / ⌘− / ⌘0 (Make Text
  Bigger, Make Text Smaller, Actual Size) step this same setting instead of page zoom; Actual Size
  also clears any leftover page zoom. The launcher panel grows with the larger sizes.
- **Atmosphere**: **Expressive** (the default aurora, drifting gradients, and reflective buttons) or
  **Calm** (still decorative surfaces). Both respect macOS Reduce Motion. Calm disposes decorative
  GPU effects, rather than only hiding their output. Task progress and essential status indicators
  remain visible in either mode.

Scotty and Phone remote are directly visible in Settings. Appearance and About live under More,
alongside Assistant and eligible administrator pages. Use my Mac also puts optional Connections
under More; Connected apps keeps it in the main settings list. On the phone, the aurora sits above the shell
background with a persistent gradient beneath the wave canvas. Safari clearing a suspended canvas
does not erase the whole effect. Chat, Tasks, Memory, and keyboard transitions keep this shared layer
mounted; Reduce Motion keeps a still gradient.

The desktop sidebar keeps New conversation and filtering above the scrolling task list. Pinned
agents come first, followed by names; changing selection never reorders groups. Within a group,
conversations pinned from the row menu (Pin / Unpin) come first with a small pin, then the rest by
recency; ⌘1–9 and the ⌘K Pinned section follow the same order. A new conversation with no message, draft, or pin is
listed only while it is open, so leaving it never leaves an empty row behind; ⌘1–9 and ⌘K use
the same list. Conversations saved before pinning
existed start unpinned, and a duplicate starts unpinned. Conversation titles
stay on one line with ellipsis, in evenly sized rows. Working, waiting, unread, and draft cues remain
visible; the full title, draft or latest reply, and update time live in the hover or keyboard-focus
preview. Previewing does not select the conversation or mark it read. Escape, scrolling, and leaving
dismiss the preview. Work that finishes in the open conversation while Sia is on screen is read at
once; if Sia was hidden or minimized, it is read when the window shows again. The collapsed
rail retains new conversation, search, agents, new agent, Activity, and Settings.

Agent navigation uses flat groups and rotating disclosure chevrons on the neutral sidebar.
The sidebar is 272px wide (252px in compact windows), with full-width conversation rows and no
nested card borders or repeated conversation icons. Only the current conversation has a persistent
selection fill. Agent actions appear on hover or keyboard focus; touch pointers keep them visible.
Agent rows expand or collapse with a click, Enter, or Space; new-conversation and agent menus remain
separate buttons. Expanding a group keeps the current conversation; its menu also offers Open agent.
Collapsed conversations leave the focus order, search reveals matching groups,
and selecting a conversation elsewhere reopens its group. Calm and Reduce Motion skip the fold
animation. Existing task previews, drafts, statuses, and conversation actions remain available.

In an empty message box, ↑ brings back the messages already sent in that conversation, newest
first, and ↓ moves forward again; Esc or clearing the box returns to the empty draft. Inside a
recalled message, ↑ and ↓ move between its lines until the caret reaches the first or last line, and
editing it makes it an ordinary draft. A typed draft is never replaced.

Opening a launcher result selects its exact existing conversation, closes Settings or Activity, and
uses a short exit/arrival transition. Calm and Reduce Motion skip this transition. Failed handoffs
restore the launcher; they do not discard the request or start another turn.

## The room rule

- **The sidebar** (`--shell-*` tokens) keeps main's navigation: soft grey (`#f4f4f5`) in light
  appearance and graphite (`#0e0f11`) in dark, with neutral selections and the system display
  face for navigation. The identity hue appears in the agent's avatar, never as a wash.
- **The room** (`.workspace`, `--bg-*` tokens) is the neutral space of the agent whose thread is
  open (or the selected agent when no thread is). It carries `data-identity` so `--agent-color`
  resolves to that agent's hue (`--hue-0..3`: slate blue, coral, sky, green — chosen in the agent
  dialog's Color swatches; a new agent's default follows its name via `agentIdentity`). Each slot
  also selects an abstract living form. The persisted value remains `hue`. The identity appears in
  the sidebar avatar, room header, conversation, presence, streaming caret, empty state, and
  approvals. Never use it to make the person's consequential controls look pre-approved.
- **Color**: surfaces stay neutral. Light: canvas `#fcfcfd`, raised `#ffffff`, sidebar `#f4f4f5`,
  text `#18181b` / `#4b4b53` / `#5f5f68`. Dark: canvas `#131416`, raised `#1a1b1e`, sidebar
  `#0e0f11`, text `#ededef` / `#b4b4bc` / `#9a9aa3`. The one brand accent is emerald (`#07855b`
  light, `#34d399` dark) and is reserved for primary actions, focus, selection, links, and live
  status. Success, warning, and danger have their own semantic tokens. Every text token keeps
  4.5:1 on every surface it sits on; `uiPolicy.test.ts` checks this.
- **Controls**: primary buttons are a solid accent fill with a hairline darker edge and a faint top
  highlight; secondary buttons are a white (graphite in dark) control with a hairline border.
  `ActionButton` is the shared native button for the composer, launcher, and phone; there is no
  WebGL button effect. The composer is a raised surface with a hairline border and an accent focus
  ring.
- **Type**: `--font-display` / `--font-brand` use bundled Bricolage Grotesque
  for names, headings, the wordmark, metrics, and dialog titles, with `--tracking-display`
  (-0.022em); navigation overrides the display face with SF Pro Display. `--font-sans` (SF Pro Text)
  carries body copy, controls, and labels.
  The variable Latin font is bundled under SIL OFL 1.1, with its license included in the generated
  license corpus. `src/renderer/uiPolicy.test.ts` checks the display face is on names and
  headings and off controls and body copy, that every hue slot is defined, and that the room maps
  every identity slot to a hue.
- **Icons**: Phosphor only, regular weight. `fill` is kept for media and status glyphs (stop, play,
  record, status dots) and `bold` only for small checks, send arrows, and the more menu. Sizes
  follow 14 / 16 / 18 / 20 / 22 / 24px. The Sia logo is one asset (`SiaLogo`), always shown as its
  own near-black app-icon tile, never inside another tile.

## Comfortable reading

On 2026-10-14 Lawrence reported that the layout and type felt too small, dense, and not
user-friendly. Sia is for everyday consumers, so comfort wins over density:

- Ordinary interface text is `--text-sm` (14px); body copy and replies are `--text-md` or larger.
  Nothing a person needs to read is below `--text-2xs` (11.5px), and that size is only for
  secondary metadata such as timestamps and shortcut hints.
- No small letter-spaced all-caps labels. Section and status labels use sentence case at readable
  sizes; hierarchy comes from size, weight, and spacing rather than tracking.
- Interactive controls are at least `--target-min` (36px) tall; list and settings rows at least
  `--row-min` (44px). Icons use `--icon-sm`/`--icon-md`/`--icon-lg` (16/18/22px).
- Give content room: generous padding between groups, comfortable line height (≥1.45 for body
  copy), and content columns that use the window rather than a narrow strip in a large empty pane.
- Everything must still fit at the supported 960×640 window and at the Larger text size.
- The same applies to the phone remote: thumb-sized targets (at least 44px), readable body text
  (at least 16px, which also stops iOS zooming fields), and no dense metadata rows.
- Wording is for people who have never used a developer tool: plain words on every main path,
  short action-first labels, and technical detail (model IDs, API terms, harness names) behind a
  Details or Advanced disclosure. Keep a precise macOS permission name only where people will see
  it in System Settings, with a plain explanation beside it.

## Motion language

On 2026-10-14 Lawrence asked for a dedicated UI/UX and animation pass across every workflow because
the product still felt stale. The motion dial moves from 3 to 6. Motion should make Sia feel alive and
responsive, never slower: navigation and input stay immediate, and animation explains cause and
effect (what appeared, what moved, what finished, what needs attention).

- Arrivals use `--ease-spring` or `--ease-out-soft` over `--motion-standard`..`--motion-emphasis`, travel
  at most `--motion-rise`, and may start from `--motion-pop-scale`. Exits use `--ease-exit` over
  `--motion-exit` and are always quicker than the matching arrival.
- Lists and groups that appear together stagger by `--motion-stagger`, capped at eight items.
- Live state (working, waiting, approval needed, reply ready, voice) gets a distinct, recognisable
  transition; streamed tokens still do not animate per token.
- Hover and press feedback stays at `--motion-fast`; pressed controls may settle by `--motion-nudge`.
- Animate only `transform`, `opacity`, `filter`, `clip-path`, and colour. Never animate layout
  properties on large surfaces, and never block input on an animation.
- Reduced Motion collapses durations, travel, scale, and stagger through the tokens. Calm keeps short
  fades but removes travel, springs, and stagger. Safety, consent, and legal surfaces stay sober:
  they may fade and settle, but do not bounce or celebrate.
- Status signals have one gesture each, wherever they appear (dock, Scotty, launcher, phone): finished
  or unread pops once, working breathes or sends a slow ring, waiting for the person pops then
  breathes, and a problem only fades and settles. Status text is keyed by status so a change lands
  visibly, while streamed progress inside one status does not replay it.
- Completion moments (Reply ready, setup's "You're all set") play only on the live state change,
  never when a finished thread or screen is reopened, and never loop. Setup permission rows settle
  only when they turn ready while shown.
- Permission and consent surfaces (approval cards, the Access panel, alert dialogs) arrive with
  `--ease-out-soft`, never `--ease-spring`; an approval card may add one brief wash of the agent hue.
  The phone remote never approves; its approval note stays a sober surface pointing to the Mac.
- The room's hue (`--agent-color`) is a registered colour, so switching agents cross-fades the room
  over `--motion-emphasis` instead of snapping.
- Tab rails share one highlight that glides by animating `clip-path` only
  (`settings/useNavIndicator.ts`); never animate a tab's width or position.
- Press depth, press stretch, and check rotation derive from `--motion-pop-scale` and
  `--motion-nudge`, so Calm and Reduced Motion keep the colour change and drop the movement.
  Danger and disabled buttons never lift or bounce.
- One-shot arrivals on hoverable controls use `animation-fill-mode: backwards`, and elements that
  already run their own animation enter by transition plus `@starting-style`, so an entrance never
  holds `transform` against hover or overrides an ambient loop.
- Larger blocks that arrive together (welcome sections) may stagger by twice `--motion-stagger`.
- Dismissal stays instant for dialogs, menus, and the quick switcher: hidden windows can pause
  `animationend` indefinitely, and the renderer suite requires dismissed surfaces to close without
  waiting. The Inspector and Scotty/launcher exits run on timers instead.
- Windows that are shown and hidden rather than remounted (Scotty's tray, the ⌘E launcher) replay
  their arrival on show with `floatingMotion.summon` and play `dismissMotion` before a self-initiated
  hide; hiding because focus left stays instant. Always-on surfaces play one beat per state change
  and then rest; only the working indicator loops. Every renderer window imports `tokens.css`
  through `main.tsx`.
- Live microphone state is a steady tint plus a radiating ring; the composer's wave follows the
  voice level while listening and shows a travelling pulse while transcribing. Reduced Motion keeps
  the ring as a static outline.
- The startup curtain breathes after it settles and lifts away on ready within the 240 ms budget.
- A working agent shows its own form, not a bare spinner: on the live status line it breathes over
  `--motion-breathe` and sends a ring every `--motion-ring`; while a step row or the reply caret
  already moves, the ring stops and the form only breathes. The step in progress (desktop and phone)
  and the live label carry one light sweep per `--motion-sweep`. A watched run settles into its
  "Worked for" summary with one check pop; reopened runs stay still.
- Streamed replies reveal per block, never per token: each new paragraph, list item, or code block
  fades up `--motion-reveal` once. A reply's tools arrive in a short stagger only on the live finish.
- Loading areas use the shared `primitives.skeleton` (a still block with a soft light sweep that
  waits a beat before showing) instead of a lone spinner or a wrong placeholder state.
- Menus grow from the corner Radix reports and unfold their items in a capped stagger. Focus rings
  tighten onto their control over `--motion-standard` at zero specificity, so a control's own
  animation always wins. The message field eases to its new height; the send arrow lifts away on
  each send.
- The aurora drifts while the welcome or conversation scene is focused. In dark
  mode the dither grid stays quieter so it never reads as noise behind text.

## Locked dials

Variance 5, motion 6, density 3. One neutral sidebar, one neutral room surface system, four
agent forms with one job, one emerald accent for controls and status, Phosphor icons, and Bricolage headings with
system body type, with a four-step radius rule: `--radius-tight` 6px for chips/menus, `--radius-control`
8px for controls and rows, `--radius-surface` 12px for cards and the few contained surfaces that
need an edge, `--radius-dialog` 16px for floating dialogs and the composer, `--radius-round` only for true circles, and a
square workspace edge (`--radius-room: 0`). Type uses the `--text-*` / `--display-*` scale and the
`--weight-*` weights; do not introduce literal sizes, weights, or radii in the style modules.

Elevation is semantic rather than decorative: rows remain flat, fields use the quiet
`--bg-field` inset surface, raised controls use `--shadow-control`, and only the composer,
popovers, inspectors, and dialogs may use floating shadows. A border is not a default container;
use whitespace and a hairline divider before adding another box.

## Merge checklist

- One clear primary action per surface; no duplicate controls or provider-specific layout fork.
- Use my Mac onboarding has one setup button that walks every required macOS permission; there
  is no separate opt-in for everyday apps.
- Fn practice after setup reflects actual recorder states and is always skippable.
- Conversation remains dominant. Tool activity is compact and progressively disclosed.
- Settings use one horizontal section rail that wraps when space is tight, keeping every category
  visible. The content pane scrolls independently; avoid a second sidebar inside the application shell.
  Settings rows adapt to the pane width, including zoom, and long descriptions retain vertical padding.
  At very large text sizes the rail has a visible vertical scroll affordance so it cannot consume
  the entire window.
- Active agent, provider/model, workspace, local/cloud status, and research-capture state are always understandable — the room's hue and the topbar dot must agree with the sidebar.
- Loading, empty, error, offline, queued, denied, cancelled, and recovery states exist.
- Every consequential approval names the operation, target, data leaving the Mac, focus behavior, and reversibility, under the requesting agent's hue band.
- Full keyboard operation, visible focus, correct labels, minimum 36px targets (`--target-min`), and WCAG 2.2 AA contrast (`uiPolicy.test.ts` computes tertiary-text and strong-border contrast for both appearances).
- Light, dark, high-contrast, increased-text, and reduced-motion modes are verified.
- Interactive rows and buttons give quiet hover feedback with `background-color`/`color`
  transitions at `--motion-fast`. Feedback is 140ms, standard motion 190ms, and surfaces 240ms.
  Empty states and avatars do not idle-loop; motion is reserved for arrivals, live presence,
  progress, state transitions, and overlays (see Motion language). Streamed tokens do not animate.
- No generic AI gradients, glass, decorative status dots, card grids, nested cards, mascot faces,
  canvas, GenUI, or visualization affordance. A restrained monochrome grain and broad ambient
  color mixing are permitted when they make the room feel tactile without reducing contrast.
- No `!important`, and no unexplained design token. New identity and shell work belongs in
  `companion.module.css`. Each component keeps its styles in a `.module.css` beside it; buttons,
  dialogs, the app frame, and small shared pieces live in `renderer/styles/`. New component
  surfaces must not exceed 400 lines.
- The development audit matrix (`#audit` in DEV) and the real Electron E2E both pass before visual baselines are accepted.

## Surface checks

`tests/e2e/ui-surfaces.spec.ts` records onboarding, every settings category (including the isolated
admin archive fixture), the assistant library, conversation tools, Access tabs, feedback, Activity,
and quick navigation. It checks category visibility, pane overflow, dialog bounds, and spacing at
1220×780, 960×640, 125% zoom, and usable settings space at 200% zoom. Screenshots are written to the Playwright test-results directory.
The existing accessibility test also covers forced colors and 200% zoom. These use disposable fake-service
profiles; no provider turn or personal account is involved. Phone layouts have a separate gate:
`pnpm --filter @sia/desktop test:remote`, covering compact phones, landscape, and dark appearance.

## New-user setup

| Before                                                      | After                                                                                             | Why                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Install/update then a separate sign-in action after restart | Connect ChatGPT resumes browser sign-in once after restart, with visible stage and retry feedback | No terminal or second setup action                   |
| Disabled Set up Sia button while no model is ready          | Resolve AI access first, then show Set up Sia                                                     | One actionable next step                             |
| Core permission statuses hidden with optional apps          | Core checklist always visible; everyday apps expandable                                           | See missing access and recovery guidance immediately |
| Permission setup ends without a first-use moment            | Skippable hold–speak–release Fn lesson with an actual transcript                                  | Learn the gesture by doing it                        |

One permission action requests only missing access. macOS owns approval dialogs; returning to Sia
checks status without repeating prompts. Interrupted or denied access does not erase allowed grants.

### Component references

These are design references, not additional runtime dependencies. Match Sia's existing fonts,
colors, native button semantics, focus styles, Calm setting, and Reduce Motion. The Fn lesson and
setup transitions are implemented with local CSS and the typed recorder state; no shader or motion
library is needed for them. Spotlight Card and Gradient Text are adapted locally with provenance
in `THIRD_PARTY_NOTICES.md`; the composer keeps Sia's native action buttons.
Star Border remains an optional reference, not an additional screen-border effect.

| Component                                                                        | Where                   | Adaptation                                                                                                         |
| -------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [21st Animated Keyboard](https://21st.dev/@badtzx0/components/animated-keyboard) | Fn lesson               | Focus on the Fn key and two neighboring keys; fill it only while the real recorder listens.                        |
| [React Bits Stepper](https://reactbits.dev/components/stepper)                   | Setup header            | Three quiet stages: Welcome, Mac access, Try Fn. Follow saved progress without artificial delays.                  |
| [React Bits Animated Content](https://reactbits.dev/animations/animated-content) | Setup transitions       | Short fade and 8px arrival when the stage changes. Keep controls usable immediately.                               |
| [React Bits Spotlight Card](https://reactbits.dev/components/spotlight-card)     | First-task suggestions  | A restrained sage hover/focus treatment; each card opens an editable draft.                                        |
| [React Bits Gradient Text](https://reactbits.dev/text-animations/gradient-text)  | Welcome headline        | One slow mint/blue sweep, keeping body text still and readable; pauses when hidden.                                |
| [21st SendButton](https://agent-elements.21st.dev/docs/send-button)              | Desktop/phone composer  | Reference only: idle, send, and stop states stay distinct on the native action buttons; guard repeat clicks.       |
| [React Bits Star Border](https://reactbits.dev/animations/star-border)           | Active voice affordance | Consider a very faint highlight on the Fn practice key only; avoid more perpetual borders or competing highlights. |

[Wispr's official setup guide](https://docs.wisprflow.ai/articles/3152211871-setup-guide) supports
the learn-by-doing pattern: skip existing grants, press/speak/release to practice, permit skipping,
and resume interrupted setup. Its documented flow is the reference for the sequence; Sia's key-fill
visual is a local design, not copied proprietary artwork.
