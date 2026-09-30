# UI quality gate

Sia's visual idea is simple and specific: **an agent is a living room for work.** A deep evergreen
dock holds distinct agent identities; the selected agent opens a clean mineral workspace beside it. The
product should feel expressive and companionable without becoming mascot-like. Safety, consent,
and legal surfaces remain sober. Sia is not an AI dashboard and not a chat template.

## Everyday use

The audience is an average consumer without technical knowledge. Make the next action obvious,
use familiar language, and choose sensible defaults. Keep onboarding to a short welcome and access
check; offer advanced settings and optional features when relevant. Avoid developer jargon,
mandatory tutorials, and long sequences of setup screens. Archived conversations remain available
in Activity and search, without a dedicated sidebar item.

## Appearance and navigation

Welcome screens greet people for their local time of day. Desktop suggestions follow the selected
agent's stated purpose, with everyday tasks as the default; choosing Codex or naming an agent
“Testing1” does not imply a coding workflow. Up to two recent conversations from the selected agent
appear below the suggestions, prioritizing work that needs attention. Opening one resumes its existing
conversation; it does not resend the original request. Phone greetings identify the paired agent and
retain the existing editable recent prompts.

The latest finished desktop reply and completed phone replies appear in a soft result card. The
original text, links, copy/read-aloud controls, and phone file downloads remain available. “Reply ready”
describes availability, not independent verification that every requested action succeeded. Running,
waiting, cancelled, and failed work do not receive the completed result treatment.

Switching desktop views or phone tabs uses a short fade and vertical ease on the existing surface.
Navigation is immediate, drafts retain their normal persistence, and incoming task updates do not
restart the transition. Reduce Motion and desktop Calm disable this movement.

Desktop startup begins with a dark evergreen wordmark, then eases the background into a soft shape
on the left beside “Loading Sia.” It follows the actual initial load: there is no minimum wait,
the ready workspace is immediately usable, and the decorative curtain clears in 240 ms or less.
It never replays for ordinary navigation, the Fn flow, or the launcher. Reduce Motion uses a still
loading state; Calm dismisses it immediately when the saved appearance becomes available. Startup
errors replace the animation with the existing reconnect action. For local visual review, the demo
supports `?startup-delay=2200#demo`; this delay is unavailable in production.

Desktop navigation and phone branding share the supplied mint-gradient **S** logo. The sidebar,
phone header, welcome screen, favicon, and iOS Home Screen icon all load the same bundled PNG.
The original image is preserved, and the Home Screen name remains **Sia**.
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
recency; ⌘1–9 and the ⌘K Pinned section follow the same order. Conversations saved before pinning
existed start unpinned, and a duplicate starts unpinned. Conversation titles
stay on one line with ellipsis, in evenly sized rows. Working, waiting, unread, and draft cues remain
visible; the full title, draft or latest reply, and update time live in the hover or keyboard-focus
preview. Previewing does not select the conversation or mark it read. Escape, scrolling, and leaving
dismiss the preview. The collapsed
rail retains new conversation, search, agents, new agent, Activity, and Settings.

Agent navigation uses flat groups and rotating disclosure chevrons in Sia’s evergreen palette.
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

- **The dock** (`--shell-*` tokens) is the evergreen agent navigation: agents, contextual threads,
  Activity / Settings. It is the same family in light and dark appearance. The selected agent
  remains on the shell with a quiet selected surface and a two-pixel identity marker; it never
  cuts a light card shape into navigation.
- **The room** (`.workspace`, `--bg-*` tokens) is the mineral-white, faint sage-neutral space of the agent whose thread is open
  (or the selected agent when no thread is). It carries `data-identity` so `--agent-color`
  resolves to that agent's muted hue (`--hue-0..3`: ochre, terracotta, slate blue, sage — chosen in the agent
  dialog's Color swatches; a new agent's default follows its name via `agentIdentity`). Each slot
  now also selects an abstract living form. The persisted value remains `hue`; this is a visual
  reinterpretation, not a data migration. The identity appears in the dock, room header,
  conversation, presence, streaming caret, empty state, and approvals. Never use it to make the
  person's consequential controls look pre-approved.
- **The person's controls** are ink: `--bg-accent` compact buttons and deliberate outlines on
  dialogs, secondary buttons, and approval cards. The composer uses a quieter one-pixel boundary
  with a green focus ring. Links and success are the shell's green (`--text-link`).
- **Type**: Bricolage Grotesque (`--font-display`, bundled OFL variable latin subset) for names,
  headings, the wordmark, metrics, and dialog titles — with `font-variation-settings: 'opsz'` set
  per size. The system sans (`--font-sans`) carries body copy, controls, labels and nav.
  `src/renderer/uiPolicy.test.ts` checks the face is on names/headings and off controls/body copy,
  that every hue slot is defined, and that the room maps every identity slot to a hue.

## Locked dials

Variance 5, motion 3, density 4. One deep-green dock, one mineral-neutral room surface system, four agent
forms with one job, ink for controls, Phosphor icons, system sans for the interface, one bundled
identity/display face, and a four-step radius rule: `--radius-tight` 6px for chips/menus, `--radius-control`
10px for controls and rows, `--radius-surface` 14px for the few contained surfaces that need an
edge, `--radius-dialog` 20px for floating dialogs, `--radius-round` only for true circles, and a
square workspace edge (`--radius-room: 0`). Type uses the `--text-*` / `--display-*` scale and the
`--weight-*` weights; do not introduce literal sizes, weights, or radii in `ui.module.css`.

Elevation is semantic rather than decorative: rows remain flat, fields use the quiet
`--bg-field` inset surface, raised controls use `--shadow-control`, and only the composer,
popovers, inspectors, and dialogs may use floating shadows. A border is not a default container;
use whitespace and a hairline divider before adding another box.

## Merge checklist

- One clear primary action per surface; no duplicate controls or provider-specific layout fork.
- Onboarding places the optional everyday-app access checkbox before the setup button. Keep it a
  compact, unboxed choice with approval guidance so it does not compete with the primary action.
- Conversation remains dominant. Tool activity is compact and progressively disclosed.
- Settings use one horizontal section rail that wraps when space is tight, keeping every category
  visible. The content pane scrolls independently; avoid a second sidebar inside the application shell.
  Settings rows adapt to the pane width, including zoom, and long descriptions retain vertical padding.
  At very large text sizes the rail has a visible vertical scroll affordance so it cannot consume
  the entire window.
- Active agent, provider/model, workspace, local/cloud status, and research-capture state are always understandable — the room's hue and the topbar dot must agree with the sidebar.
- Loading, empty, error, offline, queued, denied, cancelled, and recovery states exist.
- Every consequential approval names the operation, target, data leaving the Mac, focus behavior, and reversibility, under the requesting agent's hue band.
- Full keyboard operation, visible focus, correct labels, minimum 32px targets, and WCAG 2.2 AA contrast (`uiPolicy.test.ts` computes tertiary-text and strong-border contrast for both appearances).
- Light, dark, high-contrast, increased-text, and reduced-motion modes are verified.
- Interactive rows and buttons give quiet hover feedback with `background-color`/`color`
  transitions at `--motion-fast`. Feedback is 140ms, standard motion 190ms, and surfaces 240ms.
  Empty states and avatars do not rotate, bob, or breathe; motion is reserved for live presence,
  progress, state transitions, and overlays. Streamed tokens do not animate.
- No generic AI gradients, glass, decorative status dots, card grids, nested cards, mascot faces,
  canvas, GenUI, or visualization affordance. A restrained monochrome grain and broad ambient
  color mixing are permitted when they make the room feel tactile without reducing contrast.
- No `!important`, and no unexplained design token. New identity and shell work belongs in
  `companion.module.css`; feature-heavy legacy styles remain in `ui.module.css` until migrated.
  New component surfaces must not exceed 400 lines.
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

| Before                                                      | After                                                                                          | Why                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Install/update then a separate sign-in action after restart | Set up Codex resumes browser sign-in once after restart, with visible stage and retry feedback | No terminal or second setup action                   |
| Disabled Set up Sia button while no model is ready          | Resolve AI access first, then show Set up Sia                                                  | One actionable next step                             |
| Core permission statuses hidden with optional apps          | Core checklist always visible; everyday apps expandable                                        | See missing access and recovery guidance immediately |

One permission action requests only missing access. macOS owns approval dialogs; returning to Sia
checks status without repeating prompts. Interrupted or denied access does not erase allowed grants.
