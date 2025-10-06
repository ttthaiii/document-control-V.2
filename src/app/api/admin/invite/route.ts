import { NextRequest, NextResponse } from 'next/server';
import { InvitationService } from '@/lib/auth/invitation-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, role, sites } = await request.json();

    // Basic validation
    if (!email || !role || !sites) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create invitation
    const result = await InvitationService.createInvitation({
      email,
      role,
      sites,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in invite API:', error);
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}