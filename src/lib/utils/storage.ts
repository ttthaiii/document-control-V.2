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
        const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'ttsdocumentcontrol.appspot.com';
        // Firebase Storage Emulator requires the full path to be URL-encoded, including slashes (%2F)
        return `http://127.0.0.1:9199/v0/b/${bucket}/o/${encodeURIComponent(destinationPath)}?alt=media`;
    }

    const cdnUrlBase = "https://ttsdoc-cdn.ttthaiii30.workers.dev";
    // The Cloudflare Worker handles regular slashes
    return `${cdnUrlBase}/${destinationPath}`;
}
