// Core types for ttsdoc-v2
import { Role } from '@/lib/config/workflow';

export interface User {
  id: string;
  email: string;
  name?: string;
  employeeId?: string; 
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
  name?: string;
  employeeId?: string;
  role: Role;
  sites: string[];
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

export interface Site {
  id: string;
  name: string;
  description?: string;
  members: SiteMember[];
  createdAt: Date;
}

export interface SiteMember {
  userId: string;
  role: Role;
  joinedAt: Date;
}