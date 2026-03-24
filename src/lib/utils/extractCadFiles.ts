// src/lib/utils/extractCadFiles.ts
import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import { adminBucket } from '@/lib/firebase/admin';
import { getFileUrl } from '@/lib/utils/storage';
import { RFAFile } from '@/types/rfa';

const CAD_EXTENSION = '.dwg';

function isDwg(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(CAD_EXTENSION);
}

async function uploadBuffer(
  buffer: Buffer,
  destPath: string,
  fileName: string
): Promise<RFAFile> {
  const storageFile = adminBucket.file(destPath);
  await storageFile.save(buffer, {
    metadata: { contentType: 'application/octet-stream' },
  });
  return {
    fileName,
    fileUrl: getFileUrl(destPath),
    filePath: destPath,
    size: buffer.length,
    fileSize: buffer.length,
    contentType: 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'SYSTEM',
  };
}

async function extractZip(buffer: Buffer, destBase: string): Promise<RFAFile[]> {
  const results: RFAFile[] = [];
  const zip = new AdmZip(buffer);
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory && isDwg(entry.entryName)) {
      const data = entry.getData();
      const rawName = entry.name || entry.entryName;
      const fileName = rawName.split(/[/\\]/).pop() || rawName; // ตัด path prefix ออก (รองรับทั้ง / และ \)
      const destPath = `${destBase}/${Date.now()}_${fileName}`;
      results.push(await uploadBuffer(data, destPath, fileName));
    }
  }
  return results;
}

async function extractRar(buffer: Buffer, destBase: string): Promise<RFAFile[]> {
  const results: RFAFile[] = [];
  try {
    // โหลด WASM จาก filesystem โดยตรง เพราะ node-unrar-js ไม่สามารถ fetch relative URL ใน Next.js API route ได้
    const fs = await import('fs');
    const path = await import('path');
    const wasmPath = path.join(process.cwd(), 'node_modules/node-unrar-js/esm/js/unrar.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength
    ) as ArrayBuffer;

    const data = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const extractor = await createExtractorFromData({ data, wasmBinary });
    const list = extractor.getFileList();
    const allHeaders = [...list.fileHeaders];
    console.log(`[extractRar] Archive contains ${allHeaders.length} total entries.`);
    // console.log(`[extractRar] Raw entries:`, allHeaders.map(h => h.name).join(', '));
    
    const headers = allHeaders.filter(
      h => !h.flags.directory && isDwg(h.name)
    );
    console.log(`[extractRar] Found ${headers.length} .dwg entries inside RAR:`, headers.map(h => h.name));

    if (headers.length === 0) {
      console.log(`[extractRar] Skipping extraction since no .dwg files were matched.`);
      return results;
    }

    const extracted = extractor.extract({ files: headers.map(h => h.name) });
    for (const file of [...extracted.files]) {
      if (!file.extraction) continue;
      const fileBuffer = Buffer.from(file.extraction);
      const rawName = file.fileHeader.name;
      const fileName = rawName.split(/[/\\]/).pop() || rawName; // ตัด path prefix ออก (รองรับทั้ง / และ \)
      const destPath = `${destBase}/${Date.now()}_${fileName}`;
      results.push(await uploadBuffer(fileBuffer, destPath, fileName));
    }
  } catch (err) {
    console.error('[extractRar] Failed to extract RAR:', err);
  }
  return results;
}

/**
 * ดึงไฟล์ .dwg จาก originalFiles (ZIP / RAR / DWG ตรงๆ)
 * แล้ว upload ขึ้น Firebase Storage
 * @returns RFAFile[] ของ .dwg ทั้งหมดที่พบ
 */
export async function extractCadFiles(
  originalFiles: RFAFile[],
  siteId: string,
  docId: string
): Promise<RFAFile[]> {
  const cadFiles: RFAFile[] = [];
  const destBase = `sites/${siteId}/rfa/cad/${docId}`;

  for (const file of originalFiles) {
    const name = file.fileName.toLowerCase();
    const { filePath } = file;
    if (!filePath) continue;

    try {
      if (isDwg(name)) {
        // DWG ตรงๆ → เพิ่มเลยไม่ต้อง extract
        cadFiles.push(file);
      } else if (name.endsWith('.zip')) {
        const [buffer] = await adminBucket.file(filePath).download();
        const dwgs = await extractZip(buffer as Buffer, destBase);
        cadFiles.push(...dwgs);
      } else if (name.endsWith('.rar')) {
        console.log(`[extractCadFiles] Downloading RAR: ${name}`);
        const [buffer] = await adminBucket.file(filePath).download();
        console.log(`[extractCadFiles] RAR downloaded. Size: ${buffer.length} bytes. Initiating extractRar...`);
        const dwgs = await extractRar(buffer as Buffer, destBase);
        console.log(`[extractCadFiles] extractRar returned ${dwgs.length} files.`);
        cadFiles.push(...dwgs);
      }
    } catch (err) {
      console.error(`[extractCadFiles] Skipped "${file.fileName}":`, err);
    }
  }

  return cadFiles;
}
