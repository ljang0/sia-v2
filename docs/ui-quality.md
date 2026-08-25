# UI quality gate

Sia's visual idea is simple and specific: **an agent is a living room for work.** A deep evergreen
dock holds distinct agent identities; the selected agent opens a clean mineral workspace beside it. The
product should feel expressive and companionable without becoming mascot-like. Safety, consent,
and legal surfaces remain sober. Sia is not an AI dashboard and not a chat template.

## The room rule

- **The dock** (`--shell-*` tokens) is the evergreen agent navigation: agents, contextual threads,
  Activity /
  Archived / Settings. It is the same family in light and dark appearance. The selected agent
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
- Conversation remains dominant. Tool activity is compact and progressively disclosed.
- Settings use one horizontal, scrollable section rail; do not introduce a second sidebar inside
  the application shell.
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
