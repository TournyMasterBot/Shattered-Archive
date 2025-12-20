// apps/game-client/src/hooks/useVisualViewportHeight.ts
import { useEffect } from 'react';

export function useVisualViewportHeight(): void {
  useEffect(() => {
    const set = () => {
      const vv = window.visualViewport;

      // visualViewport is best on mobile; fallback to innerHeight
      const h = Math.round(vv?.height ?? window.innerHeight);

      // Use a px var so iOS Safari behaves consistently
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };

    set();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', set);
      vv.addEventListener('scroll', set); // iOS can change vv on scroll too
    }
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', set);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', set);
        vv.removeEventListener('scroll', set);
      }
      window.removeEventListener('resize', set);
      window.removeEventListener('orientationchange', set);
    };
  }, []);
}
