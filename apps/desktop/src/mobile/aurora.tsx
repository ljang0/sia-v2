import { useEffect, useState } from 'react';

/** Decorative, compositor-animated light curtains. No canvas, timers, or pointer tracking. */
export function Aurora() {
  const [paused, setPaused] = useState(document.hidden);
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return (
    <div className="phone-aurora" aria-hidden="true" data-paused={paused}>
      <div className="aurora-veil aurora-emerald" />
      <div className="aurora-veil aurora-cyan" />
      <div className="aurora-veil aurora-violet" />
      <div className="aurora-horizon" />
    </div>
  );
}
