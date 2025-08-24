import { NextRequest, NextResponse } from 'next/server';
import { InvitationService } from '@/lib/auth/invitation-service';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Missing token or password' },
        { status: 400 }
      );
    }

    const result = await InvitationService.acceptInvitation(token, password);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json(
      { error: error },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 400 }
      );
    }

    const result = await InvitationService.getInvitation(token);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error getting invitation:', error);
    return NextResponse.json(
      { error: 'Failed to get invitation' },
      { status: 500 }
    );
  }
}