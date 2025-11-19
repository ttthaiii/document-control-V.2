importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// 1. Config เดียวกับในไฟล์ .env ของคุณ (แต่ต้อง Hardcode ลงในนี้เพราะ Service Worker อ่าน .env ไม่ได้)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_FROM_ENV", // ⚠️ ก๊อปปี้จาก .env มาใส่ตรงนี้
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID", // ⚠️ สำคัญมาก
  appId: "YOUR_APP_ID",
};

// 2. Initialize Firebase ใน Background
firebase.initializeApp(firebaseConfig);

// 3. รับข้อความแจ้งเตือน (Background Message Handler)
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // ✅ แก้การดึงค่า: ดึงจาก payload.data แทน
  const notificationTitle = payload.data.title; 
  const notificationOptions = {
    body: payload.data.body, // ดึงจาก data
    icon: '/favicon.ico',
    data: payload.data // ส่ง object data ต่อไปให้ event click
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 4. จัดการเมื่อ User กดที่ Notification
self.addEventListener('notificationclick', function(event) {
  console.log('Notification Clicked', event);
  event.notification.close(); // ปิด popup

  // สั่งให้เปิด Browser ไปยัง URL ที่แนบมา
  const urlToOpen = event.notification.data?.url || '/dashboard'; // ถ้าไม่มี url ให้ไปหน้า Dashboard

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // ถ้าเปิด Tab ไว้อยู่แล้ว ให้ Focus ไปที่ Tab นั้น
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // ถ้ายังไม่เปิด ให้เปิด Tab ใหม่
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});