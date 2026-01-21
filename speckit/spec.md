# Specifications (ข้อกำหนด)

## Feature: [F-001] Authentication
**Concept:** ระบบยืนยันตัวตนสำหรับเข้าใช้งาน (Login/Logout)

### 1. User Flow
1. User เข้าถึงหน้าเว็บ -> ระบบตรวจสอบสถานะ Login
2. หากยังไม่ Login -> Redirect ไปหน้า Login
3. User กรอก Credentials หรือเลือก Provider
4. หากสำเร็จ -> Redirect ไป Dashboard
5. หาก User กด Logout -> กลับไปหน้า Login

### 2. Architecture
- **Component Structure:** `src/app/(auth)/login`, `src/app/page.tsx` (Guard)
- **Logic Flow:** ใช้ `onAuthStateChanged` จาก Firebase Auth
- **External Dependencies:** Firebase Auth

---

## Feature: [F-002] Dashboard
**Concept:** หน้าหลักแสดงภาพรวมและการเข้าถึงเมนูต่างๆ

### 1. User Flow
1. User เข้ามาที่ `/dashboard`
2. ระบบแสดงรายการเมนูหลัก (RFA, Work Request, etc.)
3. แสดงสถานะงานล่าสุด หรือข้อมูลสรุป

### 2. Architecture
- **Component Structure:** `src/app/dashboard`, `src/components/layout/AppShell` (สมมติ)
- **Logic Flow:** Fetch ข้อมูลสรุปจาก Firestore
- **External Dependencies:** Firestore

---

## Feature: [F-003] RFA (Request for Approval)
**Concept:** ระบบขออนุมัติเอกสาร

### 1. User Flow
1. User เข้าเมนู RFA
2. เลือกสร้าง RFA ใหม่ หรือดูรายการเก่า
3. กรอกข้อมูลแบบฟอร์ม -> Submit
4. ระบบบันทึกสถานะเป็น "รออนุมัติ"

### 2. Architecture
- **Component Structure:** `src/app/rfa`
- **Logic Flow:** Create/Read/Update เอกสารใน Collection `rfa`
- **External Dependencies:** Firestore, Storage (ไฟล์แนบ)

---

## Feature: [F-004] Work Request
**Concept:** ระบบแจ้งงาน/ใบสั่งงาน

### 1. User Flow
1. User เข้าเมนู Work Request
2. สร้าง Request ใหม่
3. ระบุรายละเอียดงาน

### 2. Architecture
- **Component Structure:** `src/app/work-request`
- **Logic Flow:** CRUD Operation กับ Collection `work_requests`

---

## Feature: [F-005] Admin
**Concept:** จัดการผู้ใช้งานและการตั้งค่า (สำหรับ Admin)

### 1. User Flow
1. Admin เข้าเมนู Admin
2. จัดการ Users (Invite, Disable)
3. ดู System Logs

### 2. Architecture
- **Component Structure:** `src/app/admin`
- **Logic Flow:** Check Role (Admin Only), Firebase Admin SDK
