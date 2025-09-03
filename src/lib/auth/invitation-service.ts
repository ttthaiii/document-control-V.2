import { adminAuth, adminDb } from '../firebase/admin';
import { randomBytes } from 'crypto';

export interface CreateInvitationData {
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM';
  sites: string[];
}

// ✅ 1. Define the missing InvitationData type
// This should match the data structure in your 'invitations' collection
export interface InvitationData extends CreateInvitationData {
    status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
    createdAt: Date;
    expiresAt: Date;
    createdByAdmin: boolean;
}


export class InvitationService {
  // Create invitation token
  static async createInvitation(data: CreateInvitationData) {
    try {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await adminDb.collection('invitations').doc(token).set({
        ...data, // Use spread operator for cleaner code
        status: 'PENDING',
        createdAt: new Date(),
        expiresAt: expiresAt,
        createdByAdmin: true,
      });

      const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invitation?token=${token}`;
      
      return {
        success: true,
        token,
        invitationUrl,
        expiresAt,
      };

    } catch (error) {
      console.error('Error creating invitation:', error);
      throw new Error('Failed to create invitation');
    }
  }

  // Accept invitation
  static async acceptInvitation(token: string, password: string) {
    try {
      const invitationDoc = await adminDb.collection('invitations').doc(token).get();
      
      // ✅ 2. Add a check to ensure the invitation exists
      if (!invitationDoc.exists) {
        throw new Error("Invalid or expired invitation token.");
      }
      
      const invitation = invitationDoc.data() as InvitationData;

      // You can add more checks here (e.g., if status is not 'PENDING')
      
      const userRecord = await adminAuth.createUser({
        email: invitation.email,
        password: password,
        emailVerified: true,
      });

      const sitesToStore = Array.isArray(invitation.sites) ? invitation.sites : [invitation.sites].filter(Boolean);

      await adminDb.collection('users').doc(userRecord.uid).set({
        email: invitation.email,
        role: invitation.role,
        sites: sitesToStore,
        status: 'ACTIVE',
        createdFromInvitation: true,
        acceptedAt: new Date(),
      });

      await adminDb.collection('invitations').doc(token).update({
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedBy: userRecord.uid,
      });

      return {
        success: true,
        userId: userRecord.uid,
        message: 'Account created successfully! You can now login.',
      };

    } catch (error) {
      console.error('Error accepting invitation:', error);
      throw error;
    }
  }

  // Get invitation details
  static async getInvitation(token: string) {
    try {
      const invitationDoc = await adminDb.collection('invitations').doc(token).get();
      
      if (!invitationDoc.exists) {
        return { success: false, error: 'Invalid invitation' };
      }

      const invitation = invitationDoc.data()!; // Using '!' asserts that data exists
      
      return {
        success: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toDate(),
        },
      };

    } catch (error) {
      console.error('Error getting invitation:', error);
      return { success: false, error: 'Failed to get invitation' };
    }
  }
}