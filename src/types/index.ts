// src/types/index.ts
import { Role } from '@/lib/config/workflow';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: Role;
  sites: string[];
  status: 'ACTIVE' | 'PENDING_FIRST_LOGIN' | 'DISABLED';
  mustChangePassword?: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  sites: string[];
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

export interface RoleSettings {
  RFA: {
    create_shop: Role[];
    create_gen: Role[];
    create_mat: Role[];
    review: Role[];
    approve: Role[];
  };
  WORK_REQUEST: {
    create: Role[];
    approve_draft: Role[];
    execute: Role[];
    inspect?: Role[]; // เพิ่ม inspect ให้ตรงกับ Code
  };
}

// ✅ 1. เพิ่ม Interface สำหรับ User Overrides
export interface UserPermissionOverride {
  [userId: string]: {           // Key เป็น User ID
    [module: string]: {         // 'RFA' | 'WORK_REQUEST'
      [action: string]: boolean // true = ให้สิทธิ์พิเศษ, false = ยึดสิทธิ์คืน
    }
  }
}

export interface Site {
  id: string;
  name: string;
  description?: string;
  members: SiteMember[];
  createdAt: Date;
  roleSettings?: RoleSettings;
  userOverrides?: UserPermissionOverride; // 👈 ✅ 2. เพิ่ม Field นี้ใน Site
}

export interface SiteMember {
  userId: string;
  role: Role;
  joinedAt: Date;
}