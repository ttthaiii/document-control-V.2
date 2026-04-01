import { useEffect } from 'react';

/**
 * Custom hook to lock body scroll when a modal is open.
 *
 * ใช้ position:fixed + top:-scrollY เพื่อ:
 * 1. ป้องกัน scroll ขณะ modal เปิด
 * 2. ไม่ให้หน้าจอ "เด้งขึ้น top" (ซึ่งเกิดเมื่อใช้ overflow:hidden บน html/body)
 * 3. รองรับ nested modals ด้วย reference counting
 *
 * REGRESSION GUARD: ห้ามเปลี่ยนกลับไปใช้แค่ body.style.overflow = 'hidden'
 * เพราะ globals.css มี html, body { height: 100% } ทำให้ scroll reset เป็น 0
 */
export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const body = document.body;

    // Reference counting สำหรับ nested modals
    const currentCount = parseInt(body.getAttribute('data-scroll-locks') || '0', 10);
    const newCount = currentCount + 1;
    body.setAttribute('data-scroll-locks', newCount.toString());

    if (newCount === 1) {
      // จำตำแหน่ง scroll ปัจจุบันไว้ก่อน lock
      const scrollY = window.scrollY;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      // ใช้ position:fixed แทน overflow:hidden เพื่อไม่ให้ scroll position reset
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.width = '100%';
      body.style.overflow = 'hidden';

      // ชดเชย scrollbar width เพื่อป้องกัน layout jump
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      // เก็บ scrollY ไว้ใน attribute เพื่อ restore ตอน unlock
      body.setAttribute('data-scroll-y', scrollY.toString());
    }

    return () => {
      const activeCount = parseInt(body.getAttribute('data-scroll-locks') || '0', 10);
      const updatedCount = Math.max(0, activeCount - 1);
      body.setAttribute('data-scroll-locks', updatedCount.toString());

      if (updatedCount === 0) {
        // ดึงตำแหน่ง scroll เดิมกลับมา
        const savedScrollY = parseInt(body.getAttribute('data-scroll-y') || '0', 10);

        // คืน styles ทั้งหมด
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.overflow = '';
        body.style.paddingRight = '';
        body.removeAttribute('data-scroll-locks');
        body.removeAttribute('data-scroll-y');

        // Restore scroll position ที่ user อยู่ก่อนหน้า
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isLocked]);
}

