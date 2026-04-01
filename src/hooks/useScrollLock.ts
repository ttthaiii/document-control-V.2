import { useEffect } from 'react';

/**
 * Custom hook to manage body scroll lock correctly across multiple modals.
 * Uses reference counting via data-attributes to prevent race conditions during modal stacking.
 */
export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    // Increment lock count
    const currentCount = parseInt(document.body.getAttribute('data-scroll-locks') || '0', 10);
    const newCount = currentCount + 1;
    document.body.setAttribute('data-scroll-locks', newCount.toString());

    // Lock scroll if this is the first lock
    if (newCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    // Cleanup function
    return () => {
      const activeCount = parseInt(document.body.getAttribute('data-scroll-locks') || '0', 10);
      const updatedCount = Math.max(0, activeCount - 1);
      
      document.body.setAttribute('data-scroll-locks', updatedCount.toString());
      
      // Only unlock if no more locks are active
      if (updatedCount === 0) {
        document.body.style.overflow = '';
        document.body.removeAttribute('data-scroll-locks');
      }
    };
  }, [isLocked]);
}
