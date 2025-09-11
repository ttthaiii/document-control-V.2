// Core types for ttsdoc-v2

export interface User {
  id: string;
  email: string;
  name?: string;
  role: 'BIM' | 'Site Admin' | 'CM' | 'Admin' | 'ME' | 'SN';
  sites: string[];
  status: 'ACTIVE' | 'PENDING_FIRST_LOGIN' | 'DISABLED';
  mustChangePassword?: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface Invitation {
  id: string;
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM';
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
  role: 'BIM' | 'Site Admin' | 'CM';
  joinedAt: Date;
}