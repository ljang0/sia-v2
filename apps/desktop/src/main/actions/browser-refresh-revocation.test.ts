import { expect, it } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, request } from './test-support.js';

it.each(['failed capture', 'refused capture', 'sensitive destination'])(
  'requires fresh attached-browser controls after %s',
  async (scenario) => {
    let failure = false;
    const url = 'https://public.example/guide';
    const cua = fakeCua(async (tool) => {
      if (tool === 'browser_click') return { effect: 'confirmed' };
      if (tool !== 'get_browser_state') throw new Error(`Unexpected tool ${tool}`);
      if (failure && scenario === 'failed capture') throw new Error('Capture unavailable');
      if (failure && scenario === 'refused capture')
        return { error_code: 'browser_tab_not_found' };
      return {
        target_id: 'target',
        tab_id: 'tab',
        url:
          failure && scenario === 'sensitive destination'
            ? `${url}?token=synthetic-private-token`
            : url,
        elements: [{ ref: 'read-more', role: 'link', label: 'Read more' }],
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({ target_id: 'target', tab_id: 'tab', url });
    const capture = () => backend.invoke(request('browser_snapshot', { tab_id: 'tab' }));
    const first = await capture();
    expect(first.outcome).toBe('verified');
    const data = dataRecord(first.data);
    const element = (data.elements as { element_ref: string }[])[0]!;
    failure = true;
    expect((await capture()).outcome).not.toBe('verified');
    failure = false;
    expect(
      (
        await backend.invoke(
          request('browser_action', {
            tab_id: 'tab',
            snapshot_id: data.snapshot_id,
            element_ref: element.element_ref,
            action: 'click',
          }),
        )
      ).outcome,
    ).toBe('stale');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(false);
    const recovered = await capture();
    expect(recovered.outcome).toBe('verified');
    expect(dataRecord(recovered.data).snapshot_id).not.toBe(data.snapshot_id);
  },
);
