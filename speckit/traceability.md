# Traceability Matrix (ตารางความเชื่อมโยง)

## 1. RTM (Requirement Traceability Matrix)
**การจับคู่ระหว่าง Feature, Task และไฟล์ที่เกี่ยวข้อง**

| Feature ID | Task ID | Related File Paths | Note/Description |
| :--- | :--- | :--- | :--- |
| F-001 | T-001 | `src/app/(auth)/login/page.tsx` | Authentication Page |
| F-001 | T-001 | `src/lib/firebase/context.tsx` | Auth Context (Example) |
| F-002 | T-001 | `src/app/dashboard/page.tsx` | Dashboard Main View |

## 2. Data / Variable / Component Traceability
**การจับคู่ระหว่าง Entity/Concept และ Code ที่นำไปใช้จริง**

| Entity / Concept | Type | Code Variable / Component | File Location | Linked To |
| :--- | :--- | :--- | :--- | :--- |
| User Profile | Interface | `UserProfile` | `src/types/user.ts` | F-001, F-005 |
| RFA Document | Interface | `RFADocument` | `src/types/rfa.ts` | F-003 |
