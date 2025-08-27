// src/lib/firebase/storage-metadata.ts - FIXED VERSION (use adminBucket)
import { adminBucket } from "./admin";

interface CacheHeaders {
  cacheControl: string;
  contentType: string;
  customMetadata?: Record<string, string>;
}

// ✅ Fixed Firebase File Metadata Type
interface FirebaseFileMetadata {
  name?: string;
  bucket?: string;
  generation?: string;
  metageneration?: string;
  contentType?: string;
  timeCreated?: string;
  updated?: string;
  storageClass?: string;
  size?: string; // Firebase returns size as string
  md5Hash?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  contentLanguage?: string;
  cacheControl?: string;
  metadata?: Record<string, string>; // custom metadata are strings
}

// ✅ Safe Metadata Extraction Utility
class TypeSafeUtils {
  static toString(value: unknown): string {
    if (value === undefined || value === null) return "";
    return String(value);
  }

  static toNumber(value: unknown): number {
    if (value === undefined || value === null) return 0;
    const num = typeof value === "string" ? parseInt(value, 10) : Number(value);
    return isNaN(num) ? 0 : num;
  }
}

class FirebaseStorageMetadata {
  // 🔹 ใช้ bucket ที่กำหนดจาก admin.ts โดยตรง
  private bucket = adminBucket;

  /**
   * Generate cache headers based on file type and size - TYPE SAFE
   */
  generateCacheHeaders(contentType: string, fileSize: number | string): CacheHeaders {
    const safeFileSize = TypeSafeUtils.toNumber(fileSize);
    const safeContentType = TypeSafeUtils.toString(contentType) || "application/octet-stream";

    let cacheControl = "public, max-age=3600"; // default: 1 hour

    // Large construction files (DWG, PDF > 10MB)
    if (safeFileSize > 10 * 1024 * 1024 || this.isConstructionFile(safeContentType)) {
      cacheControl = "public, max-age=2592000, immutable"; // 30 days
    }
    // Images
    else if (safeContentType.startsWith("image/")) {
      cacheControl = "public, max-age=604800"; // 7 days
    }
    // Documents
    else if (this.isDocumentFile(safeContentType)) {
      cacheControl = "public, max-age=86400"; // 24 hours
    }

    return {
      cacheControl,
      contentType: safeContentType,
      customMetadata: {
        fileType: this.getFileCategory(safeContentType, safeFileSize),
        optimizedForCDN: "true",
        fileSizeBytes: safeFileSize.toString(), // store as string
      },
    };
  }

  /**
   * Set metadata for uploaded file - TYPE SAFE
   */
  async setFileMetadata(
    filePath: string,
    contentType: string,
    fileSize: number | string
  ): Promise<void> {
    try {
      const safeContentType = TypeSafeUtils.toString(contentType) || "application/octet-stream";
      const safeFileSize = TypeSafeUtils.toNumber(fileSize);

      const file = this.bucket.file(filePath);
      const headers = this.generateCacheHeaders(safeContentType, safeFileSize);

      await file.setMetadata({
        contentType: headers.contentType,
        cacheControl: headers.cacheControl,
        metadata: headers.customMetadata, // all values are strings
      });

      console.log(`✅ Metadata set for ${filePath}:`, {
        contentType: headers.contentType,
        cacheControl: headers.cacheControl,
        fileSize: safeFileSize,
      });
    } catch (error) {
      console.error(`❌ Failed to set metadata for ${filePath}:`, error);
      // intentionally swallow to avoid breaking upload flows
    }
  }

  /**
   * Get file metadata safely - TYPE SAFE
   */
  async getFileMetadataSafe(filePath: string): Promise<{
    name: string;
    size: number;
    contentType: string;
    customMetadata: Record<string, string>;
  } | null> {
    try {
      const file = this.bucket.file(filePath);
      const [metadata] = await file.getMetadata();
      const rawMetadata = metadata as FirebaseFileMetadata;

      return {
        name: TypeSafeUtils.toString(rawMetadata.name),
        size: TypeSafeUtils.toNumber(rawMetadata.size),
        contentType: TypeSafeUtils.toString(rawMetadata.contentType) || "application/octet-stream",
        customMetadata: rawMetadata.metadata || {},
      };
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Batch update metadata for existing files - TYPE SAFE
   */
  async updateExistingFilesMetadata(prefix: string = "sites/"): Promise<void> {
    console.log(`🔄 Updating metadata for files with prefix: ${prefix}`);

    try {
      const [files] = await this.bucket.getFiles({ prefix });
      let processed = 0;
      let errors = 0;

      for (const file of files) {
        try {
          const [rawMetadata] = await file.getMetadata();
          const metadata = rawMetadata as FirebaseFileMetadata;

          const contentType = TypeSafeUtils.toString(metadata.contentType);
          const fileSize = TypeSafeUtils.toNumber(metadata.size);

          const headers = this.generateCacheHeaders(contentType, fileSize);

          await file.setMetadata({
            cacheControl: headers.cacheControl,
            metadata: {
              ...metadata.metadata,
              ...headers.customMetadata,
            },
          });

          console.log(`✅ Updated: ${file.name} (${fileSize} bytes)`);
          processed++;
        } catch (error) {
          console.error(`❌ Failed to update ${file.name}:`, error);
          errors++;
        }
      }

      console.log(`🎉 Batch update completed: ${processed} processed, ${errors} errors`);
    } catch (error) {
      console.error("❌ Batch update failed:", error);
    }
  }

  /**
   * Generate CDN-optimized file URL (for future CDN integration)
   */
  async getOptimizedUrl(
    originalUrl: string,
    contentType: string,
    fileSize: number | string
  ): Promise<{
    url: string;
    cacheHeaders: Record<string, string>;
  }> {
    const headers = this.generateCacheHeaders(contentType, fileSize);

    return {
      url: originalUrl, // placeholder for future CDN rewrite
      cacheHeaders: {
        "Cache-Control": headers.cacheControl,
        "Content-Type": headers.contentType,
      },
    };
  }

  private isConstructionFile(contentType: string): boolean {
    const constructionTypes = [
      "application/dwg",
      "application/dxf",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    return constructionTypes.some((type) => contentType.includes(type));
  }

  private isDocumentFile(contentType: string): boolean {
    const documentTypes = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    return documentTypes.some((type) => contentType.includes(type));
  }

  private getFileCategory(contentType: string, fileSize: number): string {
    if (fileSize > 10 * 1024 * 1024 || this.isConstructionFile(contentType)) {
      return "construction";
    }
    if (contentType.startsWith("image/")) {
      return "image";
    }
    if (this.isDocumentFile(contentType)) {
      return "document";
    }
    return "other";
  }
}

// ✅ Export singleton instance (เหมือนเดิม)
export const firebaseStorageMetadata = new FirebaseStorageMetadata();

// ✅ Export utility for other files to use
export { TypeSafeUtils };

export default FirebaseStorageMetadata;
