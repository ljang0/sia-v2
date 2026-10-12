import { isLocalConnection } from './connection-ids.js';
import type { BridgeRequestMap, DesktopSnapshot } from '../../shared/bridge.js';
import {
  isTextSize,
  isTheme,
  type TextSize,
  type ThemePreference,
} from '../../shared/display.js';
import type { ControllerContext } from './context.js';

/** The parts of the controller context AppSettings uses. */
type AppSettingsContext = Pick<
  ControllerContext,
  'commit' | 'connections' | 'deps' | 'resultSnapshot' | 'speech' | 'state' | 'turns'
>;

/**
 * Onboarding and display preferences: appearance, theme, text size, completion sound, open at
 * login and developer tools.
 */
export class AppSettings {
  constructor(private readonly ctx: AppSettingsContext) {}

  /**
   * Theme and text size. They hold nothing private, so they apply before sign-in too and main
   * mirrors them for the next launch's first frame.
   */
  displayPreferences(): { theme?: ThemePreference; textSize?: TextSize } {
    const { theme, textSize } = this.ctx.state.preferences;
    return { ...(theme ? { theme } : {}), ...(textSize ? { textSize } : {}) };
  }

  /** Settings → Developer tools (Command tool, worktree duplicates, View → Reload). */
  developerToolsEnabled(): boolean {
    return this.ctx.state.preferences.developerTools === true;
  }

  setOnboarding({
    step,
    permissionSetup,
  }: BridgeRequestMap['settings.setOnboarding']): DesktopSnapshot {
    const previous = this.ctx.state.preferences.onboarding;
    const candidateId = step === 'welcome' ? this.ctx.state.activeAgentId : previous?.agentId;
    const agent = this.ctx.state.agents.find(({ id }) => id === candidateId);
    if (['voice', 'access', 'apps', 'restart', 'verify', 'practice'].includes(step) && !agent) {
      throw new Error('Create your agent before continuing setup.');
    }
    this.ctx.state.preferences.onboarding = {
      ...(step === 'welcome' ? {} : previous),
      ...(permissionSetup ? { permissionSetup } : {}),
      step,
      ...(agent ? { agentId: agent.id } : {}),
    };
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  restartForOnboarding(): DesktopSnapshot {
    const progress = this.ctx.state.preferences.onboarding;
    if (
      !progress ||
      !['restart', 'verify'].includes(progress.step) ||
      !this.ctx.state.agents.some(({ id }) => id === progress.agentId)
    )
      throw new Error('Finish connecting your apps before restarting setup.');
    if (!this.ctx.deps.restartApp) throw new Error('Restart is unavailable in this build.');
    if (
      this.ctx.connections.setup ||
      this.ctx.state.connections.some(
        (app) => !isLocalConnection(app.id) && app.status === 'connecting',
      )
    )
      throw new Error('Finish or cancel account approval before restarting.');
    if (this.ctx.turns.running.size || this.ctx.speech.pushToTalk?.busy)
      throw new Error('Wait for the current task or recording to finish before restarting.');
    if (progress.restartPending) return this.ctx.resultSnapshot();
    this.ctx.state.preferences.onboarding = {
      ...progress,
      step: 'verify',
      restartPending: true,
      restarted: false,
    };
    this.ctx.commit();
    try {
      this.ctx.deps.restartApp();
    } catch (error) {
      this.ctx.state.preferences.onboarding = progress;
      this.ctx.commit();
      throw error;
    }
    return this.ctx.resultSnapshot();
  }

  setAppearance(
    appearance: BridgeRequestMap['settings.setAppearance']['appearance'],
  ): DesktopSnapshot {
    this.ctx.state.preferences.appearance = appearance;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setTheme(theme: BridgeRequestMap['settings.setTheme']['theme']): DesktopSnapshot {
    if (!isTheme(theme)) throw new Error('Choose System, Light, or Dark.');
    if (theme === 'system') delete this.ctx.state.preferences.theme;
    else this.ctx.state.preferences.theme = theme;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setTextSize(textSize: BridgeRequestMap['settings.setTextSize']['textSize']): DesktopSnapshot {
    if (!isTextSize(textSize)) throw new Error('Choose a text size from the list.');
    if (textSize === 'default') delete this.ctx.state.preferences.textSize;
    else this.ctx.state.preferences.textSize = textSize;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setCompletionSound(enabled: boolean): DesktopSnapshot {
    this.ctx.state.preferences.completionSound = enabled;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setOpenAtLogin(enabled: boolean): DesktopSnapshot {
    if (!this.ctx.deps.setOpenAtLogin) throw new Error('Opening at login is unavailable here.');
    this.ctx.deps.setOpenAtLogin(enabled);
    this.ctx.state.preferences.openAtLogin = enabled;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setDeveloperTools(enabled: boolean): DesktopSnapshot {
    if (enabled) this.ctx.state.preferences.developerTools = true;
    else delete this.ctx.state.preferences.developerTools;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }
}
