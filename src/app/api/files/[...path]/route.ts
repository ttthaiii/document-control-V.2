import { NextRequest, NextResponse } from 'next/server';
import { adminBucket } from '@/lib/firebase/admin';

// Admin SDK needs the Node.js runtime (not Edge).
export const runtime = 'nodejs';

/**
 * Emulator-only file proxy.
 *
 * In production the app serves files through the Cloudflare CDN (see getFileUrl),
 * so this route is DISABLED there and returns 404. It exists purely so that files
 * stored under `sites/**` — whose stored URL is tokenless — can still be read
 * during local/mobile testing: the Admin SDK reads the file from the Storage
 * emulator and bypasses Storage security rules, so no rule change is needed.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Hard guard: only ever serve when running against the emulator.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    return new NextResponse('Not found', { status: 404 });
  }

  // Next.js already URL-decodes each path segment.
  const filePath = params.path.join('/');
  if (!filePath) {
    return new NextResponse('Missing file path', { status: 400 });
  }

  try {
    const file = adminBucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return new NextResponse('File not found', { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    // Buffer → Uint8Array so it satisfies the Web Response BodyInit type.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': metadata.contentType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[api/files] Failed to read "${filePath}":`, message);
    return new NextResponse(`Error reading file: ${message}`, { status: 500 });
  }
}
