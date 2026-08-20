"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth/useAuth';

export default function CampaignPopup() {
  const { user } = useAuth();
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    // แสดงเฉพาะเมื่อ user ล็อกอินแล้ว
    if (!user) return;

    // ตรวจสอบว่าผู้ใช้กด "ไม่ต้องแสดงหน้านี้อีก" ไปแล้วหรือยัง
    const isDismissed = localStorage.getItem('hideCampaignPopup_12_15_May_2026');
    if (isDismissed) return;

    // ตรวจสอบช่วงวันที่ 12/05/2026 ถึง 15/05/2026
    const now = new Date();
    const startDate = new Date('2026-05-12T00:00:00');
    const endDate = new Date('2026-05-15T23:59:59');

    if (now >= startDate && now <= endDate) {
      setShowPopup(true);
    }
  }, [user]);

  const handleClose = () => {
    setShowPopup(false);
  };

  const handleDoNotShowAgain = () => {
    localStorage.setItem('hideCampaignPopup_12_15_May_2026', 'true');
    setShowPopup(false);
  };

  if (!showPopup) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* Main Image Container */}
        {/* กำหนด aspect ratio หรือความสูงให้พอดีกับรูปของคุณ */}
        <div className="relative w-full aspect-[4/5] sm:aspect-square bg-gray-100">
          <Image 
            src="/popup/popup-rev.png" 
            alt="Feature Update" 
            fill 
            className="object-contain sm:object-cover"
            priority
          />
          
          {/* ปุ่มโปร่งใสสำหรับกดไปยังลิงก์ Canva 
              สามารถปรับแต่งค่า bottom, left, right, height ให้ตรงกับตำแหน่งข้อความในรูปได้ 
          */}
          <a 
            href="https://www.canva.com/design/DAHC8rcDbkE/EC2MQNlVFXCo5BSVUkwyGQ/view?utm_content=DAHC8rcDbkE&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h2a464a90cc#19"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-[10%] left-[15%] right-[15%] h-[15%] bg-transparent z-10 cursor-pointer hover:bg-white/10 transition-colors rounded-lg"
            aria-label="ดูวิธีการใช้งาน คลิกที่นี่"
            title="ดูวิธีการใช้งาน"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center p-4 bg-gray-50 border-t">
          <button 
            onClick={handleDoNotShowAgain}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline decoration-transparent hover:decoration-gray-700"
          >
            ไม่ต้องแสดงหน้านี้อีก
          </button>
          <button 
            onClick={handleClose}
            className="px-6 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
