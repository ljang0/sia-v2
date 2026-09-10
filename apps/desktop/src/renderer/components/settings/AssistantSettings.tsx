import { MemorySuggestions } from './MemorySuggestions';
import { ExecutableSkills } from './ExecutableSkills';
import { useEffect, useState } from 'react';
import type { RendererApi } from '../../types';
import type {
  AssistantLibraryCommand,
  AssistantLibraryView,
  AssistantMemory,
  AssistantWorkflow,
} from '../../../shared/assistant-library';
import styles from './AssistantSettings.module.css';

const empty: AssistantLibraryView = {
  memories: [],
  workflows: [],
  context: false,
};
export function AssistantSettings({
  agents,
  accessMode = 'connected',
  api,
  onRun,
}: {
  agents: readonly { id: string; name: string }[];
  accessMode?: 'mac' | 'connected';
  api: Pick<RendererApi, 'assistantLibrary'>;
  onRun(threadId: string): void;
}) {
  const [section, setSection] = useState('General');
  const [library, setLibrary] = useState(empty);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [memory, setMemory] = useState<Partial<AssistantMemory>>();
  const [workflow, setWorkflow] = useState<Partial<AssistantWorkflow>>();
  const [runner, setRunner] = useState<AssistantWorkflow>();
  const [parameterText, setParameterText] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    api
      .assistantLibrary({ operation: 'list' })
      .then((view) => {
        if (active) {
          setLibrary(view);
          setLoaded(true);
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [api]);
  async function command(input: AssistantLibraryCommand): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError('');
    const previous = library;
    if (input.operation === 'preferences') setLibrary({ ...library, context: input.context });
    if (input.operation === 'backgroundReview')
      setLibrary({
        ...library,
        reviewAgents: [
          ...(library.reviewAgents ?? []).filter((id) => id !== input.agentId),
          ...(input.enabled ? [input.agentId] : []),
        ],
      });
    if (input.operation === 'learning')
      setLibrary({
        ...library,
        learningAgents: [
          ...(library.learningAgents ?? []).filter((id) => id !== input.agentId),
          ...(input.enabled ? [input.agentId] : []),
        ],
      });
    try {
      const view = await api.assistantLibrary(input);
      setLibrary({
        ...view,
        ...(library.launcherRegistered !== undefined
          ? { launcherRegistered: library.launcherRegistered }
          : {}),
      });
      if (view.threadId) onRun(view.threadId);
      return true;
    } catch (cause) {
      if (
        input.operation === 'preferences' ||
        input.operation === 'learning' ||
        input.operation === 'backgroundReview'
      )
        setLibrary(previous);
      setError(cause instanceof Error ? cause.message : 'Could not update the library.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.page}>
      <header>
        <p className={styles.eyebrow}>YOUR ASSISTANT</p>
        <h2>A little more like you</h2>
        <p>
          Keep useful preferences, save repeatable work, and stay with Sia while you use your
          Mac.
        </p>
      </header>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p className={styles.note}>
        Press Cmd + E anywhere to ask Sia.{' '}
        {library.launcherRegistered === false
          ? 'The shortcut is unavailable, possibly because another app uses it. Open Ask Sia from the Sia menu.'
          : 'Choose an agent, type your request, and press Enter.'}
      </p>
      <fieldset disabled={busy || !loaded} className={styles.controls}>
        <label>
          Agent
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setMemory(undefined);
              setWorkflow(undefined);
              setRunner(undefined);
            }}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        {!agentId && <p>Create an agent to start a personal library.</p>}
        <nav className={styles.sections} aria-label="Assistant sections">
          {['General', 'Memory', 'Workflows', 'Skills', 'Suggestions'].map((name) => {
            const entries =
              name === 'Memory'
                ? library.memories
                : name === 'Workflows'
                  ? library.workflows
                  : name === 'Skills'
                    ? library.skills
                    : name === 'Suggestions'
                      ? library.suggestions
                      : undefined;
            const count = entries?.filter((entry) => entry.agentId === agentId).length;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={section === name}
                onClick={() => setSection(name)}
              >
                {name}
                {count !== undefined && <span>{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className={styles.section} hidden={section !== 'General'}>
          <label className={styles.toggle}>
            <span>
              <strong>Use context when I hold Fn</strong>
              <small>
                {accessMode === 'mac'
                  ? 'Included in Use my Mac: Sia reads the foreground app and browser when you hold Fn, just like Notch.'
                  : 'Share the active app, window outline, title, and selected text with your agent. Browser content still needs a Chrome connection. Protected fields are excluded.'}
              </small>
            </span>
            <input
              type="checkbox"
              checked={accessMode === 'mac' || library.context}
              disabled={accessMode === 'mac'}
              onChange={(e) =>
                void command({
                  operation: 'preferences',
                  context: e.target.checked,
                })
              }
            />
          </label>
          <p className={styles.note}>
            Hold Fn to dictate and run a task in the background. The screen glow shows when the
            microphone is recording. Cmd + E opens the command box when you want it.
          </p>
        </div>
        <div className={styles.section} hidden={section !== 'Memory'}>
          <div className={styles.heading}>
            <div>
              <h3>Memory</h3>
              <p>
                Saved preferences and learned lessons are used for future requests. Stored
                encrypted on this Mac.
              </p>
            </div>
            <button
              disabled={!agentId}
              onClick={() => setMemory({ title: '', text: '', enabled: true })}
            >
              Add memory
            </button>
          </div>
          <label className={styles.toggle}>
            <span>
              <strong>Learn from completed tasks</strong>
              <small>
                Keep an operational journal and let this agent suggest reusable lessons. Sia
                consolidates new lessons while idle, at most every six hours. No extra model
                turn or background screen recording. You can edit or delete everything below.
              </small>
            </span>
            <input
              type="checkbox"
              disabled={!agentId}
              checked={library.learningAgents?.includes(agentId) ?? false}
              onChange={(e) =>
                void command({ operation: 'learning', agentId, enabled: e.target.checked })
              }
            />
          </label>
          <details>
            <summary>
              Task journal (
              {library.journal?.filter((entry) => entry.agentId === agentId).length ?? 0})
            </summary>
            <div className={styles.actions}>
              <button
                disabled={!library.learningAgents?.includes(agentId)}
                onClick={() => void command({ operation: 'consolidate', agentId })}
              >
                Consolidate now
              </button>
              <button
                disabled={!agentId}
                onClick={() => void command({ operation: 'clearJournal', agentId })}
              >
                Clear journal
              </button>
            </div>
            <small>
              Clearing the journal also discards pending lessons. Existing memory stays until
              you delete it.
            </small>
            {(library.journal ?? [])
              .filter((entry) => entry.agentId === agentId)
              .slice(-50)
              .reverse()
              .map((entry) => (
                <article className={styles.card} key={entry.id}>
                  <strong>{entry.title}</strong>
                  <p>{entry.text}</p>
                  <small>
                    {new Date(entry.timestamp).toLocaleString()} · {entry.kind}
                    {entry.consolidated ? ' · Added to memory' : ''}
                  </small>
                </article>
              ))}
          </details>
          {library.memories
            .filter((entry) => entry.agentId === agentId)
            .map((entry) => (
              <article key={entry.id} className={styles.card}>
                <div>
                  <strong>{entry.title}</strong>
                  <p>{entry.text}</p>
                  <small>
                    {entry.learned ? 'Learned lesson · ' : ''}
                    {entry.enabled ? 'Used for new requests' : 'Paused'}
                  </small>
                </div>
                <div className={styles.actions}>
                  <button onClick={() => setMemory(entry)}>Edit</button>
                  <button
                    onClick={() =>
                      void command({
                        operation: 'saveMemory',
                        entry: { ...entry, enabled: !entry.enabled },
                      })
                    }
                  >
                    {entry.enabled ? 'Pause' : 'Enable'}
                  </button>
                  <button
                    onClick={() => void command({ operation: 'deleteMemory', id: entry.id })}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          {!library.memories.some((entry) => entry.agentId === agentId) && (
            <p className={styles.empty}>
              “Keep my updates brief” or “Use British spelling.” Save a preference to make it
              available across conversations.
            </p>
          )}
          {memory && (
            <form
              className={styles.editor}
              onSubmit={(e) => {
                e.preventDefault();
                void command({
                  operation: 'saveMemory',
                  entry: {
                    ...(memory.id ? { id: memory.id } : {}),
                    agentId,
                    ...(memory.learned ? { learned: true } : {}),
                    title: memory.title ?? '',
                    text: memory.text ?? '',
                    enabled: memory.enabled ?? true,
                  },
                }).then((ok) => {
                  if (ok) setMemory(undefined);
                });
              }}
            >
              <h4>{memory.id ? 'Edit memory' : 'New memory'}</h4>
              <label>
                Title
                <input
                  required
                  maxLength={100}
                  value={memory.title ?? ''}
                  onChange={(e) => setMemory({ ...memory, title: e.target.value })}
                />
              </label>
              <label>
                What should Sia remember?
                <textarea
                  required
                  maxLength={4000}
                  aria-label="What should Sia remember?"
                  value={memory.text ?? ''}
                  onChange={(e) => setMemory({ ...memory, text: e.target.value })}
                />
              </label>
              <div className={styles.actions}>
                <button type="submit">Save memory</button>
                <button type="button" onClick={() => setMemory(undefined)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
        <div className={styles.section} hidden={section !== 'Workflows'}>
          <div className={styles.heading}>
            <div>
              <h3>Workflows</h3>
              <p>
                Reusable steps with a check after each action. Each run uses your agent and
                current permissions.
              </p>
            </div>
            <button
              disabled={!agentId}
              onClick={() => {
                setParameterText('');
                setWorkflow({
                  title: '',
                  parameters: [],
                  steps: [{ instruction: '', expected: '' }],
                });
              }}
            >
              New workflow
            </button>
          </div>
          {!library.workflows.some((entry) => entry.agentId === agentId) && (
            <div className={styles.empty}>
              <p>Start with a morning briefing, or write your own routine.</p>
              <button
                disabled={!agentId}
                onClick={() => {
                  setParameterText('focus');
                  setWorkflow({
                    title: 'Morning briefing',
                    parameters: ['focus'],
                    steps: [
                      {
                        instruction:
                          'Find recent inbox messages related to {{focus}} using a connected mail account or attached Gmail tab.',
                        expected: 'Relevant message subjects and dates are available.',
                      },
                      {
                        instruction:
                          'Summarize priorities and suggest next actions. Prepare drafts if useful; ask before sending.',
                        expected: 'A concise briefing with links to the original messages.',
                      },
                    ],
                  });
                }}
              >
                Use morning briefing template
              </button>
            </div>
          )}
          {library.workflows
            .filter((entry) => entry.agentId === agentId)
            .map((entry) => (
              <article className={styles.card} key={entry.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <p>
                    {entry.steps.length} steps · {entry.parameters.length} inputs
                  </p>
                </div>
                <div className={styles.actions}>
                  <button
                    onClick={() => {
                      setRunner(entry);
                      setValues({});
                    }}
                  >
                    Run
                  </button>
                  <button
                    onClick={() => {
                      setParameterText(entry.parameters.join(', '));
                      setWorkflow(entry);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void command({ operation: 'deleteWorkflow', id: entry.id })}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          {workflow && (
            <form
              className={styles.editor}
              onSubmit={(e) => {
                e.preventDefault();
                void command({
                  operation: 'saveWorkflow',
                  entry: {
                    ...(workflow.id ? { id: workflow.id } : {}),
                    agentId,
                    title: workflow.title ?? '',
                    parameters: parameterText
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                    steps: workflow.steps ?? [],
                  },
                }).then((ok) => {
                  if (ok) setWorkflow(undefined);
                });
              }}
            >
              <h4>{workflow.id ? 'Edit workflow' : 'New workflow'}</h4>
              <label>
                Name
                <input
                  required
                  maxLength={100}
                  value={workflow.title ?? ''}
                  onChange={(e) => setWorkflow({ ...workflow, title: e.target.value })}
                />
              </label>
              <label>
                Input names, separated by commas
                <input
                  placeholder="topic, recipient"
                  value={parameterText}
                  onChange={(e) => setParameterText(e.target.value)}
                />
              </label>
              <p>
                Refer to inputs as {'{{topic}}'} in a step. Use lowercase names with
                underscores.
              </p>
              {workflow.steps?.map((step, index) => (
                <div className={styles.step} key={index}>
                  <label>
                    Step {index + 1}
                    <textarea
                      aria-label={`Step ${index + 1}`}
                      required
                      maxLength={2000}
                      value={step.instruction}
                      onChange={(e) =>
                        setWorkflow({
                          ...workflow,
                          steps: (workflow.steps ?? []).map((item, i) =>
                            i === index ? { ...item, instruction: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    How will Sia know it worked?
                    <input
                      required
                      maxLength={500}
                      value={step.expected}
                      onChange={(e) =>
                        setWorkflow({
                          ...workflow,
                          steps: (workflow.steps ?? []).map((item, i) =>
                            i === index ? { ...item, expected: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={workflow.steps?.length === 1}
                    onClick={() =>
                      setWorkflow({
                        ...workflow,
                        steps: (workflow.steps ?? []).filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove step
                  </button>
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={(workflow.steps?.length ?? 0) >= 20}
                  onClick={() =>
                    setWorkflow({
                      ...workflow,
                      steps: [...(workflow.steps ?? []), { instruction: '', expected: '' }],
                    })
                  }
                >
                  Add step
                </button>
                <button type="submit">Save workflow</button>
                <button type="button" onClick={() => setWorkflow(undefined)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {runner && (
            <form
              className={styles.editor}
              onSubmit={(e) => {
                e.preventDefault();
                void command({ operation: 'run', id: runner.id, values });
              }}
            >
              <h4>Run {runner.title}</h4>
              {runner.parameters.map((parameter) => (
                <label key={parameter}>
                  {parameter}
                  <input
                    required
                    maxLength={2000}
                    value={values[parameter] ?? ''}
                    onChange={(e) => setValues({ ...values, [parameter]: e.target.value })}
                  />
                </label>
              ))}
              <ol>
                {runner.steps.map((step, index) => (
                  <li key={index}>
                    {step.instruction}
                    <small>Check: {step.expected}</small>
                  </li>
                ))}
              </ol>
              <div className={styles.actions}>
                <button type="submit">Start in a new conversation</button>
                <button type="button" onClick={() => setRunner(undefined)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
        <div className={styles.section} hidden={section !== 'Suggestions'}>
          <MemorySuggestions library={library} agentId={agentId} command={command} />
        </div>
        <div className={styles.section} hidden={section !== 'Skills'}>
          <ExecutableSkills
            key={agentId}
            library={library}
            agentId={agentId}
            command={command}
          />
        </div>
      </fieldset>
      <p className={styles.note}>
        Deleting memory removes it from future requests. Earlier conversations and information
        already sent to your provider are unchanged.
      </p>
    </section>
  );
}
