import { describe, expect, it, vi } from 'vitest';
import { contextMenuTemplate, type ContextMenuRequest } from './context-menu.js';

const base: ContextMenuRequest = {
  isEditable: false,
  selectionText: '',
  linkURL: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
};

function actions() {
  return {
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    copyLink: vi.fn(),
    lookUp: vi.fn(),
  };
}

describe('contextMenuTemplate', () => {
  it('offers spelling suggestions and Add to Dictionary in an editable field', () => {
    const handlers = actions();
    const template = contextMenuTemplate(
      {
        ...base,
        isEditable: true,
        misspelledWord: 'recieve',
        dictionarySuggestions: ['receive', 'relieve'],
        editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
      },
      handlers,
    );
    expect(template.map((item) => item.label ?? item.role ?? item.type)).toEqual([
      'receive',
      'relieve',
      'Add to Dictionary',
      'separator',
      'cut',
      'copy',
      'paste',
      'selectAll',
    ]);
    (template[0]!.click as () => void)();
    expect(handlers.replaceMisspelling).toHaveBeenCalledWith('receive');
    (template[2]!.click as () => void)();
    expect(handlers.addToDictionary).toHaveBeenCalledWith('recieve');
    expect(template.find((item) => item.role === 'cut')?.enabled).toBe(false);
    expect(template.find((item) => item.role === 'paste')?.enabled).toBe(true);
  });

  it('says so when there are no spelling guesses', () => {
    const template = contextMenuTemplate(
      { ...base, isEditable: true, misspelledWord: 'qzxv' },
      actions(),
    );
    expect(template[0]).toMatchObject({ label: 'No Guesses Found', enabled: false });
  });

  it('offers Look Up, Copy Link and Copy for selected text in a reply', () => {
    const handlers = actions();
    const template = contextMenuTemplate(
      {
        ...base,
        selectionText: 'photosynthesis',
        linkURL: 'https://example.com/a',
        editFlags: { ...base.editFlags, canCopy: true },
      },
      handlers,
    );
    expect(template.map((item) => item.label ?? item.role ?? item.type)).toEqual([
      'Look Up “photosynthesis”',
      'Copy Link',
      'separator',
      'copy',
      'selectAll',
    ]);
    (template[1]!.click as () => void)();
    expect(handlers.copyLink).toHaveBeenCalledWith('https://example.com/a');
  });

  it('shows nothing on plain text, and never offers unsafe links', () => {
    expect(contextMenuTemplate(base, actions())).toEqual([]);
    expect(contextMenuTemplate({ ...base, linkURL: 'javascript:alert(1)' }, actions())).toEqual(
      [],
    );
    const { lookUp: _lookUp, ...withoutLookUp } = actions();
    expect(
      contextMenuTemplate({ ...base, selectionText: 'word' }, withoutLookUp).map(
        (item) => item.role,
      ),
    ).toEqual(['copy', 'selectAll']);
  });
});
