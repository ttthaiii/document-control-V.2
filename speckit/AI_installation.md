# เทมเพลตการพัฒนาโปรเจกต์ (Concept Speckit)

เอกสารนี้ใช้เป็นต้นแบบหลัก (Master Template) สำหรับการเริ่มโปรเจกต์และการบริหารจัดการวงจรการพัฒนาตามแนวคิด Speckit โดยใช้กระบวนการคิดแบบ Chain of Thought (CoT) เพื่อให้มั่นใจว่าการวางแผนและการปฏิบัติงานจะครอบคลุมในทุกมิติ

---

## 1. infrastructure.md
**เป้าหมาย (Goal):** กำหนดพื้นฐานทางเทคนิค (Technical Foundation) และโครงสร้างของโปรเจกต์

### ตัวอย่าง Template
```markdown
# Infrastructure

## Tech Stack (เทคโนโลยีที่ใช้)
- **Framework:** [เช่น Next.js, React, Vue]
- **Language:** [เช่น TypeScript, Python]
- **Styling:** [เช่น Tailwind CSS, Vanilla CSS]
- **State Management:** [เช่น Redux, Context API, Zustand]
- **Database:** [เช่น PostgreSQL, MongoDB]
- **Tools/Libraries:** [ระบุไลบรารีสำคัญอื่นๆ]

## Folder Structure (โครงสร้างไฟล์)
```text
root/
├── public/
├── src/
│   ├── app/ (หรือ pages/)
│   ├── components/
│   ├── lib/ (หรือ utils/)
│   ├── services/
│   ├── styles/
│   └── types/
├── [config files]
└── ...
```
```

---

## 2. spec.md
**เป้าหมาย (Goal):** ระบุรายละเอียดฟีเจอร์ทั้งหมด โดยอ้างอิงด้วย Feature ID (F-XXX)

### ตัวอย่าง Template
```markdown
# Specifications (ข้อกำหนด)

## Feature: [F-XXX] [ชื่อฟีเจอร์]

### 1. User Flow (ขั้นตอนการใช้งาน)
1. [ขั้นตอนที่ 1: การกระทำของผู้ใช้ หรือ Trigger ของระบบ]
2. [ขั้นตอนที่ 2: การประมวลผลของระบบ หรือ การเปลี่ยนแปลง User Interface]
3. [ขั้นตอนที่ 3: ผลลัพธ์ที่ได้]

### 2. Architecture (โครงสร้างการทำงาน)
- **Component Structure:** [ลำดับชั้นของ UI components ที่เกี่ยวข้อง]
- **Logic Flow:** [การไหลของข้อมูลระหว่าง components/services]
- **External Dependencies:** [APIs, databases, หรือบริการ 3rd party ที่ต้องใช้]

### 3. Variables & Data (ตัวแปรและข้อมูล)
- **Key Variables:**
  - `[ชื่อตัวแปร]`: [คำอธิบายและขอบเขตการใช้งาน]
- **Data Models:**
  - `[ชื่อ Model]`: [นิยามโครงสร้างข้อมูล]
```

---

## 3. task.md
**เป้าหมาย (Goal):** แผนการพัฒนาแบบเป็นขั้นเป็นตอน (Step-by-step) โดยระบุ Task ID (T-XXX) อธิบาย "วิธีการ" และ "เหตุผล"

### ตัวอย่าง Template
```markdown
# Task Plan (แผนงาน)

## Phase: [ชื่อเฟสการทำงาน]

### [T-XXX] [ชื่อ Task]
- **Concept (เป้าหมายของงาน):** 
  - [วัตถุประสงค์หลักของงานนี้คืออะไร?]
- **Principle (หลักการออกแบบ):** 
  - [Design patterns, แนวทางปฏิบัติ, หรือหลักการทางตรรกะที่ต้องยึดถือ]
- **Implementation Detail (รายละเอียดการดำเนินการ):**
  1. [ขั้นตอนปฏิบัติที่ 1]
  2. [ขั้นตอนปฏิบัติที่ 2]
  3. [ขั้นตอนปฏิบัติที่ 3]
- **Confirm Task (จุดตรวจสอบ):** 
  - [ ] [เกณฑ์การตรวจสอบที่ 1: ตรวจสอบว่า...]
  - [ ] [เกณฑ์การตรวจสอบที่ 2: ตรวจสอบว่า...]
- **SubTasks (งานย่อย):**
  - [ ] [งานย่อยที่ 1]
  - [ ] [งานย่อยที่ 2]
```

---

## 4. traceability.md
**เป้าหมาย (Goal):** เชื่อมโยงความสัมพันธ์เพื่อวิเคราะห์ผลกระทบ (Impact Analysis) และสำหรบการดูแลรักษา (Maintenance)

### ตัวอย่าง Template
```markdown
# Traceability Matrix (ตารางความเชื่อมโยง)

## 1. RTM (Requirement Traceability Matrix)
**การจับคู่ระหว่าง Feature, Task และไฟล์ที่เกี่ยวข้อง**

| Feature ID | Task ID | Related File Paths | Note/Description |
| :--- | :--- | :--- | :--- |
| F-001 | T-001 | `src/path/to/file.ts` | [คำอธิบายความเชื่อมโยง] |
| F-001 | T-002 | `src/path/to/another.tsx` | |

## 2. Data / Variable / Component Traceability
**การจับคู่ระหว่าง Entity/Concept และ Code ที่นำไปใช้จริง**

| Entity / Concept | Type | Code Variable / Component | File Location | Linked To |
| :--- | :--- | :--- | :--- | :--- |
| [เช่น UserID] | [Variable] | `userId` | `src/store/auth.ts` | F-001, F-002 |
| [เช่น ปุ่ม Login] | [Component] | `LoginButton` | `src/components/ui/Btn.tsx` | F-001 |
```
