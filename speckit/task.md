# Task List

## Active Tasks
- [x] [T-002] **Migrate Historical RFA Data** <!-- id: 11 -->
    - **Type**: Utility / Migration
    - **Priority**: High
    - **Description**: 
        1. Create HTTP function `debugTriggerRfaSync` to trigger update on all RFA docs.
        2. Ensure LINE notification is skipped for this trigger.
    - **Traceability**: [F-003]

- [x] [T-003] **Implement Direct Firebase Storage Upload** <!-- id: 12 -->
    - **Type**: Logic / Refactor
    - **Priority**: High
    - **Description**: 
        1. Refactor `CreateRFAForm.tsx` to upload directly to Firebase Storage using `uploadBytesResumable` instead of using the `/api/rfa/upload-temp-file` route to bypass Vercel's 4.5MB payload limit.
        2. Refactor `RFADetailModal.tsx` to use the same direct upload method.
        3. Ensure the UI shows upload progress and handles errors gracefully.
    - **Traceability**: [F-003]

## Completed Tasks
- [x] [T-001] **Implement RFA Data Sync with Last Update** <!-- id: 10 -->
- [x] **T-004: แก้ไขปัญหา 404 File URL**
    - [x] สร้าง Helper function `getFileUrl` สำหรับจัดการ Path ของไฟล์ให้รองรับทั้ง Emulator เครื่อง local และ Production CDN
    - [x] นำ `getFileUrl` และ Firebase `getDownloadURL()` ไปใช้แทนการ Hardcode `cdnUrlBase` ใน Component ฝั่ง Frontend ทั้ง 4 จุด (`CreateRFAForm`, `RFADetailModal`, `CreateWorkRequestForm`, `WorkRequestDetailModal`)
    - [x] นำ `getFileUrl` ไปแก้ไขแทนที่ `cdnUrlBase` ในไฟล์ API ทั้ง 4 จุด (`api/rfa/[id]/route`, `api/rfa/create/route`, `api/work-request/[id]/update/route`, `api/work-request/create/route`)
- [x] Check `git status` for all staged files <!-- id: 0 -->
- [x] Review `.gitignore` for missing exclusions <!-- id: 1 -->
- [x] Identify unwanted build artifacts (e.g., `.firebase`, `.next`) <!-- id: 2 -->
- [x] Identify log files (e.g., `firebase-debug.log`) <!-- id: 3 -->
- [x] Scan suspicious files for credentials <!-- id: 4 -->
- [x] Advise user on what to unstage and add to `.gitignore` <!-- id: 5 -->
- [x] Update `.gitignore` to exclude `.firebase/` and `*.log` <!-- id: 6 -->
- [x] Reset git staging area <!-- id: 7 -->
- [x] Re-stage valid files <!-- id: 8 -->
- [x] Verify final git status <!-- id: 9 -->
