# UI quality gate

Sia's visual idea is simple and specific: **an agent is a room.** A deep green shell holds your
agents; the agent you select opens as a room set into that shell, and the agent's own hue tints
everything that belongs to it. Sia is a calm Mac productivity utility with a friendly, physical
sense of place — not an AI dashboard and not a chat template.

## The room rule

- **The shell** (`--shell-*` tokens) is the deep green sidebar: agents, threads, Activity /
  Archived / Settings. It is the same green in light and dark appearance. The selected agent's
  group takes the room surface (`--bg-canvas`) and joins the room through the rounded corner.
- **The room** (`.workspace`, `--bg-*` tokens) is the space of the agent whose thread is open
  (or the selected agent when no thread is). It carries `data-identity` so `--agent-color`
  resolves to that agent's hue (`--hue-0..3`: saffron, coral, sky, mint — chosen in the agent
  dialog's Color swatches; a new agent's default follows its name via `agentIdentity`). The hue appears only where the agent is present or acting: its avatar and initials,
  its thread dot, the topbar dot, the presence chip in the composer, the streaming caret, the
  empty-state badge, and the header band of its approval requests. Never on the person's controls.
- **The person's controls** are ink: `--bg-accent` pill buttons, `--ink-line` (1.5px) outlines on
  the composer, dialogs, secondary buttons and approval cards. Links and success are the shell's
  green (`--text-link`).
- **Type**: Bricolage Grotesque (`--font-display`, bundled OFL variable latin subset) for names,
  headings, the wordmark, metrics, and dialog titles — with `font-variation-settings: 'opsz'` set
  per size. The system sans (`--font-sans`) carries body copy, controls, labels and nav.
  `src/renderer/uiPolicy.test.ts` checks the face is on names/headings and off controls/body copy,
  that every hue slot is defined, and that the room maps every identity slot to a hue.

## Locked dials

Variance 4, motion 3, density 4. One green shell, one neutral room surface system, four agent
hues with one job, ink for controls, Phosphor icons, system sans for the interface, one bundled
display face, and a four-step radius rule: `--radius-tight` 6px for chips/menus, `--radius-control`
10px for controls and rows, `--radius-surface` 14px for cards and the selected agent group,
`--radius-dialog` 18px for dialogs and the composer, `--radius-round` for pills and avatars, and
`--radius-room` for the room's corner. Type uses the `--text-*` / `--display-*` scale and the
`--weight-*` weights; do not introduce literal sizes, weights, or radii in `ui.module.css`.

## Merge checklist

- One clear primary action per surface; no duplicate controls or provider-specific layout fork.
- Conversation remains dominant. Tool activity is compact and progressively disclosed.
- Active agent, provider/model, workspace, local/cloud status, and research-capture state are always understandable — the room's hue and the topbar dot must agree with the sidebar.
- Loading, empty, error, offline, queued, denied, cancelled, and recovery states exist.
- Every consequential approval names the operation, target, data leaving the Mac, focus behavior, and reversibility, under the requesting agent's hue band.
- Full keyboard operation, visible focus, correct labels, minimum 32px targets, and WCAG 2.2 AA contrast (`uiPolicy.test.ts` computes tertiary-text and strong-border contrast for both appearances).
- Light, dark, high-contrast, increased-text, and reduced-motion modes are verified.
- Interactive rows and buttons give hover feedback with `background-color`/`color` transitions at `--motion-fast`. Transitions and animations use only transform, opacity, and color: 140ms feedback, 210ms expansion, 280ms drawer/dialog. Streamed tokens do not animate; the presence chip and empty-state badge are the only ambient motion.
- No gradients, glass, decorative status dots, card grids, nested cards, oversized headings outside the display scale, custom SVG icons, canvas, GenUI, or visualization affordance.
- No `!important`, and no unexplained design token. The current known large files (`Composer.tsx`, `Conversation.tsx`, `Sidebar.tsx`, `Inspector.tsx`, `AppsSettings.tsx`, `App.tsx`) may not grow, and new surfaces must not exceed 400 lines.
- The development audit matrix (`#audit` in DEV) and the real Electron E2E both pass before visual baselines are accepted.
