# Infrastructure

## Tech Stack (เทคโนโลยีที่ใช้)
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Mantine (@mantine/core)
- **State Management:** React Hooks / Context
- **Database:** Firebase (Firestore)
- **Tools/Libraries:** 
  - `firebase`: Firebase SDK
  - `react-hook-form`: Form handling
  - `zod`, `@hookform/resolvers`: Validation
  - `jspdf`, `pdf-lib`: PDF generation/manipulation
  - `fabric`: Canvas/Image manipulation
  - `recharts`: Charting/Data visualization

## Folder Structure (โครงสร้างไฟล์)
```text
ttsdoc-v2/
├── public/                 # Static assets (icons, pdfjs, etc.)
├── scripts/                # Utility scripts (init-firestore, dump-data, etc.)
├── speckit/                # Project documentation (Speckit)
├── src/
│   ├── app/                # Next.js App Router pages & API
│   │   ├── (auth)/         # Authentication routes
│   │   ├── admin/          # Admin dashboard
│   │   ├── api/            # Backend API routes
│   │   ├── dashboard/      # Main user dashboard
│   │   ├── rfa/            # Request for Approval feature
│   │   ├── work-request/   # Work Request feature
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Landing/Redirect
│   ├── components/         # Reusable UI components
│   ├── lib/                # Utilities & Configurations
│   │   ├── auth/           # Auth utilities
│   │   ├── context/        # React Context providers
│   │   ├── firebase/       # Firebase config
│   │   └── utils/          # General helper functions
│   └── types/              # TypeScript definitions
├── .env.local              # Local environment variables
├── next.config.mjs         # Next.js configuration
├── package.json            # Dependencies & Scripts
└── tailwind.config.ts      # Tailwind configuration
```
