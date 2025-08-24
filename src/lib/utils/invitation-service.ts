import { adminAuth, adminDb } from '../firebase/admin';
import { randomBytes } from 'crypto';

export interface CreateInvitationData {
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM';
  sites: string[];
}

// Fix: Add proper type definition
interface InvitationData {
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM';
  sites: string[];
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: any; // Firestore Timestamp
  expiresAt: any; // Firestore Timestamp
  createdByAdmin: boolean;
}

export class InvitationService {
  static async createInvitation(data: CreateInvitationData) {
    try {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await adminDb.collection('invitations').doc(token).set({
        email: data.email,
        role: data.role,
        sites: data.sites,
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

  static async acceptInvitation(token: string, password: string) {
    try {
      const invitationDoc = await adminDb.collection('invitations').doc(token).get();
      
      if (!invitationDoc.exists) {
        throw new Error('Invalid invitation token');
      }

      // Fix: Proper type casting
      const invitation = invitationDoc.data() as InvitationData;
      
      if (invitation.status !== 'PENDING') {
        throw new Error('Invitation already used or expired');
      }

      if (new Date() > invitation.expiresAt.toDate()) {
        throw new Error('Invitation expired');
      }

      const userRecord = await adminAuth.createUser({
        email: invitation.email,
        password: password,
        emailVerified: true,
      });

      await adminDb.collection('users').doc(userRecord.uid).set({
        email: invitation.email,
        role: invitation.role,
        sites: invitation.sites,
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

  static async getInvitation(token: string) {
    try {
      const invitationDoc = await adminDb.collection('invitations').doc(token).get();
      
      if (!invitationDoc.exists) {
        return { success: false, error: 'Invalid invitation' };
      }

      // Fix: Proper type casting
      const invitation = invitationDoc.data() as InvitationData;
      
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