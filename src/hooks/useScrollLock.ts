import { useEffect } from 'react';

/**
 * Custom hook to lock body scroll when a modal is open.
 * Targets BOTH html and body to handle all browser scroll behaviors.
 * Uses reference counting to safely handle nested/stacked modals.
 */
export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const html = document.documentElement;
    const body = document.body;

    // Increment lock count
    const currentCount = parseInt(body.getAttribute('data-scroll-locks') || '0', 10);
    const newCount = currentCount + 1;
    body.setAttribute('data-scroll-locks', newCount.toString());

    // Lock scroll if this is the first lock
    if (newCount === 1) {
      // Measure scrollbar width BEFORE hiding to avoid layout shift
      const scrollbarWidth = window.innerWidth - html.clientWidth;

      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';

      // Compensate for scrollbar disappearing to prevent layout jump
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    // Cleanup
    return () => {
      const activeCount = parseInt(body.getAttribute('data-scroll-locks') || '0', 10);
      const updatedCount = Math.max(0, activeCount - 1);
      body.setAttribute('data-scroll-locks', updatedCount.toString());

      if (updatedCount === 0) {
        html.style.overflow = '';
        body.style.overflow = '';
        body.style.paddingRight = '';
        body.removeAttribute('data-scroll-locks');
      }
    };
  }, [isLocked]);
}

