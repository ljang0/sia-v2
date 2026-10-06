import * as Dialog from '@radix-ui/react-dialog';
import {
  Browser,
  CheckCircle,
  Cloud,
  CloudSlash,
  Database,
  Desktop,
  Eye,
  LinkBreak,
  LockKey,
  ShieldCheck,
  X,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type {
  BrowserInspectorState,
  ComputerInspectorState,
  RendererSnapshot,
  ResearchSettings,
} from '../types';
import buttons from '../styles/buttons.module.css';
import primitives from '../styles/primitives.module.css';
import styles from './Inspector.module.css';
import { BrowserWindowPicker } from './BrowserWindowPicker';

interface InspectorProps {
  browser: BrowserInspectorState;
  computer: ComputerInspectorState;
  connection: RendererSnapshot['connection'];
  cloudAuth: RendererSnapshot['cloudAuth'];
  research: ResearchSettings;
  /** False while the panel plays its closing animation; the parent then unmounts it. */
  open?: boolean;
  onExited?(): void;
  onClose(): void;
  onAttachBrowser(windowId?: number): void;
  onOpenBrowserSite(url: string): void;
  onDetachBrowser(): void;
  onRequestPermissions(): void;
  onOpenCloudSettings(): void;
  onOpenResearchSettings(): void;
  onToggleResearch(): void;
}

type AccessTab = 'browser' | 'computer' | 'data';

/** Matches --motion-fast, the panel's closing animation. */
const CLOSE_MS = 160;

export function Inspector({
  browser,
  computer,
  connection,
  cloudAuth,
  research,
  onClose,
  onAttachBrowser,
  onOpenBrowserSite,
  onDetachBrowser,
  onRequestPermissions,
  onOpenCloudSettings,
  onOpenResearchSettings,
  onToggleResearch,
  open = true,
  onExited,
}: InspectorProps) {
  // Leave on a timer, not animationend, so a window whose animations are paused still closes.
  useEffect(() => {
    if (open || !onExited) return;
    const timer = window.setTimeout(onExited, CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open, onExited]);
  const [tab, setTab] = useState<AccessTab>('browser');
  const descriptionId = useId();
  const browserPanelId = useId();
  const computerPanelId = useId();
  const dataPanelId = useId();
  const browserTabId = useId();
  const computerTabId = useId();
  const dataTabId = useId();
  const browserTabRef = useRef<HTMLButtonElement>(null);
  const computerTabRef = useRef<HTMLButtonElement>(null);
  const dataTabRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  const close = () => {
    const target = returnFocus.current;
    onClose();
    queueMicrotask(() => {
      if (target?.isConnected) target.focus();
    });
  };
  const selectTab = (next: AccessTab) => {
    setTab(next);
    ({ browser: browserTabRef, computer: computerTabRef, data: dataTabRef })[
      next
    ].current?.focus();
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const tabs: readonly AccessTab[] = ['browser', 'computer', 'data'];
    const current = tabs.indexOf(tab);
    let next: AccessTab | undefined;
    if (event.key === 'ArrowRight') {
      next = tabs[(current + 1) % tabs.length];
    } else if (event.key === 'ArrowLeft') {
      next = tabs[(current - 1 + tabs.length) % tabs.length];
    } else if (event.key === 'Home') {
      next = 'browser';
    } else if (event.key === 'End') {
      next = 'data';
    }
    if (!next) return;
    event.preventDefault();
    selectTab(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.inspectorOverlay} />
        <Dialog.Content
          className={styles.inspector}
          aria-describedby={descriptionId}
          aria-modal="true"
        >
          <Dialog.Title className={primitives.visuallyHidden}>Access</Dialog.Title>
          <Dialog.Description className={primitives.visuallyHidden} id={descriptionId}>
            Review and manage browser, computer, data, and optional cloud access.
          </Dialog.Description>

          <header className={styles.inspectorHeader}>
            <div
              className={primitives.segmentedControl}
              aria-label="Access view"
              role="tablist"
            >
              <button
                type="button"
                id={browserTabId}
                ref={browserTabRef}
                role="tab"
                className={tab === 'browser' ? primitives.segmentActive : ''}
                onClick={() => setTab('browser')}
                onKeyDown={handleTabKeyDown}
                aria-selected={tab === 'browser'}
                aria-controls={browserPanelId}
                tabIndex={tab === 'browser' ? 0 : -1}
              >
                <Browser size={16} aria-hidden="true" />
                Browser
              </button>
              <button
                type="button"
                id={computerTabId}
                ref={computerTabRef}
                role="tab"
                className={tab === 'computer' ? primitives.segmentActive : ''}
                onClick={() => setTab('computer')}
                onKeyDown={handleTabKeyDown}
                aria-selected={tab === 'computer'}
                aria-controls={computerPanelId}
                tabIndex={tab === 'computer' ? 0 : -1}
              >
                <Desktop size={16} aria-hidden="true" />
                Computer
              </button>
              <button
                type="button"
                id={dataTabId}
                ref={dataTabRef}
                role="tab"
                className={tab === 'data' ? primitives.segmentActive : ''}
                onClick={() => setTab('data')}
                onKeyDown={handleTabKeyDown}
                aria-selected={tab === 'data'}
                aria-controls={dataPanelId}
                tabIndex={tab === 'data' ? 0 : -1}
              >
                <Database size={16} aria-hidden="true" />
                Data
              </button>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className={buttons.iconButton}
                aria-label="Close access"
                title="Close access"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          {tab === 'browser' ? (
            <BrowserPanel
              id={browserPanelId}
              labelledBy={browserTabId}
              browser={browser}
              onAttach={onAttachBrowser}
              onOpenSite={onOpenBrowserSite}
              onDetach={onDetachBrowser}
            />
          ) : tab === 'computer' ? (
            <ComputerPanel
              id={computerPanelId}
              labelledBy={computerTabId}
              computer={computer}
              onRequestPermissions={onRequestPermissions}
            />
          ) : (
            <DataPanel
              id={dataPanelId}
              labelledBy={dataTabId}
              connection={connection}
              cloudAuth={cloudAuth}
              research={research}
              onOpenCloudSettings={onOpenCloudSettings}
              onOpenResearchSettings={onOpenResearchSettings}
              onToggleResearch={onToggleResearch}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BrowserPanel({
  id,
  labelledBy,
  browser,
  onAttach,
  onOpenSite,
  onDetach,
}: {
  id: string;
  labelledBy: string;
  browser: BrowserInspectorState;
  onAttach(windowId?: number): void;
  onOpenSite(url: string): void;
  onDetach(): void;
}) {
  const [site, setSite] = useState('');
  const submitSite = (event: FormEvent) => {
    event.preventDefault();
    const url = site.trim();
    if (!url) return;
    onOpenSite(url);
    setSite('');
  };
  if (!browser.attached) {
    const pending = browser.status === 'attaching';
    if (browser.availableWindows.length) {
      return (
        <div
          className={styles.inspectorBody}
          id={id}
          role="tabpanel"
          aria-labelledby={labelledBy}
        >
          <section className={styles.browserPickerIntro}>
            <Browser size={22} aria-hidden="true" />
            <div>
              <h2>Choose a Chrome window</h2>
              <p>Sia will attach only the window you choose. The others will not be granted.</p>
            </div>
          </section>
          {browser.status === 'error' && browser.snapshotLabel ? (
            <p className={primitives.inlineError} role="alert">
              {browser.snapshotLabel}
            </p>
          ) : null}
          <BrowserWindowPicker
            windows={browser.availableWindows}
            pending={pending}
            onSelect={onAttach}
          />
          <div className={styles.inspectorFootnote}>
            <LockKey size={15} aria-hidden="true" />
            <span>
              Sia uses each visible window title only for this chooser. It does not copy
              cookies.
            </span>
          </div>
        </div>
      );
    }
    return (
      <div
        className={styles.inspectorEmpty}
        id={id}
        role="tabpanel"
        aria-labelledby={labelledBy}
      >
        <Browser size={25} aria-hidden="true" />
        <h2>{pending ? 'Looking for Chrome…' : 'Use your signed-in Chrome'}</h2>
        <p>
          Open the Chrome window you want to use. If several are open, Sia will let you choose
          one.
        </p>
        {browser.status === 'error' && browser.snapshotLabel ? (
          <p className={`${primitives.inlineError} ${styles.emptyError}`} role="alert">
            {browser.snapshotLabel}
          </p>
        ) : null}
        <button
          type="button"
          className={`${buttons.primaryButton} ${styles.emptyAction}`}
          disabled={pending}
          onClick={() => onAttach()}
        >
          {pending ? 'Looking…' : 'Choose Chrome window'}
        </button>
      </div>
    );
  }

  const grantedSites = browser.tabs.filter((item) => item.granted);
  return (
    <div className={styles.inspectorBody} id={id} role="tabpanel" aria-labelledby={labelledBy}>
      <section className={styles.inspectorSummary}>
        <div>
          <span className={primitives.sectionLabel}>Attached profile</span>
          <strong>{browser.profileName}</strong>
        </div>
        <button type="button" className={buttons.textButtonDanger} onClick={onDetach}>
          <LinkBreak size={15} aria-hidden="true" />
          Detach
        </button>
      </section>

      <section>
        <h2 className={styles.inspectorSectionTitle}>Granted sites</h2>
        {grantedSites.length ? (
          <div className={styles.inspectorList}>
            {grantedSites.map((item) => (
              <div className={styles.inspectorRow} key={item.id}>
                <span className={styles.inspectorRowIcon}>
                  <Eye size={16} aria-hidden="true" />
                </span>
                <div className={styles.inspectorRowText}>
                  <strong>{item.origin}</strong>
                  {item.title !== item.origin ? <span>{item.title}</span> : null}
                </div>
                <span className={styles.accessGranted}>Granted</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.inventoryNotice}>
            No sites are granted by the current Chrome attachment.
          </p>
        )}
      </section>

      <form className={styles.browserOpenSite} onSubmit={submitSite}>
        <div>
          <strong>Open a site in your signed-in Chrome</strong>
          <p>Sia gets access to that one site, nothing else.</p>
        </div>
        <input
          value={site}
          onChange={(event) => setSite(event.target.value)}
          placeholder="mail.google.com"
          aria-label="Website address"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={buttons.secondaryButton} disabled={!site.trim()}>
          Open
        </button>
      </form>

      <div className={styles.inspectorFootnote}>
        <LockKey size={15} aria-hidden="true" />
        <span>
          Only granted sites are listed. Sia does not receive a complete inventory of your tabs.
        </span>
      </div>
    </div>
  );
}

function ComputerPanel({
  id,
  labelledBy,
  computer,
  onRequestPermissions,
}: {
  id: string;
  labelledBy: string;
  computer: ComputerInspectorState;
  onRequestPermissions(): void;
}) {
  const permitted =
    computer.accessibility === 'allowed' && computer.screenRecording === 'allowed';

  return (
    <div className={styles.inspectorBody} id={id} role="tabpanel" aria-labelledby={labelledBy}>
      <section>
        <h2 className={styles.inspectorSectionTitle}>System access</h2>
        <div className={styles.permissionList}>
          <PermissionRow label="Accessibility" state={computer.accessibility} />
          <PermissionRow label="Screen Recording" state={computer.screenRecording} />
        </div>
        {!permitted ? (
          <button
            type="button"
            className={`${buttons.secondaryButton} ${styles.permissionAction}`}
            onClick={onRequestPermissions}
          >
            Open system permissions
          </button>
        ) : null}
      </section>

      <section>
        <h2 className={styles.inspectorSectionTitle}>Action approvals</h2>
        <div className={styles.permissionRow} data-testid="computer-approval-mode">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Sia actions</span>
          <strong>
            {computer.trust === 'auto'
              ? 'Runs without asking (full bypass)'
              : 'Asks before each action'}
          </strong>
        </div>
      </section>

      <section className={styles.inventorySection}>
        <h2 className={styles.inspectorSectionTitle}>Window access</h2>
        <p className={styles.inventoryNotice}>
          A complete window inventory is unavailable in this alpha. Sia requests a scoped window
          grant when a task needs one.
        </p>
      </section>

      <div className={styles.inspectorFootnote}>
        <LockKey size={15} aria-hidden="true" />
        <span>
          Sia’s own browser and computer actions can’t use password fields, sign-in screens, or
          security settings.
          {computer.accessMode === 'mac'
            ? ' Commands your agent runs directly on this Mac aren’t covered by this limit.'
            : ''}
        </span>
      </div>
    </div>
  );
}

function DataPanel({
  id,
  labelledBy,
  connection,
  cloudAuth,
  research,
  onOpenCloudSettings,
  onOpenResearchSettings,
  onToggleResearch,
}: {
  id: string;
  labelledBy: string;
  connection: RendererSnapshot['connection'];
  cloudAuth: RendererSnapshot['cloudAuth'];
  research: ResearchSettings;
  onOpenCloudSettings(): void;
  onOpenResearchSettings(): void;
  onToggleResearch(): void;
}) {
  const cloud = describeCloud(connection, cloudAuth);
  const researchLabel = !research.consented
    ? 'Off'
    : research.capture === 'paused'
      ? 'Paused'
      : research.capture === 'sync-pending'
        ? `${research.pendingItems} waiting`
        : 'On';
  const CloudIcon = cloud.connected ? Cloud : CloudSlash;

  return (
    <div className={styles.inspectorBody} id={id} role="tabpanel" aria-labelledby={labelledBy}>
      <section>
        <h2 className={styles.inspectorSectionTitle}>Data access</h2>
        <div className={styles.dataAccessList}>
          <div className={styles.dataAccessRow}>
            <CloudIcon size={17} aria-hidden="true" />
            <div>
              <strong>Sia cloud</strong>
              <span>
                {cloud.label}. {cloud.detail}
              </span>
            </div>
            <button type="button" className={buttons.textButton} onClick={onOpenCloudSettings}>
              Settings
            </button>
          </div>
          <div className={styles.dataAccessRow}>
            <Database size={17} aria-hidden="true" />
            <div>
              <strong>Research capture</strong>
              <span>
                {researchLabel}.{' '}
                {research.consented
                  ? 'Uses only the research data you allowed.'
                  : 'No research data is being captured.'}
              </span>
            </div>
            <button
              type="button"
              className={buttons.textButton}
              onClick={research.consented ? onToggleResearch : onOpenResearchSettings}
            >
              {!research.consented
                ? 'Review'
                : research.capture === 'paused'
                  ? 'Resume'
                  : 'Pause'}
            </button>
          </div>
        </div>
      </section>

      <div className={styles.inspectorFootnote}>
        <LockKey size={15} aria-hidden="true" />
        <span>
          Research and optional cloud settings remain separate from browser and computer grants.
        </span>
      </div>
    </div>
  );
}

function describeCloud(
  connection: RendererSnapshot['connection'],
  auth: RendererSnapshot['cloudAuth'],
) {
  if (auth.state === 'unconfigured') {
    return {
      connected: false,
      label: 'Local mode',
      detail: 'Cloud sync can be added later.',
    } as const;
  }
  if (auth.state === 'signed-out') {
    return {
      connected: false,
      label: 'Signed out',
      detail: 'Sign in to access Sia.',
    } as const;
  }
  if (auth.state === 'code-sent') {
    return {
      connected: false,
      label: 'Continue',
      detail: 'Finish signing in from Settings.',
    } as const;
  }
  if (connection === 'offline') {
    return {
      connected: false,
      label: 'Offline',
      detail: 'Sync and connected apps will resume automatically.',
    } as const;
  }
  return {
    connected: true,
    label: 'Connected',
    detail: auth.email ? `Signed in as ${auth.email}.` : 'Cloud sync is connected.',
  } as const;
}

function PermissionRow({
  label,
  state,
}: {
  label: string;
  state: 'allowed' | 'denied' | 'not-requested';
}) {
  return (
    <div className={styles.permissionRow}>
      {state === 'allowed' ? (
        <CheckCircle size={16} aria-hidden="true" />
      ) : (
        <LockKey size={16} aria-hidden="true" />
      )}
      <span>{label}</span>
      <strong>
        {state === 'allowed' ? 'Allowed' : state === 'denied' ? 'Denied' : 'Not set'}
      </strong>
    </div>
  );
}
