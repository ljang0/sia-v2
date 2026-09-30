/** Mac access state for Use my Mac tasks. */

import type {
  BridgeRequestMap,
  ComputerPermissionsView,
  DesktopSnapshot,
} from '../../shared/bridge.js';
import type { AutomationPermissions } from '../../shared/mac-permissions.js';
import type { ControllerContext } from './context.js';

export function backgroundControlUnavailable(
  access: ComputerPermissionsView,
): string | undefined {
  if (access.status === 'ready') return undefined;
  if (access.status === 'needs_permission') {
    // Only a permission skipped during setup reaches here; name it plainly.
    if (access.relaunchFor?.length)
      return 'Mac access is turned on, but Sia needs to reopen before it can use it. Quit and reopen Sia, then press Continue task.';
    const missing = [
      access.accessibility ? '' : 'control your Mac (Accessibility)',
      access.screenRecording ? '' : 'see your screen (Screen Recording)',
    ].filter(Boolean);
    return `To work in the background, Sia needs permission to ${missing.join(' and ')}. Allow it in Settings → Computer, then press Continue task.`;
  }
  return 'Working in the background isn’t available on this Mac right now. Choose On my screen in Settings → Computer, then press Continue task.';
}

/**
 * Use my Mac access: macOS permissions, Messages and Chrome status, the access mode, trust
 * setting and trajectory log, and whether background control is available.
 */
export class ComputerAccess {
  state: ComputerPermissionsView = {
    status: 'unavailable',
    accessibility: false,
    screenRecording: false,
  };

  automationPermissions: AutomationPermissions | undefined;
  messagesAccess: 'ready' | 'needs_full_disk_access' | 'unavailable' | undefined;
  chromeConnection: 'enabled' | 'off' | 'unavailable' | undefined;

  constructor(private readonly ctx: ControllerContext) {}

  /** Use my Mac, or connected apps only. */
  accessMode(): 'mac' | 'connected' {
    return this.ctx.state.preferences.computerAccessMode ?? 'connected';
  }

  /** Use my Mac works in the background unless the person explicitly chose On my screen. */
  backgroundControl(): boolean {
    return this.ctx.state.preferences.macBackgroundControl !== false;
  }

  backgroundFallback(): 'pause' | 'foreground' {
    return this.ctx.state.preferences.macBackgroundFallback === 'foreground'
      ? 'foreground'
      : 'pause';
  }

  /** Bypass is the default; only an explicit 'ask' turns confirmations on. */
  trust(): 'auto' | 'ask' {
    return this.ctx.state.preferences.computerTrust === 'ask' ? 'ask' : 'auto';
  }

  trajectoryLogEnabled(): boolean {
    return this.ctx.state.preferences.trajectoryLog ?? true;
  }

  async refreshCapabilityStatuses(): Promise<void> {
    if (!this.ctx.deps.capabilitySetup) return;
    this.automationPermissions = await this.ctx.deps.capabilitySetup.automationPermissions?.();
    this.messagesAccess = this.ctx.deps.capabilitySetup.messagesStatus();
    this.chromeConnection = await this.ctx.deps.capabilitySetup.chromeDebugStatus();
  }

  async refreshComputer(
    request: boolean,
    permission?: 'accessibility' | 'screenRecording',
  ): Promise<DesktopSnapshot> {
    this.state = request
      ? await this.ctx.deps.computer.requestPermissions(permission)
      : await this.ctx.deps.computer.permissions();
    await this.refreshCapabilityStatuses();
    await this.ctx.deps.voice?.refreshPermissions?.().catch(() => undefined);
    this.ctx.pushToTalk?.refreshPermissions();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async openMessagesApp(): Promise<DesktopSnapshot> {
    if (!this.ctx.deps.openMessages) throw new Error('Messages is unavailable on this Mac.');
    await this.ctx.deps.openMessages();
    return this.ctx.resultSnapshot();
  }

  async setupMessages(): Promise<DesktopSnapshot> {
    if (!this.ctx.deps.openMessagesPermissions)
      throw new Error('Messages setup is unavailable on this Mac.');
    await this.ctx.deps.openMessagesPermissions();
    await this.refreshCapabilityStatuses();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async requestAutomation(
    app: BridgeRequestMap['computer.requestAutomation']['app'],
  ): Promise<DesktopSnapshot> {
    if (!this.ctx.deps.capabilitySetup?.automationPermissions)
      throw new Error('Mac app permission setup is unavailable in this build.');
    this.automationPermissions = await this.ctx.deps.capabilitySetup.automationPermissions(app);
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  setAccessMode(input: BridgeRequestMap['computer.setAccessMode']): DesktopSnapshot {
    this.ctx.requireSignedInReleaseAccount();
    this.ctx.state.preferences.computerAccessMode = input.mode;
    const background = input.background;
    if (background !== undefined) this.ctx.state.preferences.macBackgroundControl = background;
    const fallback = input.backgroundFallback;
    if (fallback !== undefined) this.ctx.state.preferences.macBackgroundFallback = fallback;
    this.ctx.pushToTalk?.setContextEnabled(
      this.ctx.assistantLibrary.view().context || this.accessMode() === 'mac',
      this.accessMode() === 'mac',
    );
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setComputerTrust(trust: BridgeRequestMap['computer.setTrust']['trust']): DesktopSnapshot {
    this.ctx.state.preferences.computerTrust = trust;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setTrajectoryLog(enabled: boolean): DesktopSnapshot {
    this.ctx.state.preferences.trajectoryLog = enabled;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  async revealTrajectories(): Promise<DesktopSnapshot> {
    if (this.ctx.deps.trajectory && this.ctx.deps.revealDirectory) {
      await this.ctx.deps.revealDirectory(this.ctx.deps.trajectory.rootDirectory);
    }
    return this.ctx.resultSnapshot();
  }
}
