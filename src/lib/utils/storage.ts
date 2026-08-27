// src/lib/utils/storage.ts

/**
 * Returns the correct download URL for a file in Firebase Storage.
 *
 * If the application is running in emulator mode, it returns the standard 
 * Firebase Storage emulator REST API URL.
 * Otherwise, it returns the Cloudflare CDN URL.
 *
 * @param destinationPath The path of the file in the bucket (e.g., 'sites/123/rfa/file.pdf')
 * @returns The full URL to access the file
 */
export function getFileUrl(destinationPath: string): string {
    const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

    if (isEmulator) {
        // Serve emulator files through our own server proxy (/api/files) instead of a
        // direct Storage URL. The stored URL for files under `sites/**` carries no
        // download token, so a direct GET is rejected by the Storage rules (403).
        // The proxy reads the file with the Admin SDK, which bypasses those rules —
        // no rule change needed, and it works the same on desktop and phone.
        // Relative URL → resolves to the app's own origin (LAN IP on a phone).
        const encodedPath = destinationPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        return `/api/files/${encodedPath}`;
    }

    const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
    // Encode each path segment to handle spaces, tabs, and special characters properly
    const encodedPath = destinationPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${cdnUrlBase}/${encodedPath}`;
}

/**
 * Normalizes a stored file URL into something viewable in the CURRENT environment.
 *
 * In production this is a no-op (returns the URL as-is — the CDN URL already works).
 *
 * In emulator mode it rewrites any direct Storage-emulator URL (including old data
 * that was stored with a hardcoded `http://127.0.0.1:9199/...?alt=media` host, which
 * has no download token and gets a 403, and also fails outright on a phone because
 * 127.0.0.1 means the phone itself) into the same-origin `/api/files/...` proxy,
 * which the server reads with the Admin SDK. Blob/data URLs and already-proxied URLs
 * are left untouched. Use this wherever a stored fileUrl is opened or previewed.
 *
 * @param fileUrl The stored URL (may be old-format, proxied, blob, or a CDN URL)
 * @param filePath Optional object path fallback (e.g. 'sites/123/rfa/file.pdf')
 */
export function resolveViewUrl(fileUrl?: string | null, filePath?: string | null): string {
    const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
    const url = fileUrl || '';

    if (!isEmulator) return url;

    // Already proxied, or a local preview URL → leave as-is.
    if (url.startsWith('/api/files/')) return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    // A direct Storage URL (any host) contains the object path after `/o/`.
    const match = url.match(/\/o\/([^?]+)/);
    if (match) {
        const objectPath = decodeURIComponent(match[1]); // e.g. 'sites/123/rfa/file.pdf'
        const encoded = objectPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        return `/api/files/${encoded}`;
    }

    // Fallback: build from the object path when we have it.
    if (filePath) {
        const encoded = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        return `/api/files/${encoded}`;
    }

    return url;
}
