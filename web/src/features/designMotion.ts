import { useCallback } from 'react';

const observers = new Map<boolean, IntersectionObserver>();

function viewportObserver(trackVisibility: boolean) {
  const existing = observers.get(trackVisibility);
  if (existing) return existing;
  const observer = new IntersectionObserver((entries, currentObserver) => {
    for (const { target, isIntersecting } of entries) {
      if (trackVisibility) target.classList.toggle('is-visible', isIntersecting);
      if (!isIntersecting) continue;
      target.classList.add('is-revealed');
      if (!trackVisibility) currentObserver.unobserve(target);
    }
  }, { threshold: 0.12 });
  observers.set(trackVisibility, observer);
  return observer;
}

export function useRevealOnView<T extends Element>(trackVisibility = false) {
  return useCallback((node: T | null) => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (!trackVisibility && node.classList.contains('is-revealed')) return;
    const observer = viewportObserver(trackVisibility);
    observer.observe(node);
    return () => observer.unobserve(node);
  }, [trackVisibility]);
}
