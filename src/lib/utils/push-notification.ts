import { adminMessaging, adminDb } from '@/lib/firebase/admin';
import { FieldPath } from 'firebase-admin/firestore';

interface NotificationPayload {
  title: string;
  body: string;
  url?: string; // ลิงก์ที่จะให้เด้งไปตอนกด
}

// ฟังก์ชันรับ User ID หลายคน แล้วส่ง Noti ไปหาทุกเครื่องของคนเหล่านั้น
export async function sendPushNotification(userIds: string[], payload: NotificationPayload) {
  if (!userIds || userIds.length === 0) return;

  try {
    console.log(`🔔 Preparing to send notification to ${userIds.length} users...`);

    // 1. ดึง Token ของทุกคนจาก Database (ใช้ getAll เพื่อความเร็ว)
    // หมายเหตุ: Firestore getAll รองรับ document ได้จำนวนจำกัด ถ้า user เยอะมากต้องแบ่ง chunk (แต่น้อยกว่า 100 คนวิธีนี้เร็วสุด)
    const userRefs = userIds.map(id => adminDb.collection('users').doc(id));
    const userDocs = await adminDb.getAll(...userRefs);

    // 2. รวบรวม FCM Tokens ทั้งหมดที่มี
    let allTokens: string[] = [];
    
    userDocs.forEach(doc => {
      if (doc.exists) {
        const data = doc.data();
        if (data?.fcmTokens && Array.isArray(data.fcmTokens)) {
          allTokens.push(...data.fcmTokens);
        }
      }
    });

    // กรอง Token ซ้ำ และค่าว่าง
    allTokens = [...new Set(allTokens)].filter(t => t);

    if (allTokens.length === 0) {
      console.log('⚠️ No registered devices found for these users.');
      return;
    }

    // 3. สร้างข้อความ
    const message = {
      // ✅ ใส่ notification กลับมา (เพื่อให้ iOS ยอมแสดงผล)
      notification: {
        title: payload.title,
        body: payload.body,
      },
      // ✅ ใส่ data ไว้เหมือนเดิม (เพื่อส่ง URL หรือข้อมูลอื่นๆ)
      data: {
        title: payload.title,
        body: payload.body,
        url: payload.url || '/dashboard',
        click_action: payload.url || '/dashboard', // ใส่เผื่อไว้สำหรับบาง Browser
      },
      tokens: allTokens, 
    };

    // 4. ส่งข้อความ (ใช้ sendEachForMulticast แทน sendMulticast ที่เก่าแล้ว)
    const response = await adminMessaging.sendEachForMulticast(message);
    
    console.log(`✅ Sent ${response.successCount} messages successfully.`);

    // 5. (Optional) ลบ Token ที่เสียแล้วทิ้ง (Clean up)
    if (response.failureCount > 0) {
      console.log(`❌ Failed to send ${response.failureCount} messages.`);
      // ในการใช้งานจริง คุณอาจจะเขียน Logic ลบ Token ที่ error ออกจาก DB ตรงนี้ได้
    }

  } catch (error) {
    console.error('🔥 Error sending push notification:', error);
  }
}