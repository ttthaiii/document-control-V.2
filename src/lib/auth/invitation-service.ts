import { adminAuth, adminDb } from '../firebase/admin';
import { randomBytes } from 'crypto';
import { Role } from '@/lib/config/workflow';
// ✅ 1. Import FieldValue
import { FieldValue } from 'firebase-admin/firestore';

export interface CreateInvitationData {
  email: string;
  role: Role;
  sites: string[];
}

export interface InvitationData extends CreateInvitationData {
    status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
    createdAt: Date;
    expiresAt: Date;
    createdByAdmin: boolean;
}

export class InvitationService {
  // Create invitation token (ส่วนนี้เหมือนเดิม)
  static async createInvitation(data: CreateInvitationData) {
    try {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await adminDb.collection('invitations').doc(token).set({
        ...data,
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

  // Accept invitation (✅ แก้ไขส่วนนี้)
  static async acceptInvitation(token: string, password: string) {
    try {
      const invitationDoc = await adminDb.collection('invitations').doc(token).get();
      
      if (!invitationDoc.exists) {
        throw new Error("Invalid or expired invitation token.");
      }
      
      const invitation = invitationDoc.data() as InvitationData;

      if (invitation.status !== 'PENDING') {
         throw new Error("Invitation has already been used or expired.");
      }
      
      // 1. สร้าง User Authentication
      const userRecord = await adminAuth.createUser({
        email: invitation.email,
        password: password,
        emailVerified: true,
      });

      const sitesToStore = Array.isArray(invitation.sites) ? invitation.sites : [invitation.sites].filter(Boolean);

      // 2. สร้าง User Profile ใน Firestore
      await adminDb.collection('users').doc(userRecord.uid).set({
        email: invitation.email,
        role: invitation.role,
        sites: sitesToStore,
        status: 'ACTIVE',
        createdFromInvitation: true,
        acceptedAt: new Date(),
      });

      // ✅✅✅ 3. เพิ่ม User ID เข้าไปใน Field 'members' ของทุก Site ที่เกี่ยวข้อง ✅✅✅
      // เพื่อให้มองเห็น Sidebar
      if (sitesToStore.length > 0) {
        const updatePromises = sitesToStore.map(siteId => 
            adminDb.collection('sites').doc(siteId).update({
                members: FieldValue.arrayUnion(userRecord.uid)
            }).catch(err => {
                console.error(`Warning: Failed to add user to site ${siteId}`, err);
            })
        );
        await Promise.all(updatePromises);
      }
      // ✅✅✅ จบส่วนที่เพิ่ม ✅✅✅

      // 4. อัปเดตสถานะคำเชิญ
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

  // Get invitation details (ส่วนนี้เหมือนเดิม)
  static async getInvitation(token: string) {
    try {
      const invitationDoc = await adminDb.collection('invitations').doc(token).get();
      
      if (!invitationDoc.exists) {
        return { success: false, error: 'Invalid invitation' };
      }

      const invitation = invitationDoc.data()!;
      
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