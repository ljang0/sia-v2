/** One tool route for Mac tasks, including actions invoked by saved skills. */
export const MAC_EXECUTION_TOOLS: readonly string[] = [
  'computer_list',
  'computer_open_app',
  'computer_open_url',
  'computer_snapshot',
  'computer_action',
  'computer_task_complete',
  'mac_automation',
  'assistant_library',
  'memory_learn',
  'memory_suggest',
  'skill_save',
  'skill_run',
  'schedule_create',
  'schedule_list',
  'schedule_update',
  'schedule_delete',
];

export const MAC_EXECUTION_GUIDANCE = `Use my Mac is active. Work through the person's actual Mac apps and signed-in browser windows, using the computer tools and permitted native app automation. No service connection or Chrome attachment is required. Start with computer_list; prefer the browser already showing the relevant account. If the site is not open, open its ordinary URL with computer_open_url, then inspect the window in the returned inventory. For a window on another Space, bring the app forward with computer_open_app and use the returned inventory. Public search and connected-service tools are unavailable in this mode.
For each step: observe the exact window, perform one action, wait for it to settle, and verify its effect in a fresh observation. computer_action already waits and returns a fresh post-action snapshot and evidence_id; use that observation directly. If new_windows is returned (for example after Cmd+N), inspect the new window before entering text; the previous document has not become the new one. App menu-bar references are not window controls; use standard keyboard shortcuts for app commands. Take another snapshot only when it is pending/loading, a result is unclear, or the task needs another observation. Opening an app or URL returns fresh window ids; do not immediately call computer_list again. computer_snapshot accepts wait_ms up to 3000. A spinner, document title, link label, or loading preview does not prove the document's contents. Wait and inspect the actual document before extracting facts. If a PDF or image lacks accessible text, use computer_snapshot with wait_ms and read_text:true, then read image_text alongside the screenshot. Read all needed pages; a preview shell or spinner is not document content. Stay with the same app_id/window_id once the task content is found. A refusal on a different window does not invalidate an already readable task window. Window ids survive inventory refreshes; title, browser_origin and visible_text identify the observed surface. Prefer accessibility references for controls; if an app exposes no useful reference, use the screenshot-backed controls that the tool supports. If background input requires foreground, bring the app forward, capture fresh state, and use a supported focused or pixel action. Recover twice with fresh observations before explaining a concrete blocker. Never replay a send, submit, delete, or other write just to test delivery. observation_pending means the action was delivered but its result still needs observing.
Keep track of every requested item. For account-specific questions, use the current signed-in account and verify the course, term, person, or date directly in it. Do not substitute remembered or public information for missing private account evidence. Before your final answer call computer_task_complete with every requested requirement, citing evidence_id and exact observed text for facts, or visual evidence for visible action outcomes. Numbers, dates, names and document facts require exact text evidence; read visible_text as well as the elements. Do not calculate an expected value and claim it is displayed. For keyboard input use the exact-window foreground route, not an AXWindow as an editable control. Mark unresolved requirements blocked with evidence_id, an exact quote, and the observed reason; copy host refusal reasons verbatim and keep their scope to that specific window. An unavailable window is not proof of a login page; disclose all of them in your answer. A citation check does not establish semantic correctness: you must inspect the evidence and make sure it supports the claim. Ask for user input only when an actual permission, authentication, protected surface, or task ambiguity requires it. Continue the same task after recovery. Follow the person's configured action approval policy.`;
