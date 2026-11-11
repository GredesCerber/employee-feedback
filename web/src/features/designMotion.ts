import { useCallback, useEffect, useState } from 'react';

const key = 'feedback:design-motion';

export function useDesignMotion() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(key) !== 'off'; } catch { return true; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (enabled) delete root.dataset.designMotion;
    else root.dataset.designMotion = 'off';
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* the setting still works in this tab */ }
    return () => { delete root.dataset.designMotion; };
  }, [enabled]);
  return { enabled, setEnabled };
}

export function useRevealOnView<T extends Element>(trackVisibility = false) {
  return useCallback((node: T | null) => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (trackVisibility) node.classList.toggle('is-visible', entry.isIntersecting);
      if (!entry.isIntersecting) return;
      node.classList.add('is-revealed');
      if (!trackVisibility) observer.disconnect();
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [trackVisibility]);
}
