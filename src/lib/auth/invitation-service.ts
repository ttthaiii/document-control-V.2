import { adminAuth, adminDb } from '../firebase/admin';
import { randomBytes } from 'crypto';
import { Role } from '@/lib/config/workflow';
import { FieldValue } from 'firebase-admin/firestore';

export interface CreateInvitationData {
  email: string;
  role: Role;
  sites: string[];
  name: string;       // 👈 เพิ่ม
  employeeId: string; // 👈 เพิ่ม
}

interface InvitationData extends CreateInvitationData {
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
  createdByAdmin: boolean;
}

export class InvitationService {
  // 1. Create invitation: บันทึก name/employeeId ลง Firestore
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

      // Use environment variable if available, or fallback to localhost in development, otherwise use the production URL
      const isDev = process.env.NODE_ENV === 'development';
      const domain = process.env.NEXT_PUBLIC_APP_URL || (isDev ? 'http://localhost:3000' : 'https://ttsdocumentcontrol.web.app');

      const invitationUrl = `${domain}/accept-invitation?token=${token}`;

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

  // 2. Accept invitation: ดึง name/employeeId มาสร้าง User Profile
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

      // สร้าง User Authentication (ตั้ง Display Name ให้เลย)
      const userRecord = await adminAuth.createUser({
        email: invitation.email,
        password: password,
        emailVerified: true,
        displayName: invitation.name, // 👈 ตั้งชื่อใน Auth
      });

      const sitesToStore = Array.isArray(invitation.sites) ? invitation.sites : [invitation.sites].filter(Boolean);

      // สร้าง User Profile ใน Firestore พร้อม Name/ID
      await adminDb.collection('users').doc(userRecord.uid).set({
        email: invitation.email,
        name: invitation.name || '',             // 👈 บันทึกชื่อ
        employeeId: invitation.employeeId || '', // 👈 บันทึกรหัสพนักงาน
        role: invitation.role,
        sites: sitesToStore,
        status: 'ACTIVE',
        createdFromInvitation: true,
        acceptedAt: new Date(),
      });

      // เพิ่ม User เข้า Site Members
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
      if (!invitationDoc.exists) return { success: false, error: 'Invalid invitation' };
      const invitation = invitationDoc.data()!;
      return {
        success: true,
        invitation: {
          email: invitation.email,
          name: invitation.name, // 👈 ส่งกลับไปโชว์หน้า Accept
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