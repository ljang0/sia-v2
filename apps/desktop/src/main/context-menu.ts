import type { MenuItemConstructorOptions } from 'electron';

/** The parts of Electron's ContextMenuParams the main window's right-click menu uses. */
export interface ContextMenuRequest {
  isEditable: boolean;
  selectionText: string;
  linkURL: string;
  misspelledWord: string;
  dictionarySuggestions: readonly string[];
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

export interface ContextMenuActions {
  replaceMisspelling(word: string): void;
  addToDictionary(word: string): void;
  copyLink(url: string): void;
  /** macOS dictionary lookup for the current selection. */
  lookUp?: (() => void) | undefined;
}

/**
 * Builds the right-click menu people expect from a Mac text surface: spelling fixes first,
 * then Look Up and Copy Link when they apply, then the standard edit commands. Returns an
 * empty list when nothing applies so the caller can skip showing a menu.
 */
export function contextMenuTemplate(
  request: ContextMenuRequest,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const sections: MenuItemConstructorOptions[][] = [];
  const misspelled = request.isEditable ? request.misspelledWord.trim() : '';
  if (misspelled) {
    const suggestions = request.dictionarySuggestions.slice(0, 5);
    sections.push([
      ...(suggestions.length
        ? suggestions.map((suggestion): MenuItemConstructorOptions => ({
            label: suggestion,
            click: () => actions.replaceMisspelling(suggestion),
          }))
        : [{ label: 'No Guesses Found', enabled: false }]),
      {
        label: 'Add to Dictionary',
        click: () => actions.addToDictionary(misspelled),
      },
    ]);
  }

  const selection = request.selectionText.trim();
  const lookUp: MenuItemConstructorOptions[] =
    selection && actions.lookUp
      ? [{ label: `Look Up “${truncate(selection, 24)}”`, click: actions.lookUp }]
      : [];
  const link = safeLink(request.linkURL);
  const copyLink: MenuItemConstructorOptions[] = link
    ? [{ label: 'Copy Link', click: () => actions.copyLink(link) }]
    : [];
  if (lookUp.length || copyLink.length) sections.push([...lookUp, ...copyLink]);

  const edit: MenuItemConstructorOptions[] = [];
  if (request.isEditable) {
    edit.push(
      { role: 'cut', enabled: request.editFlags.canCut },
      { role: 'copy', enabled: request.editFlags.canCopy },
      { role: 'paste', enabled: request.editFlags.canPaste },
    );
  } else if (selection) {
    edit.push({ role: 'copy', enabled: request.editFlags.canCopy });
  }
  if (request.isEditable || selection) {
    edit.push({ role: 'selectAll', enabled: request.editFlags.canSelectAll });
  }
  if (edit.length) sections.push(edit);

  return sections.flatMap((section, index) =>
    index === 0 ? section : [{ type: 'separator' as const }, ...section],
  );
}

function safeLink(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function truncate(value: string, length: number): string {
  const singleLine = value.replace(/\s+/g, ' ');
  return singleLine.length > length ? `${singleLine.slice(0, length - 1)}…` : singleLine;
}
