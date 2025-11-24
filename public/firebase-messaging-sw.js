importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// 1. Config เดียวกับในไฟล์ .env ของคุณ (แต่ต้อง Hardcode ลงในนี้เพราะ Service Worker อ่าน .env ไม่ได้)
const firebaseConfig = {
  apiKey: "AIzaSyAsayb-DEOBE0zi0qh-dPBfihClgXrX1sY", // ⚠️ ก๊อปปี้จาก .env มาใส่ตรงนี้
  authDomain: "ttsdocumentcontrol.firebaseapp.com",
  projectId: "ttsdocumentcontrol",
  storageBucket: "ttsdocumentcontrol.firebasestorage.app",
  messagingSenderId: "48440915675", // ⚠️ สำคัญมาก
  appId: "1:48440915675:web:f11611895bfb52d4d27efe",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // 1. ดึงค่าจาก data โดยเฉพาะ (เพราะเราเอา notification ออกแล้ว)
  const notificationTitle = payload.data?.title || 'แจ้งเตือนใหม่';
  const notificationBody = payload.data?.body || '';
  const notificationUrl = payload.data?.url || '/dashboard';

  // 2. Config การแสดงผล
  const notificationOptions = {
    body: notificationBody,
    icon: '/icons/icon-192x192.png', // ⚠️ ตรวจสอบว่ามีไฟล์นี้จริงใน folder public/icons/
    badge: '/icons/icon-192x192.png', // Android ชอบให้มี badge (รูปเล็กๆ สีขาว)
    data: {
        url: notificationUrl // ส่ง url ไปใช้ตอน click
    },
    // เพิ่ม tag เพื่อไม่ให้ noti ซ้อนกันเยอะเกินไป (Optional)
    // tag: 'rfa-notification', 
    renotify: true,
    interaction: true // บังคับให้ browser แสดงจนกว่า user จะกด (ช่วยแก้ปัญหา noti หายไว)
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  console.log('Notification Clicked', event);
  event.notification.close();

  // ดึง URL จาก data ที่เรายัดไว้ข้างบน
  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // ถ้ามีหน้าต่างเปิดอยู่ ให้ focus
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus().then(focusedClient => {
              // ถ้าต้องการ refresh ข้อมูลด้วย อาจจะ postMessage ไปบอก Client ได้
              // focusedClient.navigate(urlToOpen); 
              return focusedClient;
          });
        }
      }
      // ถ้าไม่มี ให้เปิดหน้าใหม่
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});