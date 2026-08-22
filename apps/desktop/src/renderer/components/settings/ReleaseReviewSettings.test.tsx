// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../../demo';
import type { RendererSnapshot } from '../../types';
import { ReleaseReviewSettings } from './ReleaseReviewSettings';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function adminSnapshot(): RendererSnapshot {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.cloudAuth = {
    state: 'signed-in',
    email: 'admin@example.com',
    admin: true,
    adminMfa: true,
    features: {
      researchUploads: true,
      researchArchive: true,
      connectors: true,
      schedules: true,
    },
  };
  return snapshot;
}

describe('release review settings', () => {
  it('shows live signals and routes to the relevant review surface', () => {
    const onOpenPrivacy = vi.fn();
    const onOpenVoice = vi.fn();
    const onOpenArchive = vi.fn();

    render(
      <ReleaseReviewSettings
        snapshot={adminSnapshot()}
        onOpenPrivacy={onOpenPrivacy}
        onOpenVoice={onOpenVoice}
        onOpenArchive={onOpenArchive}
      />,
    );

    expect(screen.getByText('Admin access')).toBeTruthy();
    expect(screen.getByText('Research capture')).toBeTruthy();
    expect(screen.getByText('Voice')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review voice' }));

    expect(onOpenArchive).toHaveBeenCalledOnce();
    expect(onOpenPrivacy).toHaveBeenCalledOnce();
    expect(onOpenVoice).toHaveBeenCalledOnce();
  });

  it('persists operator checks locally and can reset them', () => {
    const props = {
      snapshot: adminSnapshot(),
      onOpenPrivacy: vi.fn(),
      onOpenVoice: vi.fn(),
    };
    const view = render(<ReleaseReviewSettings {...props} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Admin archive flow/ }));
    expect(screen.getByText('1 of 7 verified')).toBeTruthy();
    expect(window.localStorage.getItem('sia.alpha-release-review.v1')).toContain(
      'archive-flow',
    );

    view.unmount();
    render(<ReleaseReviewSettings {...props} />);
    expect(screen.getByText('1 of 7 verified')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('0 of 7 verified')).toBeTruthy();
    expect(window.localStorage.getItem('sia.alpha-release-review.v1')).toBeNull();
  });
});
