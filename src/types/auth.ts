export interface User {
  id: string;
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM' | 'Admin' | 'ME' | 'SN';
  sites: string[];
  status: 'ACTIVE' | 'DISABLED';
  createdFromInvitation?: boolean;
  createdAt: Date;
  acceptedAt?: Date;
}

export interface Invitation {
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM';
  sites: string[];
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

export interface InvitationResult {
  success: boolean;
  token?: string;
  invitationUrl?: string;
  expiresAt?: Date;
  error?: string;
}