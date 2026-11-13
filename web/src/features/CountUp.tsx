import { useCallback, useState, type ComponentPropsWithoutRef } from 'react';

type CountUpProps = {
  value: number;
  format: (value: number) => string;
};

function useCountUp<T extends Element>({ value, format }: CountUpProps, observeParent = false) {
  const [frame, setFrame] = useState<{ target: number; value: number }>();
  const ref = useCallback((node: T | null) => {
    const target = observeParent ? node?.parentElement : node;
    if (!target || !Number.isFinite(value) || value === 0 || typeof IntersectionObserver === 'undefined' || !window.matchMedia) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    let request: number | undefined;
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const progress = Math.min((time - start) / 600, 1);
      if (progress === 1) {
        setFrame(undefined);
        return;
      }
      setFrame({ target: value, value: value * (1 - (1 - progress) ** 2) });
      request = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      request = requestAnimationFrame(tick);
    }, { threshold: 0.12 });
    const cancel = () => {
      observer.disconnect();
      if (request !== undefined) cancelAnimationFrame(request);
    };
    const onPreferenceChange = () => {
      if (!reducedMotion.matches) return;
      cancel();
      setFrame(undefined);
    };
    setFrame({ target: value, value: 0 });
    observer.observe(target);
    reducedMotion.addEventListener('change', onPreferenceChange);
    return () => {
      cancel();
      reducedMotion.removeEventListener('change', onPreferenceChange);
    };
  }, [value, observeParent]);

  const final = format(value);
  const visible = frame?.target === value ? format(frame.value) : final;
  return { ref, visible, final };
}

export function CountUp(props: CountUpProps) {
  const { ref, visible, final } = useCountUp<HTMLSpanElement>(props);
  return <span ref={ref}>{visible === final ? final : <>
    <span aria-hidden="true">{visible}</span>
    <span className="visually-hidden">{final}</span>
  </>}</span>;
}

export function ChartCountUp({ value, format, ...props }: CountUpProps & Omit<ComponentPropsWithoutRef<'text'>, 'value' | 'format'>) {
  // Match the visibility of the bar row, including labels at the SVG's right edge.
  const { ref, visible } = useCountUp<SVGTextElement>({ value, format }, true);
  return <text {...props} ref={ref} aria-hidden="true">{visible}</text>;
}
