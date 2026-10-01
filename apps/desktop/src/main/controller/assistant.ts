import {
  type ActionExecutionResult,
  parseActionArguments,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import type { BridgeRequestMap, BridgeResultMap } from '../../shared/bridge.js';
import { skillExecutionMode, skillUnavailableReason } from '../../shared/skill-execution.js';
import { AssistantLibrary } from '../assistant/assistant-library.js';
import { runExecutableSkill } from '../assistant/executable-skills.js';
import {
  completedJournal,
  MEMORY_REVIEW_PROMPT,
  NATIVE_MEMORY_REVIEW_PROMPT,
} from '../assistant/memory-suggestions.js';
import { NativeSkills } from '../assistant/native-skills.js';
import { NotchVault } from '../notch/vault.js';
import type { ControllerContext } from './context.js';

/** The parts of the controller context AssistantFeatures uses. */
type AssistantFeaturesContext = Pick<
  ControllerContext,
  | 'commit'
  | 'computerAccess'
  | 'deps'
  | 'providers'
  | 'releaseAccessLocked'
  | 'requireAgent'
  | 'requireSignedInReleaseAccount'
  | 'requireThread'
  | 'shuttingDown'
  | 'speech'
  | 'state'
  | 'threads'
  | 'turns'
>;

/**
 * The assistant library (memories, skills, suggestions and reviews), Notch native learning,
 * launcher actions, and the idle memory-review timers.
 */
export class AssistantFeatures {
  readonly library: AssistantLibrary;
  memoryTimer: NodeJS.Timeout | undefined;
  notchTimer: NodeJS.Timeout | undefined;
  private nextNotchCheck = 0;
  private launcherRegistered = false;

  constructor(private readonly ctx: AssistantFeaturesContext) {
    this.library = new AssistantLibrary(ctx.deps.repository);
  }

  /**
   * Starts the idle passes that consolidate memories and start due memory reviews, and the
   * Notch native-learning check.
   */
  startIdleReviews(): void {
    this.memoryTimer = setInterval(() => {
      if (
        this.ctx.shuttingDown ||
        this.ctx.speech.assistantSuspended ||
        this.ctx.releaseAccessLocked() ||
        this.ctx.turns.running.size ||
        this.ctx.turns.queued.length ||
        this.ctx.speech.pushToTalk?.busy
      )
        return;
      try {
        const native = this.ctx.computerAccess.accessMode() === 'mac';
        for (const agentId of this.library.view().learningAgents ?? [])
          if (
            !native ||
            (this.ctx.computerAccess.backgroundControl() &&
              !this.library.view().nativeLearningAgents?.includes(agentId))
          )
            this.library.consolidate(agentId);
        for (const agentId of this.library.view().reviewAgents ?? []) {
          if (native && this.library.view().nativeLearningAgents?.includes(agentId)) continue;
          if (this.library.reviewDue(agentId)) {
            this.startMemoryReview(agentId, false);
            break;
          }
        }
      } catch {
        /* A storage failure is retried on the next idle pass. */
      }
    }, 60_000);
    this.memoryTimer.unref();
    // Notch's trigger poll / startup delay / periodic cadence. Consolidation is
    // an ordinary tracked Codex turn, so it cannot outlive Sia or lose cancellation.
    this.nextNotchCheck = Date.now() + 120_000;
    this.notchTimer = setInterval(() => {
      if (
        this.ctx.deps.fakeServices ||
        this.ctx.shuttingDown ||
        this.ctx.speech.assistantSuspended ||
        this.ctx.releaseAccessLocked() ||
        this.ctx.computerAccess.accessMode() !== 'mac' ||
        this.ctx.turns.running.size ||
        this.ctx.turns.queued.length ||
        this.ctx.speech.pushToTalk?.busy
      )
        return;
      const periodic = Date.now() >= this.nextNotchCheck;
      if (periodic) this.nextNotchCheck = Date.now() + 1800_000;
      let view: ReturnType<AssistantLibrary['view']>;
      try {
        view = this.library.view();
      } catch {
        return; // Storage closed or unavailable; the next tick checks again.
      }
      for (const agentId of view.nativeLearningAgents ?? []) {
        if (!view.learningAgents?.includes(agentId) || !view.reviewAgents?.includes(agentId))
          continue;
        try {
          const vault = this.notchVault(agentId);
          if ((periodic || vault.requested()) && vault.due()) {
            this.startMemoryReview(agentId, false);
            break;
          }
        } catch {
          /* A missing workspace or temporarily busy runtime can be checked next time. */
        }
      }
    }, 5000);
    this.notchTimer.unref();
  }

  setLauncherRegistered(registered: boolean): void {
    this.launcherRegistered = registered;
  }

  allowsReviewAction(threadId: string, name: string): boolean {
    if (!this.library.isReview(threadId)) return true;
    const agentId = this.ctx.requireThread(threadId).agentId;
    return (
      !!this.library.view().learningAgents?.includes(agentId) &&
      (this.library.isNotchReview(threadId)
        ? name === 'memory_vault'
        : ['assistant_library', 'memory_suggest'].includes(name))
    );
  }

  private nativeSkills(agentId: string): NativeSkills {
    const agent = this.ctx.requireAgent(agentId);
    return new NativeSkills(agent.workspace, agentId);
  }

  notchVault(agentId: string): NotchVault {
    return new NotchVault(this.ctx.requireAgent(agentId).workspace, agentId);
  }

  private libraryView() {
    const view = this.library.view();
    if (this.ctx.computerAccess.accessMode() !== 'mac') return view;
    if (!this.ctx.deps.fakeServices) {
      for (const agent of this.ctx.state.agents) this.notchVault(agent.id).initialize(view);
    }
    return {
      ...view,
      vaults: this.ctx.state.agents.map((agent) => ({
        agentId: agent.id,
        notes: this.notchVault(agent.id).list(),
      })),
      skills: [
        ...(view.skills ?? []),
        ...this.ctx.state.agents.flatMap((agent) => this.nativeSkills(agent.id).list()),
      ],
    };
  }

  private resolveSuggestion(id: string, revision: string, accept: boolean) {
    return this.library.resolveSuggestion(
      id,
      revision,
      accept,
      (agentId) => this.ctx.requireAgent(agentId),
      (entry) => {
        const skills = this.nativeSkills(entry.agentId);
        if (skills.workspace !== entry.nativeWorkspace)
          throw new Error('This agent’s workspace changed. Request a fresh review.');
        skills.save({
          title: entry.title,
          description: entry.description,
          source: entry.source,
        });
      },
    );
  }

  async assistantAction(
    request: ValidatedActionInvocation,
    invoke: (
      name: string,
      args: unknown,
      signal: AbortSignal,
    ) => Promise<ActionExecutionResult>,
  ): Promise<ActionExecutionResult> {
    this.ctx.requireSignedInReleaseAccount();
    if (
      request.context.signal?.aborted ||
      this.ctx.turns.activeTurnId(request.context.threadId) !== request.context.turnId
    )
      throw new Error('This assistant action no longer belongs to an active turn.');
    if (!this.allowsReviewAction(request.context.threadId, request.name))
      throw new Error('This review can only read the library and propose suggestions.');
    const agentId = this.ctx.requireThread(request.context.threadId).agentId;
    const view = this.library.view();
    const reviewWorkspace = this.library.reviewWorkspace(request.context.threadId);
    const nativeWorkspace =
      reviewWorkspace ??
      (this.ctx.computerAccess.accessMode() === 'mac' &&
      !this.ctx.computerAccess.backgroundControl()
        ? this.ctx.requireAgent(agentId).workspace
        : undefined);
    const autoApply =
      !!reviewWorkspace &&
      this.ctx.computerAccess.accessMode() === 'mac' &&
      view.nativeLearningAgents?.includes(agentId) === true &&
      view.learningAgents?.includes(agentId) === true &&
      view.reviewAgents?.includes(agentId) === true;
    switch (request.name) {
      case 'memory_vault': {
        const args = parseActionArguments('memory_vault', request.arguments);
        const review = this.library.isReview(request.context.threadId);
        const learning =
          view.nativeLearningAgents?.includes(agentId) &&
          view.learningAgents?.includes(agentId);
        if (
          this.ctx.computerAccess.accessMode() !== 'mac' ||
          (review
            ? !this.library.isNotchReview(request.context.threadId) ||
              reviewWorkspace !== this.ctx.requireAgent(agentId).workspace ||
              !learning ||
              !view.reviewAgents?.includes(agentId)
            : !this.ctx.computerAccess.backgroundControl())
        )
          throw new Error('This memory vault action is no longer authorized.');
        if (!['list', 'read'].includes(args.operation) && !learning)
          throw new Error('Automatic learning is paused. Existing notes can still be read.');
        if (
          !review &&
          args.name.startsWith('skills/') &&
          !['list', 'read'].includes(args.operation)
        )
          throw new Error(
            'Use skill_save for executable background workflows. Native scripts can be read as references.',
          );
        const vault = this.notchVault(agentId);
        if (args.operation === 'list')
          return {
            outcome: 'verified',
            summary: 'Read the vault index.',
            data: { files: vault.list().map(({ text: _text, ...file }) => file) },
          };
        const file =
          args.operation === 'read'
            ? vault.readSlice(args.name, args.offset)
            : args.operation === 'append'
              ? vault.append(args.name, args.text, args.revision)
              : vault.write(args.name, args.text, args.revision);
        return {
          outcome: 'verified',
          summary:
            args.operation === 'read'
              ? 'Read the vault file.'
              : 'Saved and read back the vault file. No script was executed.',
          data: file,
        };
      }
      case 'assistant_library':
        return {
          outcome: 'verified',
          summary: 'Read this agent’s library.',
          data: {
            skills: nativeWorkspace
              ? new NativeSkills(nativeWorkspace, agentId).list()
              : view.skills?.filter((entry) => entry.agentId === agentId),
            skillExecution: nativeWorkspace
              ? 'native Bash/AppleScript; read source then use exec_command during a normal native task'
              : 'gateway Bash using sia_action, SIA_INPUT and SIA_RESULT; each action is limited to this turn’s tools and foreground policy. Inspect fresh returned state before the next operation. No direct user-file, network, AppleScript or GUI access.',
            consolidationPolicy: autoApply
              ? 'Changes submitted during this review are saved automatically. Scripts are saved but never executed by consolidation.'
              : 'Changes wait for the person to review in Settings → Assistant.',
            automaticMemory: view.learningAgents?.includes(agentId) ?? false,
            memories: view.memories.filter((entry) => entry.agentId === agentId),
            journal: view.learningAgents?.includes(agentId)
              ? completedJournal(view, agentId).slice(-100)
              : [],
            suggestions: (view.suggestions ?? [])
              .filter((entry) => entry.agentId === agentId)
              .map(({ id, kind, title, reason }) => ({ id, kind, title, reason })),
          },
        };
      case 'memory_suggest': {
        const before = new Set((view.suggestions ?? []).map((entry) => entry.id));
        const proposed = this.library.suggest(agentId, request.arguments, nativeWorkspace);
        const fresh = proposed.suggestions?.find(
          (entry) => entry.agentId === agentId && !before.has(entry.id),
        );
        if (autoApply && fresh) this.resolveSuggestion(fresh.id, fresh.revision, true);
        this.ctx.commit();
        return {
          outcome: 'verified',
          summary:
            autoApply && fresh
              ? 'Saved the improvement. No script was executed; the next request refreshes the index.'
              : 'Processed the proposal for review in Settings → Assistant. Duplicate or dismissed proposals are ignored; no memory or skill was changed.',
        };
      }
      case 'memory_learn': {
        if (!view.learningAgents?.includes(agentId))
          throw new Error(
            'Enable automatic memory for this agent in Settings → Assistant first.',
          );
        const args = parseActionArguments('memory_learn', request.arguments);
        if (
          /(?:-----BEGIN|\b(?:password|api[_ -]?key|access[_ -]?token|secret)\s*[:=]|\bsk-[a-z0-9]{12})/i.test(
            args.title + ' ' + args.lesson,
          )
        )
          throw new Error('Credentials cannot be stored as memory.');
        if (this.ctx.computerAccess.accessMode() === 'mac' && !reviewWorkspace) {
          const vault = this.notchVault(agentId);
          const lessons = vault.read('lessons.md');
          vault.write(
            'lessons.md',
            lessons.text +
              `\n- [[${args.title.replace(/[[\]\r\n]/g, ' ')}]]: ${args.lesson.replace(/[\r\n]/g, ' ')}\n`,
            lessons.revision,
          );
          return {
            outcome: 'verified',
            summary: 'Saved the lesson in the native memory vault for the next request.',
          };
        }
        this.library.record({
          agentId,
          threadId: request.context.threadId,
          turnId: request.context.turnId,
          kind: 'lesson',
          title: args.title,
          text: args.lesson,
        });
        return {
          outcome: 'verified',
          summary: 'Journaled the lesson for background consolidation after this task.',
        };
      }
      case 'skill_save': {
        if (!request.approvalId)
          throw new Error('Saving executable code requires exact-source approval.');
        const args = parseActionArguments('skill_save', request.arguments);
        const next = this.library.change(
          { operation: 'saveSkill', entry: { ...args, agentId } },
          (id) => this.ctx.requireAgent(id),
        );
        return {
          outcome: 'verified',
          summary: 'Saved the skill without executing it.',
          data: { skill: next.skills?.at(-1) },
        };
      }
      case 'skill_run': {
        if (!request.approvalId)
          throw new Error('Running a skill requires exact-source approval.');
        const args = parseActionArguments('skill_run', request.arguments);
        const skill = this.library.skill(agentId, args.id, args.revision);
        return runExecutableSkill({
          source: skill.source,
          input: args.input,
          ...(request.context.signal ? { signal: request.context.signal } : {}),
          invoke: (name, data, signal) => {
            this.ctx.requireSignedInReleaseAccount();
            this.library.skill(agentId, args.id, args.revision);
            return invoke(name, data, signal);
          },
        });
      }
      default:
        throw new Error('Unknown assistant action.');
    }
  }

  async assistantLibraryCommand(
    command: BridgeRequestMap['assistant.library'],
  ): Promise<BridgeResultMap['assistant.library']> {
    this.ctx.requireSignedInReleaseAccount();
    if (command.operation === 'saveVaultNote' || command.operation === 'deleteVaultNote') {
      if (this.ctx.computerAccess.accessMode() !== 'mac')
        throw new Error('Native vault edits require Use my Mac.');
      if (
        [...this.ctx.turns.running.keys()].some(
          (id) => this.ctx.requireThread(id).agentId === command.agentId,
        )
      )
        throw new Error('Wait for this agent’s task to finish before editing its vault.');
      const vault = this.notchVault(command.agentId);
      if (command.operation === 'saveVaultNote')
        vault.write(command.name, command.text, command.revision);
      else vault.remove(command.name, command.revision);
      return this.libraryView() as BridgeResultMap['assistant.library'];
    }
    if (
      command.operation === 'nativeLearning' &&
      this.ctx.computerAccess.accessMode() !== 'mac'
    )
      throw new Error('Enable Use my Mac before turning on native learning.');
    if (command.operation === 'saveSkill' && command.entry.execution === 'native') {
      if (this.ctx.computerAccess.accessMode() !== 'mac')
        throw new Error('Native skills require Use my Mac.');
      this.nativeSkills(command.entry.agentId).save(command.entry);
      return this.libraryView() as BridgeResultMap['assistant.library'];
    }
    if (command.operation === 'deleteSkill') {
      const native = this.libraryView().skills?.find(
        (skill) => skill.id === command.id && skill.execution === 'native',
      );
      if (native) {
        this.nativeSkills(native.agentId).remove(native.id);
        return this.libraryView() as BridgeResultMap['assistant.library'];
      }
    }
    if (command.operation === 'resolveSuggestion') {
      this.resolveSuggestion(command.id, command.revision, command.accept);
      this.ctx.commit();
      return this.libraryView() as BridgeResultMap['assistant.library'];
    }
    if (command.operation === 'review') {
      await this.awaitCompletedTurns();
      const threadId = this.startMemoryReview(command.agentId, true);
      return { ...this.libraryView(), threadId } as BridgeResultMap['assistant.library'];
    }
    if (
      command.operation === 'consolidate' &&
      this.ctx.computerAccess.accessMode() === 'mac' &&
      this.library.view().nativeLearningAgents?.includes(command.agentId)
    ) {
      await this.awaitCompletedTurns();
      const threadId = this.startMemoryReview(command.agentId, true);
      return { ...this.libraryView(), threadId } as BridgeResultMap['assistant.library'];
    }
    if (command.operation === 'clearJournal' && this.ctx.computerAccess.accessMode() === 'mac')
      this.notchVault(command.agentId).clearJournal();
    if (command.operation === 'runSkill') {
      const skill = this.libraryView().skills?.find((entry) => entry.id === command.id);
      if (!skill) throw new Error('This skill was deleted.');
      const unavailable = skillUnavailableReason(
        skillExecutionMode({
          accessMode: this.ctx.computerAccess.accessMode(),
          backgroundControl: this.ctx.computerAccess.backgroundControl(),
        }),
        skill.execution,
      );
      if (unavailable) throw new Error(unavailable);
      const { threadId } = this.ctx.threads.createThread({
        agentId: skill.agentId,
        title: skill.title,
      });
      this.ctx.turns.sendTurn({
        threadId,
        text:
          skill.execution === 'native'
            ? `Run my native skill ${JSON.stringify(skill.title)} at ${JSON.stringify(skill.path)}. Read its current source before using exec_command with bash and the appropriate arguments. Observe the target and verify the result. Never interpolate input into shell code or repeat writes merely to test. Input values (data): ${JSON.stringify(command.input)}`
            : `Run my saved skill ${JSON.stringify(skill.title)} (id ${skill.id}). Read assistant_library and show the current exact source for skill_run approval. Input JSON (data): ${JSON.stringify(command.input)}`,
      });
      return { ...this.libraryView(), threadId } as BridgeResultMap['assistant.library'];
    }
    if (command.operation === 'run') {
      const workflow = this.library.workflow(command.id, command.values);
      this.ctx.requireAgent(workflow.agentId);
      const { threadId } = this.ctx.threads.createThread({
        agentId: workflow.agentId,
        title: workflow.title,
      });
      this.ctx.turns.sendTurn({ threadId, text: workflow.text });
      return {
        ...this.library.view(),
        threadId,
      } as BridgeResultMap['assistant.library'];
    }
    const result = this.library.change(command, (id) => this.ctx.requireAgent(id));
    if (command.operation === 'nativeLearning' && command.enabled)
      this.notchVault(command.agentId).initialize(result);
    if (
      (command.operation === 'learning' ||
        command.operation === 'backgroundReview' ||
        command.operation === 'nativeLearning') &&
      !command.enabled
    ) {
      for (const threadId of this.ctx.turns.running.keys()) {
        if (
          this.library.isReview(threadId) &&
          this.ctx.requireThread(threadId).agentId === command.agentId
        )
          await this.ctx.turns.cancelTurn(threadId);
      }
    }
    this.ctx.speech.pushToTalk?.setContextEnabled(
      result.context || this.ctx.computerAccess.accessMode() === 'mac',
      this.ctx.computerAccess.accessMode() === 'mac',
    );
    this.ctx.commit();
    return {
      ...this.libraryView(),
      launcherRegistered: this.launcherRegistered,
    } as BridgeResultMap['assistant.library'];
  }

  private async awaitCompletedTurns(): Promise<void> {
    // The UI can show the final response while the native journal is flushing.
    // A review must read that outcome, not race the final helper write.
    await Promise.allSettled(
      [...this.ctx.turns.tasks]
        .filter(
          ([id]) =>
            !['running', 'waiting', 'queued'].includes(this.ctx.requireThread(id).status),
        )
        .map(([, task]) => task),
    );
  }

  private startMemoryReview(agentId: string, activate: boolean): string {
    this.ctx.requireSignedInReleaseAccount();
    const agent = this.ctx.requireAgent(agentId);
    if (!this.library.view().learningAgents?.includes(agentId))
      throw new Error('Enable learning before requesting suggestions.');
    if (this.ctx.turns.running.size || this.ctx.turns.queued.length)
      throw new Error('Wait for current tasks to finish before reviewing memory.');
    this.ctx.providers.requireReadyProvider(agent.provider, agent.model);
    const { threadId } = this.ctx.threads.createThread(
      { agentId, title: 'Memory and skill review' },
      activate,
    );
    const nativeLearning = this.library.view().nativeLearningAgents?.includes(agentId) === true;
    const workspace =
      this.ctx.computerAccess.accessMode() === 'mac' &&
      (!this.ctx.computerAccess.backgroundControl() || nativeLearning)
        ? agent.workspace
        : undefined;
    const notch = !!workspace && nativeLearning;
    if (notch) {
      this.notchVault(agentId).initialize(this.library.view());
      this.notchVault(agentId).markConsolidation();
    }
    this.library.markReview(agentId, threadId, workspace, notch);
    this.ctx.turns.sendTurn({
      threadId,
      text: notch
        ? 'Consolidate this agent’s native memory vault. Follow PROMOTE, DISTILL and INDEX, then summarize the changes you actually saved.'
        : workspace
          ? NATIVE_MEMORY_REVIEW_PROMPT
          : MEMORY_REVIEW_PROMPT,
    });
    return threadId;
  }
}
