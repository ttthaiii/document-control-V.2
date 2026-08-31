// src/components/rfa/PDFPreviewModal.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { RFAFile } from '@/types/rfa';
import {
  X, Edit3, Undo, Redo, Trash2, Menu, Plus, Minus, Save,
  MousePointer2, Hand, Square, Circle, Eraser, Monitor, Type, XCircle,
  Loader2, ChevronLeft, ChevronRight, Download, Layers, ChevronUp, ChevronDown, FilePlus,
  MessageSquare, FileSpreadsheet, MoveUpRight, MessageSquareText
} from 'lucide-react';

import * as fabric from 'fabric';
import { PDFDocument, degrees, PDFName, PDFDict, PDFArray, PDFHexString, PDFStream, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { useNotification } from '@/lib/context/NotificationContext';
import { useAuth } from '@/lib/auth/useAuth';
import { resolveViewUrl } from '@/lib/utils/storage';
import { exportMarkupListToExcel } from '@/lib/utils/markupExport';

// Fabric v6 silently drops any object field not declared here when doing toJSON()/loadFromJSON().
fabric.FabricObject.customProperties = ['id', 'author', 'createdAt', 'kind', 'linkedTo', 'pageNumber', 'text', 'calloutGeo'];

// Builds a directional arrow (shaft Line + filled Triangle head) as ONE Fabric Group, so it moves,
// scales, erases, undoes, and serializes as a single markup object. The head is rotated to the drag angle.
function buildArrow(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const headSize = Math.max(14, width * 4);
  const line = new fabric.Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width });
  const head = new fabric.Triangle({
    left: x2,
    top: y2,
    originX: 'center',
    originY: 'center',
    width: headSize,
    height: headSize,
    fill: color,
    // Fabric's Triangle apex points up (north); +90deg aligns it with the shaft direction.
    angle: angleDeg + 90,
  });
  return new fabric.Group([line, head]);
}

// Reads back the hidden `annotations.json` attachment pdf-lib's own `.attach()` writes into the
// saved PDF (see handleSave). pdf-lib 1.17.1 has no public "getAttachments" API, so this walks the
// PDF's Names/EmbeddedFiles tree by hand, using the exact structure PDFEmbeddedFile.embed() builds.
async function extractAnnotationsFromPdfBytes(bytes: ArrayBuffer): Promise<{ [page: number]: any } | null> {
  try {
    const pdfDoc = await PDFDocument.load(bytes);
    const namesDict = pdfDoc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    const embeddedFilesDict = namesDict?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
    const efNames = embeddedFilesDict?.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (!efNames) return null;
    for (let i = 0; i < efNames.size(); i += 2) {
      const nameObj = efNames.lookupMaybe(i, PDFHexString);
      if (!nameObj || nameObj.decodeText() !== 'annotations.json') continue;
      const fileSpecDict = efNames.lookup(i + 1, PDFDict);
      const efDict = fileSpecDict.lookupMaybe(PDFName.of('EF'), PDFDict);
      const streamObj = efDict?.lookupMaybe(PDFName.of('F'), PDFStream);
      if (!streamObj || !(streamObj instanceof PDFRawStream)) return null;
      const decoded = decodePDFRawStream(streamObj).decode();
      return JSON.parse(new TextDecoder('utf-8').decode(decoded));
    }
    return null;
  } catch (e) {
    console.warn('[PDFPreviewModal] failed to read embedded annotations:', e);
    return null;
  }
}

interface PDFPreviewModalProps {
  isOpen: boolean;
  file: RFAFile | null;
  onClose: () => void;
  onSave?: (editedFile: File) => void | Promise<void>;
  allowEdit?: boolean;
  onDownload?: () => void;
}

const PRESET_COLORS = ['#000000', '#DC2626', '#2563EB', '#16A34A', '#EA580C'];

// [CONFIG] ค่านี้คือเพดานความละเอียดที่ยอมรับได้
// 8192px คือค่าปลอดภัยสำหรับ iPad/Laptop ส่วนใหญ่ (4K = ~4000px)
// ถ้าเครื่องแรงปรับเป็น 12000 ได้ แต่ 8192 คือจุดสมดุลที่ดี
const MAX_RENDER_DIMENSION = 8192;

export default function PDFPreviewModal({
  isOpen, file, onClose, onSave, allowEdit = true, onDownload
}: PDFPreviewModalProps) {
  const { showNotification } = useNotification();
  const { user } = useAuth();

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentCanvasRef = useRef<fabric.Canvas | null>(null);
  const pdfDocRef = useRef<any>(null);

  const canvasDataRef = useRef<{ [key: number]: any }>({});
  const pageCanvasCacheRef = useRef<{ [page: number]: { canvas: HTMLCanvasElement, scale: number } }>({});

  // --- Undo/Redo history (per current page's canvas — reset whenever the canvas is (re)created) ---
  const undoHistoryRef = useRef<any[]>([]);
  const undoHistoryIndexRef = useRef<number>(-1);
  const isRestoringHistoryRef = useRef(false);

  // Flipped by real canvas mutations (including undo/redo — unlike recordHistorySnapshot this is
  // NOT gated by isRestoringHistoryRef, since undoing/redoing away from the last-saved state is
  // itself an unsaved change); cleared only after a successful handleSave.
  const isDirtyRef = useRef(false);
  // Holds a cloned Fabric object for Ctrl+C / Ctrl+V copy-paste of markups.
  const clipboardRef = useRef<any>(null);

  const pendingScrollRef = useRef<{ left: number, top: number } | null>(null);

  const isRenderingRef = useRef(false);
  const activePageRef = useRef(1);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const visualScaleRef = useRef(1.0);
  const lastZoomTimeRef = useRef(0);

  // --- States ---
  const [isEditing, setIsEditing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'select' | 'draw' | 'rect' | 'circle' | 'eraser' | 'hand' | 'text' | 'arrow' | 'callout'>('hand');
  const [hasSelection, setHasSelection] = useState(false);

  // --- Markup List (Bluebeam-style comment summary — S8/S9) ---
  const [isMarkupListOpen, setIsMarkupListOpen] = useState(false);
  const [markupEntries, setMarkupEntries] = useState<{ page: number; author: string; text: string; createdAt: string; id: string }[]>([]);
  const [drawColor, setDrawColor] = useState('#DC2626');
  const [brushWidth, setBrushWidth] = useState(3);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const [visualScale, setVisualScale] = useState(1.0);
  const [renderedScale, setRenderedScale] = useState(1.0);

  const [baseDimensions, setBaseDimensions] = useState({ width: 0, height: 0 });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [thumbnails, setThumbnails] = useState<{ [key: number]: { src: string, width: number, height: number } }>({});
  const [isMobile, setIsMobile] = useState(false);

  // --- Page Management States ---
  const [managedFileUrl, setManagedFileUrl] = useState<string | null>(null);
  const [isPageManagementMode, setIsPageManagementMode] = useState(false);
  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const [pendingDeletePage, setPendingDeletePage] = useState<number | null>(null); // H4: inline confirm
  const [showCloseConfirm, setShowCloseConfirm] = useState(false); // in-app close-warning modal (replaces window.confirm)

  const isPinchingRef = useRef(false);
  const startPinchDistRef = useRef<number>(0);
  const startPinchScaleRef = useRef<number>(1.0);
  const lastPageFlipTimeRef = useRef(0);
  const lastTouchYRef = useRef(0);

  const scaleRatio = visualScale / renderedScale;

  // Sync State -> Ref
  useEffect(() => {
    visualScaleRef.current = visualScale;
  }, [visualScale]);

  // --- Save Current Page Data ---
  const saveCurrentPageData = useCallback(() => {
    if (!allowEdit || !currentCanvasRef.current) return;
    const canvas = currentCanvasRef.current;
    const pageToSave = activePageRef.current;
    canvasDataRef.current[pageToSave] = canvas.toJSON();
  }, [allowEdit]);

  // Rebuilds the Markup List from canvasDataRef across ALL pages — only `kind === 'comment'`
  // (typed text) annotations are included; freehand markup has no text to summarize, per the
  // user's own confirmed choice (no separate caption-prompt UI for drawings).
  const refreshMarkupEntries = useCallback(() => {
    saveCurrentPageData();
    const entries: typeof markupEntries = [];
    for (let p = 1; p <= totalPages; p++) {
      const pageData = canvasDataRef.current[p];
      if (!pageData?.objects) continue;
      for (const obj of pageData.objects) {
        if (obj.kind === 'comment' && typeof obj.text === 'string' && obj.text.trim() && obj.text !== 'ข้อความ') {
          entries.push({
            page: p,
            author: obj.author || 'Unknown User',
            text: obj.text,
            createdAt: obj.createdAt || '',
            id: obj.id || `p${p}-${entries.length}`,
          });
        }
      }
    }
    setMarkupEntries(entries);
  }, [totalPages, saveCurrentPageData]);

  const handleExportMarkupList = useCallback(() => {
    const baseName = (file?.fileName || 'document').replace(/\.pdf$/i, '');
    exportMarkupListToExcel(markupEntries, `markup_list_${baseName}.xlsx`);
  }, [markupEntries, file]);

  // --- Zoom Handler (Exponential & Dynamic Limit) ---
  const handleZoom = useCallback((newScale: number, clientX?: number, clientY?: number) => {
    saveCurrentPageData();

    const scrollContainer = scrollContainerRef.current;
    const contentContainer = containerRef.current;

    if (!scrollContainer || !contentContainer || !baseDimensions.width || !baseDimensions.height) return;

    // คำนวณ Limit ตามขนาดเอกสารจริง เพื่อกันแอปเด้ง
    const maxPossibleScale = MAX_RENDER_DIMENSION / Math.max(baseDimensions.width, baseDimensions.height);
    const dynamicMaxScale = Math.min(8.0, maxPossibleScale); // ยอมให้สูงสุด 800% ถ้ารับไหว

    const safeScale = Math.min(Math.max(0.1, newScale), dynamicMaxScale);

    const contentRect = contentContainer.getBoundingClientRect();
    const scrollRect = scrollContainer.getBoundingClientRect();

    const ptrX = clientX !== undefined ? clientX : scrollRect.left + scrollRect.width / 2;
    const ptrY = clientY !== undefined ? clientY : scrollRect.top + scrollRect.height / 2;

    const offsetX = ptrX - contentRect.left;
    const offsetY = ptrY - contentRect.top;
    const percentX = offsetX / contentRect.width;
    const percentY = offsetY / contentRect.height;

    visualScaleRef.current = safeScale;
    setVisualScale(safeScale);

    const newWidth = baseDimensions.width * safeScale;
    const newHeight = baseDimensions.height * safeScale;

    const newPointX = 32 + (newWidth * percentX);
    const newPointY = 32 + (newHeight * percentY);

    const pointerInScrollX = ptrX - scrollRect.left;
    const pointerInScrollY = ptrY - scrollRect.top;

    const newScrollLeft = newPointX - pointerInScrollX;
    const newScrollTop = newPointY - pointerInScrollY;

    pendingScrollRef.current = { left: newScrollLeft, top: newScrollTop };

  }, [baseDimensions, saveCurrentPageData]);

  // Scroll Correction (useLayoutEffect to prevent jumping)
  useLayoutEffect(() => {
    if (pendingScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.style.scrollBehavior = 'auto';
      scrollContainerRef.current.scrollLeft = pendingScrollRef.current.left;
      scrollContainerRef.current.scrollTop = pendingScrollRef.current.top;
      scrollContainerRef.current.style.scrollBehavior = '';
      pendingScrollRef.current = null;
    }
  }, [visualScale]);

  // --- Reset State on Open ---
  useEffect(() => {
    if (isOpen) {
      setIsEditing(false);
      document.body.style.overflow = 'hidden';
      pageCanvasCacheRef.current = {};
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // --- Toggle Edit Mode ---
  useEffect(() => {
    if (!isEditing) {
      setCurrentTool('hand');
      if (currentCanvasRef.current) {
        currentCanvasRef.current.discardActiveObject();
        currentCanvasRef.current.requestRenderAll();
      }
    } else {
      setCurrentTool('select');
    }
  }, [isEditing]);

  // --- Smart Render Logic (High-DPI Decision) ---
  useEffect(() => {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    renderTimeoutRef.current = setTimeout(() => {
      // 1. หาความหนาแน่นหน้าจอ (Retina = 2-3)
      const dpr = window.devicePixelRatio || 1;
      const maxDocDimension = Math.max(baseDimensions.width || 1, baseDimensions.height || 1);

      // 2. คำนวณ Scale สูงสุดที่ Render ไหว (รวมผลคูณของ DPR แล้ว)
      // สูตร: (Limit / DPR) / ขนาดเอกสาร
      // เช่น Limit 8192 / DPR 2 = 4096. ถ้่าเอกสาร 1000px -> Max Scale = 4.0
      const maxSafeScale = (MAX_RENDER_DIMENSION / dpr) / maxDocDimension;

      // 3. ถ้า Visual Scale ยังไม่เกิน Limit -> Render เต็มความละเอียด (ชัดตาแตก)
      // ถ้าเกิน -> Cap ไว้ที่ Limit (ชัดเท่าที่เครื่องไหว)
      let targetScale = Math.min(visualScale, maxSafeScale);

      // Fallback: ถ้า Zoom เยอะจัดๆ ยอมลด DPR เป็น 1 เพื่อให้ Zoom ได้ลึกขึ้น (ชัดแบบ Standard)
      if (targetScale < visualScale && dpr > 1) {
        const maxSafeScaleNonRetina = MAX_RENDER_DIMENSION / maxDocDimension;
        // ถ้าลด DPR แล้วได้ Scale เยอะขึ้น ให้เอาอันนี้
        if (Math.min(visualScale, maxSafeScaleNonRetina) > targetScale) {
          targetScale = Math.min(visualScale, maxSafeScaleNonRetina);
          // *Note: ใน renderCanvas จะต้องเช็คอีกทีเพื่อปรับ Output Scale
        }
      }

      if (Math.abs(targetScale - renderedScale) > 0.1) {
        setRenderedScale(targetScale);
      }
    }, 400); // 400ms หลังหยุด Zoom ถึงจะ Render ใหม่
    return () => { if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current); };
  }, [visualScale, renderedScale, baseDimensions]);

  // --- Init ---
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
      const initScale = window.innerWidth < 768 ? 0.6 : 1.0;
      setVisualScale(initScale);
      visualScaleRef.current = initScale;
      setRenderedScale(initScale);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // @ts-ignore
    if (!window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        // @ts-ignore
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.body.appendChild(script);
    }
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Load PDF ---
  useEffect(() => {
    if (!isOpen || !file) return;
    setThumbnails({}); setTotalPages(0); setCurrentPage(1);
    canvasDataRef.current = {}; pdfDocRef.current = null;
    pageCanvasCacheRef.current = {};

    const loadPDF = async () => {
      setIsLoading(true);
      try {
        // @ts-ignore
        const pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib) { setTimeout(loadPDF, 500); return; }
        const urlToLoad = managedFileUrl || resolveViewUrl(file.fileUrl, file.filePath); // Load the managed file if exists
        const loadingTask = pdfjsLib.getDocument(urlToLoad);
        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        activePageRef.current = 1;

        // Restore annotations from a previous save (complete or draft) before the first page renders,
        // so canvasDataRef is already populated once `isLoading` flips false (2026-08-28 draft-save requirement).
        try {
          const bytes = await fetch(urlToLoad).then(res => res.arrayBuffer());
          const restored = await extractAnnotationsFromPdfBytes(bytes);
          if (restored) canvasDataRef.current = restored;
        } catch (e) { console.warn('Annotation restore skipped:', e); }

        setIsLoading(false);
      } catch (error) { console.error(error); setIsLoading(false); }
    };
    loadPDF();
  }, [isOpen, file, managedFileUrl]);

  // --- Generate Thumbnails ---
  useEffect(() => {
    if (!pdfDocRef.current || totalPages === 0) return;
    let isCancelled = false;
    const genThumbs = async () => {
      for (let i = 1; i <= totalPages; i++) {
        if (isCancelled) return;
        try {
          const page = await pdfDocRef.current.getPage(i);
          const viewport = page.getViewport({ scale: 0.2 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = viewport.width; canvas.height = viewport.height;
            ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            if (!isCancelled) setThumbnails(prev => ({ ...prev, [i]: { src: canvas.toDataURL(), width: viewport.width, height: viewport.height } }));
          }
        } catch (e) { }
      }
    };
    genThumbs();
    return () => { isCancelled = true; };
  }, [totalPages]);

  // --- Save Logic (pdf-lib Overlay) ---
  const handleSave = async () => {
    if (!onSave || !file || !allowEdit) return;
    setIsSaving(true);

    try {
      saveCurrentPageData();

      const existingPdfBytes = await fetch(managedFileUrl || resolveViewUrl(file.fileUrl, file.filePath)).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const pageData = canvasDataRef.current[i + 1];
        if (pageData) {
          const page = pages[i];
          const { width, height } = page.getSize();
          const rotationAngle = page.getRotation().angle;

          // ตรวจสอบว่า PDF มีการหมุนหน้ากระดาษเป็น Landscape หรือไม่
          const isRotated = rotationAngle === 90 || rotationAngle === 270;
          const visualWidth = isRotated ? height : width;
          const visualHeight = isRotated ? width : height;

          const tempCanvas = document.createElement('canvas');
          // สร้าง Canvas ตามขนาดที่สายตาผู้ใช้มองเห็น ไม่ใช่ขนาด Data ของ PDF ก่อน Rotate
          const fCanvas = new fabric.StaticCanvas(tempCanvas, { width: visualWidth, height: visualHeight });
          await fCanvas.loadFromJSON(pageData);
          // Export เป็น PNG 2x เพื่อความคมชัดตอนแปะลง PDF
          const imgData = fCanvas.toDataURL({ format: 'png', multiplier: 2 });
          const pngImage = await pdfDoc.embedPng(imgData);

          // ปรับจุด Origin ของการแปะรูปภาพ เพื่อชดเชยการหมุนหน้าจอของ PDF Viewer
          let x = 0, y = 0;
          if (rotationAngle === 90) {
            x = width;
            y = 0;
          } else if (rotationAngle === 180) {
            x = width;
            y = height;
          } else if (rotationAngle === 270) {
            x = 0;
            y = height;
          }

          page.drawImage(pngImage, {
            x,
            y,
            width: visualWidth,
            height: visualHeight,
            rotate: degrees(rotationAngle)
          });
        }
      }

      // Embed the structured annotation data (ids, authors, kinds) as a hidden attachment inside the
      // same flattened PDF. onSave's contract/signature to all callers is unchanged; the file just
      // becomes self-describing so re-opening it restores exact objects instead of a static image,
      // and any save — finished or not — doubles as a resumable draft.
      await pdfDoc.attach(
        new TextEncoder().encode(JSON.stringify(canvasDataRef.current)),
        'annotations.json',
        { mimeType: 'application/json', description: 'PDFPreviewModal internal annotation data' }
      );

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' }); // Cast 'as any' แก้ Error TypeScript

      const editedFile = new File([blob], `edited_${file.fileName}`, { type: 'application/pdf' });
      await onSave(editedFile);
      isDirtyRef.current = false;

    } catch (error) {
      console.error('Save error:', error);
      showNotification('error', 'บันทึกไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง');
    }
    finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;
    if (onDownload) onDownload();
    try {
      const targetUrl = managedFileUrl || resolveViewUrl(file.fileUrl, file.filePath);
      const response = await fetch(targetUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(managedFileUrl || resolveViewUrl(file.fileUrl, file.filePath), '_blank');
    }
  };

  // --- PDF Page Management Operations ---
  const performPdfOperation = async (operation: (currentBytes: ArrayBuffer) => Promise<Uint8Array>) => {
    setIsLoading(true);
    try {
      const currentUrl = managedFileUrl || resolveViewUrl(file!.fileUrl, file!.filePath);
      const pdfBytes = await fetch(currentUrl).then(res => res.arrayBuffer());

      const newPdfBytes = await operation(pdfBytes);

      const blob = new Blob([newPdfBytes as any], { type: 'application/pdf' });
      const newUrl = URL.createObjectURL(blob);

      setManagedFileUrl(newUrl);
    } catch (error) {
      console.error(error);
      showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถจัดหน้า PDF ได้ ไฟล์อาจจะเสียหายหรือมีการตั้งค่าป้องกันไว้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePage = (pageNum1Based: number) => {
    performPdfOperation(async (bytes) => {
      const doc = await PDFDocument.load(bytes);
      doc.removePage(pageNum1Based - 1);
      return await doc.save();
    });
  };

  const handleMovePage = (pageNum1Based: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && pageNum1Based === 1) || (direction === 'down' && pageNum1Based === totalPages)) return;

    performPdfOperation(async (bytes) => {
      const doc = await PDFDocument.load(bytes);
      const total = doc.getPageCount();
      const idx = pageNum1Based - 1;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;

      const newOrder = Array.from({ length: total }, (_, i) => i);
      const temp = newOrder[idx];
      newOrder[idx] = newOrder[targetIdx];
      newOrder[targetIdx] = temp;

      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(doc, newOrder);
      copiedPages.forEach(p => newDoc.addPage(p));
      return await newDoc.save();
    });
  };

  const handleDragStart = (e: React.DragEvent, pageNum: number) => {
    setDraggedPage(pageNum);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent, targetPageNum: number) => {
    e.preventDefault();
    if (draggedPage === null || draggedPage === targetPageNum) return;

    performPdfOperation(async (bytes) => {
      const doc = await PDFDocument.load(bytes);
      const total = doc.getPageCount();
      const fromIdx = draggedPage - 1;
      const toIdx = targetPageNum - 1;

      const newOrder = Array.from({ length: total }, (_, i) => i);
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, fromIdx);

      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(doc, newOrder);
      copiedPages.forEach(p => newDoc.addPage(p));
      return await newDoc.save();
    });
    setDraggedPage(null);
  };

  const handleAppendPdf = (e: React.ChangeEvent<HTMLInputElement>, position: 'start' | 'end') => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;
    performPdfOperation(async (bytes) => {
      const baseDoc = await PDFDocument.load(bytes);
      const appendBytes = await uploaded.arrayBuffer();
      const appendDoc = await PDFDocument.load(appendBytes);

      const appendIndices = Array.from({ length: appendDoc.getPageCount() }, (_, i) => i);

      const newDoc = await PDFDocument.create();

      const copiedAppendPages = await newDoc.copyPages(appendDoc, appendIndices);
      const baseIndices = Array.from({ length: baseDoc.getPageCount() }, (_, i) => i);
      const copiedBasePages = await newDoc.copyPages(baseDoc, baseIndices);

      if (position === 'start') {
        copiedAppendPages.forEach(p => newDoc.addPage(p));
        copiedBasePages.forEach(p => newDoc.addPage(p));
      } else {
        copiedBasePages.forEach(p => newDoc.addPage(p));
        copiedAppendPages.forEach(p => newDoc.addPage(p));
      }

      return await newDoc.save();
    });
    e.target.value = '';
  };

  const togglePageManagement = () => {
    if (isPageManagementMode) {
      setIsPageManagementMode(false);
      return;
    }

    const sizeInMB = file!.size / (1024 * 1024);
    if (sizeInMB > 10) {
      showNotification('error', 'ไฟล์มีขนาดใหญ่เกินไป', 'ระบบปิดฟีเจอร์จัดหน้าสำหรับไฟล์ขนาด >10MB เพื่อป้องกันเบราว์เซอร์ค้าง กรุณาจัดหน้าด้วยโปรแกรมภายนอก');
      return;
    }
    if (sizeInMB > 5) {
      // H4: Non-blocking warning — show notification and let user proceed after
      showNotification('warning', 'ไฟล์มีขนาดใหญ่ (จะหน่วงได้)', 'ไฟล์ PDF มีขนาด > 5MB อาจทำให้เบราว์เซอร์ทำงานช้าลงระหว่างจัดการหน้ากระดาษ');
      // Proceed anyway — user is informed, not blocked
    }
    setIsPageManagementMode(true);
    setIsSidebarOpen(true); // Force open sidebar
  };

  // --- Render Canvas (Seamless & High-DPI) ---
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;
    let isCancelled = false;

    const renderCanvas = async () => {
      const container = containerRef.current;
      if (!container) return;

      // Debounce: รอให้รอบเก่าเคลียร์ก่อน
      while (isRenderingRef.current && !isCancelled) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (isCancelled) return;
      isRenderingRef.current = true;

      // [IMPORTANT] ถ้าเปลี่ยนหน้า ให้ลบภาพเก่าทิ้งทันที และโชว์ Loading (ป้องกัน Flash ภาพเก่า)
      // แต่ถ้าแค่ซูม (หน้าเดิม) ให้ปล่อยภาพเก่าค้างไว้ก่อน (Double Buffering)
      if (activePageRef.current !== currentPage) {
        if (currentCanvasRef.current) {
          currentCanvasRef.current.dispose();
          currentCanvasRef.current = null;
        }
        container.innerHTML = `
          <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background-color: #f3f4f6;">
            <div style="color: #6b7280; font-family: sans-serif; font-size: 14px; display: flex; flex-direction: column; align-items: center;">
               <svg class="animate-spin" style="height: 32px; width: 32px; margin-bottom: 8px; color: #3b82f6;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               กำลังโหลดหน้า ${currentPage}...
            </div>
          </div>
        `;
      }

      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (isCancelled) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        setBaseDimensions({ width: baseViewport.width, height: baseViewport.height });

        // คำนวณ Output Scale สำหรับ High-DPI
        const dpr = window.devicePixelRatio || 1;

        // ตรวจสอบว่า Rendered Scale ปัจจุบัน เกิน Limit ไหมเมื่อคูณ DPR
        const maxDocDimension = Math.max(baseViewport.width, baseViewport.height);
        let outputDpr = dpr;

        // ถ้าคูณ DPR แล้วเกิน Limit ให้ลด DPR ลงเหลือ 1
        if ((renderedScale * dpr * maxDocDimension) > MAX_RENDER_DIMENSION) {
          outputDpr = 1;
        }

        const logicalScale = renderedScale;
        const physicalScale = renderedScale * outputDpr;

        const logicalViewport = page.getViewport({ scale: logicalScale });
        const renderViewport = page.getViewport({ scale: physicalScale });

        // 1. สร้าง PDF Canvas ใหม่ (Off-screen)
        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.width = renderViewport.width;
        pdfCanvas.height = renderViewport.height;
        // บีบภาพใหญ่ลงมาแสดงเท่าขนาด Logical
        pdfCanvas.style.width = '100%';
        pdfCanvas.style.height = '100%';
        pdfCanvas.style.position = 'absolute';
        pdfCanvas.style.top = '0';
        pdfCanvas.style.left = '0';
        pdfCanvas.style.zIndex = '0';
        pdfCanvas.style.display = 'block';

        // 2. Render PDF (ช่วงนี้ User ยังเห็นภาพเก่าอยู่)
        await page.render({ canvasContext: pdfCanvas.getContext('2d')!, viewport: renderViewport }).promise;

        if (isCancelled) return;

        // 3. เตรียม Fabric ใหม่ (Off-screen setup logic)
        // แต่ Fabric ต้อง Mount ลง DOM ถึงจะทำงานได้ เราจะเตรียม Element ไว้ก่อน
        const fabricEl = document.createElement('canvas');

        // [SWAP PHASE] สลับภาพเก่าออก เอาภาพใหม่ใส่ (ใช้เวลาเสี้ยววินาที)
        if (currentCanvasRef.current) {
          currentCanvasRef.current.dispose();
          currentCanvasRef.current = null;
        }

        container.innerHTML = ''; // ลบของเก่าตอนนี้
        container.appendChild(pdfCanvas); // ใส่ PDF ใหม่
        container.appendChild(fabricEl);  // ใส่ Fabric Element ใหม่

        // 4. Init Fabric ทับลงไป
        const canvas = new fabric.Canvas(fabricEl, {
          width: logicalViewport.width,
          height: logicalViewport.height,
          backgroundColor: 'transparent',
          selection: isEditing && currentTool === 'select',
          preserveObjectStacking: true,
          renderOnAddRemove: false,
          enableRetinaScaling: true, // เปิด Retina เพื่อความคมชัดของเส้น
        });

        const wrapperEl = canvas.getElement().parentNode as HTMLElement;
        if (wrapperEl) {
          wrapperEl.style.position = 'absolute';
          wrapperEl.style.top = '0';
          wrapperEl.style.left = '0';
          wrapperEl.style.zIndex = '1';
          wrapperEl.style.width = '100%';
          wrapperEl.style.height = '100%';
          wrapperEl.style.background = 'transparent';
        }

        canvas.setZoom(logicalScale);

        if (canvasDataRef.current[currentPage]) {
          await canvas.loadFromJSON(canvasDataRef.current[currentPage]);
          canvas.requestRenderAll();
        }

        // --- Undo/Redo history init ---
        // Registered AFTER the initial loadFromJSON above so restoring a saved page never counts as
        // a history step; the freshly-loaded state becomes history[0] (the undo floor for this page).
        undoHistoryRef.current = [canvas.toJSON()];
        undoHistoryIndexRef.current = 0;
        const recordHistorySnapshot = () => {
          if (isRestoringHistoryRef.current) return;
          undoHistoryRef.current = undoHistoryRef.current.slice(0, undoHistoryIndexRef.current + 1);
          undoHistoryRef.current.push(canvas.toJSON());
          undoHistoryIndexRef.current = undoHistoryRef.current.length - 1;
        };
        canvas.on('object:added', recordHistorySnapshot);
        canvas.on('object:removed', recordHistorySnapshot);
        canvas.on('object:modified', recordHistorySnapshot);

        // Registered alongside (same timing as) the history listeners above so the initial page
        // restore never counts as dirty — but unlike recordHistorySnapshot, this fires unconditionally
        // (including during undo/redo replay).
        const markDirty = () => { isDirtyRef.current = true; };
        canvas.on('object:added', markDirty);
        canvas.on('object:removed', markDirty);
        canvas.on('object:modified', markDirty);

        // Trash2 should only read as "delete selection", not "clear everything" (disambiguated
        // from Undo/Redo by disabling it when there is nothing to delete).
        setHasSelection(canvas.getActiveObjects().length > 0);
        canvas.on('selection:created', () => setHasSelection(true));
        canvas.on('selection:updated', () => setHasSelection(true));
        canvas.on('selection:cleared', () => setHasSelection(false));

        currentCanvasRef.current = canvas;
        setupTool(canvas);
        activePageRef.current = currentPage;

      } catch (err) {
        console.error('Render error:', err);
      }
      finally {
        isRenderingRef.current = false;
      }
    };

    renderCanvas();

    return () => {
      isCancelled = true;
      // Cleanup ตอน Unmount จริงๆ เท่านั้น
    };
  }, [currentPage, renderedScale, isLoading, isEditing]);

  // --- Event Listeners (Exponential Zoom & Scroll Pages) ---
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const ZOOM_SPEED = 1.2;
        const newScale = e.deltaY > 0
          ? visualScaleRef.current / ZOOM_SPEED
          : visualScaleRef.current * ZOOM_SPEED;

        handleZoom(newScale, e.clientX, e.clientY);
      } else {
        // Continuous Scrolling Logic (Desktop / Trackpad)
        const container = scrollContainerRef.current;
        if (!container) return;

        // Skip if there is significant horizontal scroll
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 2;
        const isAtTop = scrollTop <= 2;

        const now = Date.now();
        const COOLDOWN = 600;

        if (e.deltaY > 15 && isAtBottom) {
          if (activePageRef.current < totalPages && now - lastPageFlipTimeRef.current > COOLDOWN) {
            lastPageFlipTimeRef.current = now;
            handlePageChange(activePageRef.current + 1);
            setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0; }, 50);
          }
        } else if (e.deltaY < -15 && isAtTop) {
          if (activePageRef.current > 1 && now - lastPageFlipTimeRef.current > COOLDOWN) {
            lastPageFlipTimeRef.current = now;
            handlePageChange(activePageRef.current - 1);
            setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 50);
          }
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinchingRef.current = true;

        startPinchDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startPinchScaleRef.current = visualScaleRef.current;
      } else if (e.touches.length === 1) {
        lastTouchYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinchingRef.current) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastZoomTimeRef.current < 16) return;
        lastZoomTimeRef.current = now;

        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );

        if (startPinchDistRef.current > 0) {
          const newScale = startPinchScaleRef.current * (dist / startPinchDistRef.current);
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          handleZoom(newScale, midX, midY);
        }
      } else if (e.touches.length === 1) {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - lastTouchYRef.current;
        lastTouchYRef.current = currentY;

        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 2;
        const isAtTop = scrollTop <= 2;

        const now = Date.now();
        const COOLDOWN = 600;

        // deltaY < 0 means finger moved UP = scrolling content DOWN
        if (deltaY < -10 && isAtBottom) {
          if (activePageRef.current < totalPages && now - lastPageFlipTimeRef.current > COOLDOWN) {
            lastPageFlipTimeRef.current = now;
            handlePageChange(activePageRef.current + 1);
            setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0; }, 50);
          }
        } else if (deltaY > 10 && isAtTop) {
          // finger moved DOWN = scrolling content UP
          if (activePageRef.current > 1 && now - lastPageFlipTimeRef.current > COOLDOWN) {
            lastPageFlipTimeRef.current = now;
            handlePageChange(activePageRef.current - 1);
            setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 50);
          }
        }
      }
    };

    const onTouchEnd = () => {
      isPinchingRef.current = false;
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleZoom]);

  // --- Handlers ---
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    saveCurrentPageData();
    setCurrentPage(newPage);
    setTimeout(() => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    }, 50);
  };

  const handleFitWidth = () => {
    if (!scrollContainerRef.current || !baseDimensions.width) return;
    saveCurrentPageData();
    const containerWidth = scrollContainerRef.current.clientWidth - 64;
    const newScale = containerWidth / baseDimensions.width;
    handleZoom(newScale);
  };

  const stampMetadata = useCallback((obj: any, kind: 'comment' | 'markup') => {
    obj.set({
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      author: user?.email || 'Unknown User',
      createdAt: new Date().toISOString(),
      kind,
      pageNumber: activePageRef.current,
    });
  }, [user]);

  const setupTool = useCallback((canvas: fabric.Canvas) => {
    if (!canvas) return;
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    canvas.off('path:created');

    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = 'default';
    canvas.skipTargetFind = false;

    const upperCanvas = canvas.upperCanvasEl;
    if (upperCanvas) {
      upperCanvas.style.touchAction = 'none';
    }

    canvas.on('path:created', (e: any) => {
      if (e.path) {
        stampMetadata(e.path, 'markup');
      }
      canvas.requestRenderAll();
    });

    // --- Callout editor (shared by "draw new" and "double-click to re-edit") ---
    // Builds an editable leader+box+textbox, lets the user type, then on exit either discards an empty
    // one or (re)groups the three into ONE callout object. The box grows to wrap the text, and Thai text
    // (which has no spaces) wraps by character via splitByGrapheme so it never overflows the box.
    const C_PAD = 8, C_BOX_W = 180, C_MIN_H = 40;
    const openCalloutEditor = (
      targetX: number, targetY: number, boxLeft: number, boxTop: number,
      initialText: string, isNew: boolean, preserveMeta?: any,
    ) => {
      // Suspend undo history across the whole build+edit; the finished Group is the single recorded step.
      isRestoringHistoryRef.current = true;
      const leader = new fabric.Line([targetX, targetY, boxLeft, boxTop], {
        stroke: drawColor, strokeWidth: Math.max(1, brushWidth - 1), selectable: false, evented: false,
      });
      const box = new fabric.Rect({
        left: boxLeft, top: boxTop, width: C_BOX_W, height: C_MIN_H,
        fill: '#ffffff', stroke: drawColor, strokeWidth: 2, rx: 6, ry: 6,
        selectable: false, evented: false,
      });
      const textbox = new fabric.Textbox(initialText, {
        left: boxLeft + C_PAD, top: boxTop + C_PAD, width: C_BOX_W - C_PAD * 2,
        fontSize: 16, fill: '#111827', splitByGrapheme: true,
        // Interactive during editing so a click inside positions the caret instead of exiting editing.
        // It is removed and replaced by the grouped copy on exit, so being selectable here is temporary.
        editable: true,
      });
      // Grow the box height to wrap the text as the user types.
      const fitBox = () => {
        box.set('height', Math.max(C_MIN_H, textbox.height + C_PAD * 2));
        canvas.requestRenderAll();
      };
      textbox.on('changed', fitBox);
      canvas.add(leader, box, textbox);
      fitBox();
      canvas.setActiveObject(textbox);
      textbox.enterEditing();
      if (isNew) {
        textbox.selectAll(); // first keystroke replaces the placeholder
      } else {
        // Re-edit: drop the caret at the end. The textbox is evented, so the user can then click
        // anywhere in the text to reposition the caret — that click no longer exits editing.
        const end = (textbox.text || '').length;
        textbox.setSelectionStart(end);
        textbox.setSelectionEnd(end);
      }

      textbox.on('editing:exited', () => {
        const typed = (textbox.text || '').trim();
        canvas.remove(leader); canvas.remove(box); canvas.remove(textbox);
        if (typed === '' || typed === 'ข้อความ') {
          // Empty callout: keep nothing. Resume history; no object added = no undo entry.
          isRestoringHistoryRef.current = false;
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          setCurrentTool('select');
          return;
        }
        const finalH = Math.max(C_MIN_H, textbox.height + C_PAD * 2);
        const gLeader = new fabric.Line([targetX, targetY, boxLeft, boxTop], {
          stroke: drawColor, strokeWidth: Math.max(1, brushWidth - 1),
        });
        const gBox = new fabric.Rect({
          left: boxLeft, top: boxTop, width: C_BOX_W, height: finalH,
          fill: '#ffffff', stroke: drawColor, strokeWidth: 2, rx: 6, ry: 6,
        });
        const gText = new fabric.Textbox(typed, {
          left: boxLeft + C_PAD, top: boxTop + C_PAD, width: C_BOX_W - C_PAD * 2,
          fontSize: 16, fill: '#111827', splitByGrapheme: true,
        });
        const group = new fabric.Group([gLeader, gBox, gText]);
        // Carry the text on the Group so the Markup List (which reads obj.text on kind:'comment'
        // objects) picks it up; the inner Textbox is nested and not seen by that top-level scan.
        group.set('text', typed);
        // Geometry for re-edit: absolute build coords + the group's origin at creation, so a later
        // double-click rebuilds the editable pieces translated by however far the group has moved.
        group.set('calloutGeo', { tx: targetX, ty: targetY, bl: boxLeft, bt: boxTop, ol: group.left, ot: group.top });
        if (preserveMeta) {
          // Re-edit: keep the original identity so the Markup List entry stays stable.
          group.set({ id: preserveMeta.id, author: preserveMeta.author, createdAt: preserveMeta.createdAt, pageNumber: preserveMeta.pageNumber, kind: 'comment' });
        } else {
          stampMetadata(group, 'comment');
        }
        // Resume history so this single add is the one recorded undo step.
        isRestoringHistoryRef.current = false;
        canvas.add(group);
        canvas.setActiveObject(group);
        setCurrentTool('select');
        canvas.requestRenderAll();
      });
    };

    // Double-click a finished callout (in any tool) to edit its text again. Fabric cannot edit a Textbox
    // nested in a Group, so we disband the group back into editable pieces, translated by however far the
    // group was moved since it was built (dx/dy from the recorded origin), then let openCalloutEditor regroup.
    canvas.off('mouse:dblclick');
    canvas.on('mouse:dblclick', (o: any) => {
      const g = o.target;
      const geo = g && typeof g.get === 'function' ? g.get('calloutGeo') : null;
      if (!geo) return;
      const dx = (g.left || 0) - geo.ol;
      const dy = (g.top || 0) - geo.ot;
      const meta = { id: g.get('id'), author: g.get('author'), createdAt: g.get('createdAt'), pageNumber: g.get('pageNumber') };
      canvas.remove(g);
      openCalloutEditor(geo.tx + dx, geo.ty + dy, geo.bl + dx, geo.bt + dy, g.get('text') || '', false, meta);
    });

    const activeTool = isEditing ? currentTool : 'hand';

    if (activeTool === 'hand') {
      canvas.defaultCursor = 'grab';
      canvas.skipTargetFind = true;
      canvas.selection = false;
      canvas.discardActiveObject();
      canvas.requestRenderAll();

      let isDragging = false;
      let lastX = 0;
      let lastY = 0;

      canvas.on('mouse:down', (opt) => {
        const evt = opt.e as any;
        isDragging = true;
        canvas.setCursor('grabbing');

        if (evt.type === 'touchstart' && evt.touches && evt.touches.length > 0) {
          lastX = evt.touches[0].clientX;
          lastY = evt.touches[0].clientY;
        } else {
          lastX = evt.clientX;
          lastY = evt.clientY;
        }
        if (evt.preventDefault) evt.preventDefault();
        if (evt.stopPropagation) evt.stopPropagation();
      });

      canvas.on('mouse:move', (opt) => {
        if (!isDragging) return;
        const evt = opt.e as any;
        if (evt.touches && evt.touches.length > 1) return;
        let clientX, clientY;
        if (evt.type === 'touchmove' && evt.touches && evt.touches.length > 0) {
          clientX = evt.touches[0].clientX;
          clientY = evt.touches[0].clientY;
        } else {
          clientX = evt.clientX;
          clientY = evt.clientY;
        }
        const deltaX = clientX - lastX;
        const deltaY = clientY - lastY;

        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          container.scrollLeft -= deltaX;
          container.scrollTop -= deltaY;

          // Page Flip Logic for Dragging
          const { scrollTop, scrollHeight, clientHeight } = container;
          const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 2;
          const isAtTop = scrollTop <= 2;

          const now = Date.now();
          const COOLDOWN = 600;

          // deltaY < 0 means dragging UP -> scrolling document DOWN
          if (deltaY < -10 && isAtBottom) {
            if (activePageRef.current < totalPages && now - lastPageFlipTimeRef.current > COOLDOWN) {
              lastPageFlipTimeRef.current = now;
              handlePageChange(activePageRef.current + 1);
              setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0; }, 50);
            }
          } else if (deltaY > 10 && isAtTop) {
            // deltaY > 0 means dragging DOWN -> scrolling document UP
            if (activePageRef.current > 1 && now - lastPageFlipTimeRef.current > COOLDOWN) {
              lastPageFlipTimeRef.current = now;
              handlePageChange(activePageRef.current - 1);
              setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 50);
            }
          }
        }
        lastX = clientX;
        lastY = clientY;
        if (evt.preventDefault) evt.preventDefault();
        if (evt.stopPropagation) evt.stopPropagation();
      });

      canvas.on('mouse:up', () => {
        if (isDragging) {
          isDragging = false;
          canvas.setCursor('grab');
        }
      });

    } else if (['select', 'draw', 'eraser', 'text', 'rect', 'circle', 'arrow', 'callout'].includes(activeTool)) {
      if (activeTool === 'select') {
        canvas.selection = true;
        canvas.defaultCursor = 'default';
      }
      else if (activeTool === 'draw') {
        canvas.isDrawingMode = true;
        const brush = new fabric.PencilBrush(canvas);
        brush.width = brushWidth;
        brush.color = drawColor;
        canvas.freeDrawingBrush = brush;
      }
      else if (activeTool === 'eraser') {
        // Object-targeted eraser: hit-tests the markup object under the pointer while dragging and
        // removes it directly. Replaces the old compositing-based PencilBrush hack, which punched a
        // transparent hole through every layer (including the PDF page render) instead of removing
        // just the markup, and left a stray "eraser stroke" object behind on the canvas.
        canvas.defaultCursor = 'crosshair';
        let isErasing = false;
        const eraseAtPointer = (opt: any) => {
          const target = canvas.findTarget(opt.e) as any;
          if (target) {
            canvas.remove(target);
            canvas.requestRenderAll();
          }
        };
        canvas.on('mouse:down', (opt: any) => { isErasing = true; eraseAtPointer(opt); });
        canvas.on('mouse:move', (opt: any) => { if (isErasing) eraseAtPointer(opt); });
        canvas.on('mouse:up', () => { isErasing = false; });
      }
      else if (activeTool === 'text') {
        canvas.defaultCursor = 'text';
        canvas.on('mouse:down', (o: any) => {
          if (o.target) return;
          const pointer = canvas.getScenePoint(o.e);
          const text = new fabric.IText('ข้อความ', {
            left: pointer.x,
            top: pointer.y,
            fontFamily: 'Arial',
            fill: drawColor,
            // Fixed logical size — Fabric's canvas-level viewport zoom already handles visual
            // scaling, so baking the creation-time zoom in here made the same "16pt" text render
            // at different sizes depending on when it was drawn.
            fontSize: 16
          });
          stampMetadata(text, 'comment');
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          // Pre-select the whole placeholder so the FIRST keystroke replaces "ข้อความ"
          // instead of appending to it (otherwise typed text mixes with the placeholder).
          text.selectAll();
          // Placeholder cleanup: leaving "ข้อความ" untouched (or an empty box) removes the
          // object; discardActiveObject + renderAll flush the caret in a SINGLE click so no
          // stray line is left behind.
          text.on('editing:exited', () => {
            const t = (text.text || '').trim();
            if (t === '' || t === 'ข้อความ') {
              canvas.remove(text);
            }
            canvas.discardActiveObject();
            canvas.renderAll();
          });
          setCurrentTool('select');
          canvas.requestRenderAll();
        });
      }
      else if (['rect', 'circle'].includes(activeTool)) {
        canvas.defaultCursor = 'crosshair';
        let shape: any = null;
        let isDown = false;
        let startX = 0, startY = 0;
        canvas.on('mouse:down', (o: any) => {
          if (o.target) return;
          isDown = true;
          const pointer = canvas.getScenePoint(o.e);
          startX = pointer.x;
          startY = pointer.y;
          const opts = {
            left: startX,
            top: startY,
            stroke: drawColor,
            strokeWidth: brushWidth,
            fill: 'transparent',
            selectable: false,
            evented: false
          };
          if (activeTool === 'rect') {
            shape = new fabric.Rect({ ...opts, width: 0, height: 0 });
          } else {
            shape = new fabric.Ellipse({
              ...opts,
              rx: 0,
              ry: 0,
              originX: 'center',
              originY: 'center'
            });
          }
          stampMetadata(shape, 'markup');
          canvas.add(shape);
        });
        canvas.on('mouse:move', (o: any) => {
          if (!isDown || !shape) return;
          const pointer = canvas.getScenePoint(o.e);
          if (activeTool === 'rect') {
            shape.set({
              width: Math.abs(startX - pointer.x),
              height: Math.abs(startY - pointer.y),
              left: Math.min(startX, pointer.x),
              top: Math.min(startY, pointer.y)
            });
          } else {
            shape.set({
              rx: Math.abs(startX - pointer.x) / 2,
              ry: Math.abs(startY - pointer.y) / 2,
              left: (startX + pointer.x) / 2,
              top: (startY + pointer.y) / 2
            });
          }
          canvas.requestRenderAll();
        });
        canvas.on('mouse:up', () => {
          isDown = false;
          if (shape) {
            shape.set({ selectable: true, evented: true });
            shape.setCoords();
          }
          shape = null;
          setCurrentTool('select');
          canvas.requestRenderAll();
        });
      }
      else if (activeTool === 'arrow') {
        canvas.defaultCursor = 'crosshair';
        let preview: any = null;
        let isDown = false;
        let startX = 0, startY = 0;
        canvas.on('mouse:down', (o: any) => {
          if (o.target) return;
          isDown = true;
          const p = canvas.getScenePoint(o.e);
          startX = p.x; startY = p.y;
          // Suspend history for the whole gesture so the throwaway preview line never lands in
          // undo; the final arrow is added AFTER resuming = exactly one clean undo step.
          isRestoringHistoryRef.current = true;
          preview = new fabric.Line([startX, startY, startX, startY], {
            stroke: drawColor, strokeWidth: brushWidth, selectable: false, evented: false,
          });
          canvas.add(preview);
        });
        canvas.on('mouse:move', (o: any) => {
          if (!isDown || !preview) return;
          const p = canvas.getScenePoint(o.e);
          preview.set({ x2: p.x, y2: p.y });
          canvas.requestRenderAll();
        });
        canvas.on('mouse:up', (o: any) => {
          if (!isDown) return;
          isDown = false;
          const p = canvas.getScenePoint(o.e);
          if (preview) { canvas.remove(preview); preview = null; }
          const endX = p.x, endY = p.y;
          isRestoringHistoryRef.current = false;
          // Ignore an accidental click / near-zero drag (no arrow worth drawing).
          if (Math.hypot(endX - startX, endY - startY) < 5) {
            setCurrentTool('select');
            canvas.requestRenderAll();
            return;
          }
          const arrow = buildArrow(startX, startY, endX, endY, drawColor, brushWidth);
          stampMetadata(arrow, 'markup');
          canvas.add(arrow);
          canvas.setActiveObject(arrow);
          setCurrentTool('select');
          canvas.requestRenderAll();
        });
      }
      else if (activeTool === 'callout') {
        canvas.defaultCursor = 'crosshair';
        let isDown = false;
        let targetX = 0, targetY = 0;
        canvas.on('mouse:down', (o: any) => {
          if (o.target) return;
          isDown = true;
          const p = canvas.getScenePoint(o.e);
          targetX = p.x; targetY = p.y;
        });
        canvas.on('mouse:up', (o: any) => {
          if (!isDown) return;
          isDown = false;
          const p = canvas.getScenePoint(o.e);
          // targetX/targetY = where the leader points; p = where the box is dropped.
          openCalloutEditor(targetX, targetY, p.x, p.y, 'ข้อความ', true);
        });
      }
    }
  }, [currentTool, drawColor, brushWidth, renderedScale, isEditing, stampMetadata]);

  useEffect(() => {
    if (currentCanvasRef.current) setupTool(currentCanvasRef.current);
  }, [currentTool, drawColor, brushWidth, setupTool]);

  const handleUndo = () => {
    const c = currentCanvasRef.current;
    if (!c || undoHistoryIndexRef.current <= 0) return;
    isRestoringHistoryRef.current = true;
    undoHistoryIndexRef.current -= 1;
    c.loadFromJSON(undoHistoryRef.current[undoHistoryIndexRef.current]).then(() => {
      c.requestRenderAll();
      isRestoringHistoryRef.current = false;
    });
  };

  const handleRedo = () => {
    const c = currentCanvasRef.current;
    if (!c || undoHistoryIndexRef.current >= undoHistoryRef.current.length - 1) return;
    isRestoringHistoryRef.current = true;
    undoHistoryIndexRef.current += 1;
    c.loadFromJSON(undoHistoryRef.current[undoHistoryIndexRef.current]).then(() => {
      c.requestRenderAll();
      isRestoringHistoryRef.current = false;
    });
  };

  const handleDelete = () => {
    const c = currentCanvasRef.current;
    if (!c) return;
    c.getActiveObjects().forEach((o: any) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
  };

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo · Ctrl/Cmd+Shift+Z or Ctrl+Y = redo ·
  // Ctrl/Cmd+C = copy selection · Ctrl/Cmd+V = paste. Reads state via refs so
  // [isOpen] is the only dep. Attached in the CAPTURE phase on document so an
  // ancestor's bubble-phase stopPropagation can't swallow it first (that was why
  // the earlier window/bubble listener never fired). Skipped while a text markup
  // is being edited so Ctrl+Z/C/V inside the textbox stay native.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const c = currentCanvasRef.current;
      if (!c) return;

      // Delete / Backspace removes the selected markup — but never while a text markup is being
      // edited (there the key must delete a character) or while focus sits in a form field.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((c.getActiveObject() as any)?.isEditing) return;
        const el = document.activeElement as any;
        const tag = (el?.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
        if (!c.getActiveObject()) return;
        e.preventDefault();
        handleDelete();
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      if ((c.getActiveObject() as any)?.isEditing) return;
      // Match on the PHYSICAL key position (e.code), not the produced character
      // (e.key) — otherwise a Thai (or any non-Latin) keyboard layout sends "ผ"
      // instead of "z" and the shortcut never matches.
      const code = e.code;
      if (code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      } else if (code === 'KeyY') {
        e.preventDefault();
        handleRedo();
      } else if (code === 'KeyC') {
        const active = c.getActiveObject();
        if (!active) return;
        e.preventDefault();
        active.clone().then((cloned: any) => { clipboardRef.current = cloned; });
      } else if (code === 'KeyV') {
        if (!clipboardRef.current) return;
        e.preventDefault();
        clipboardRef.current.clone().then((cloned: any) => {
          c.discardActiveObject();
          cloned.set({
            left: (cloned.left || 0) + 20,
            top: (cloned.top || 0) + 20,
            evented: true,
          });
          // Give each pasted markup a fresh id/timestamp so it does not collide with
          // the original in the Markup List (kind/author are kept).
          const refreshId = (o: any) => o.set({
            id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            createdAt: new Date().toISOString(),
          });
          if (cloned.type === 'activeselection') {
            cloned.canvas = c;
            cloned.forEachObject((o: any) => { refreshId(o); c.add(o); });
            cloned.setCoords();
          } else {
            refreshId(cloned);
            c.add(cloned);
          }
          c.setActiveObject(cloned);
          c.requestRenderAll();
        });
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleRequestClose = () => {
    if (isDirtyRef.current) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/95 flex flex-col h-full w-full touch-none">

      {/* Close-confirm modal (in-app · replaces the native window.confirm) */}
      {showCloseConfirm && (
        <div className="absolute inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-1">ยังไม่ได้บันทึก</h3>
            <p className="text-sm text-gray-600 mb-5">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก ต้องการปิดหน้าต่างนี้หรือไม่?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => { setShowCloseConfirm(false); onClose(); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                ปิดโดยไม่บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isSaving && (
        <div className="absolute inset-0 z-[110] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
          <Loader2 className="w-16 h-16 animate-spin mb-4 text-blue-500" />
          <h3 className="text-xl font-semibold">กำลังประมวลผลและบันทึกข้อมูล...</h3>
          <p className="text-gray-300 mt-2">กรุณารอสักครู่ ห้ามปิดหน้าต่างนี้</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between bg-white px-4 py-3 shrink-0 shadow z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
          >
            <Menu size={20} />
          </button>
          <h3 className="font-semibold text-gray-700 truncate max-w-[150px] md:max-w-md">
            {file.fileName}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {allowEdit && !isEditing && (
            <>
              <button
                onClick={togglePageManagement}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${isPageManagementMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-inner' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
              >
                <Layers size={18} />
                <span className="hidden sm:inline font-medium">{isPageManagementMode ? 'เสร็จสิ้น' : 'จัดการหน้า'}</span>
              </button>
              <button
                onClick={() => setIsEditing(true)}
                disabled={isPageManagementMode}
                className="flex items-center gap-2 px-3 py-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit3 size={18} />
                <span className="hidden sm:inline font-medium">แก้ไข</span>
              </button>
            </>
          )}
          {allowEdit && isEditing && (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                <XCircle size={18} />
                <span className="hidden sm:inline">ยกเลิก</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`flex items-center gap-2 px-3 py-2 text-white rounded-lg transition-colors shadow-sm ${isSaving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={18} />}
                <span className="hidden sm:inline font-medium">
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              const next = !isMarkupListOpen;
              setIsMarkupListOpen(next);
              if (next) refreshMarkupEntries();
            }}
            className={`p-2 rounded-lg border transition-colors ${isMarkupListOpen ? 'bg-blue-100 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'}`}
            title="รายการคอมเมนต์"
          >
            <MessageSquare size={20} />
          </button>

          <button
            onClick={handleDownload}
            className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 border border-gray-200"
            title="ดาวน์โหลดไฟล์ต้นฉบับ"
          >
            <Download size={20} />
          </button>

          <button
            onClick={handleRequestClose}
            className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {allowEdit && isEditing && (
        <div className="bg-white border-b p-2 overflow-x-auto z-20 shrink-0 shadow-sm hide-scrollbar">
          <div className="flex items-center gap-4 min-w-max px-2 justify-center lg:justify-start">
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
              {[
                { id: 'hand', icon: Hand },
                { id: 'select', icon: MousePointer2 },
                { id: 'draw', icon: Edit3 },
                { id: 'text', icon: Type },
                { id: 'eraser', icon: Eraser }
              ].map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setCurrentTool(tool.id as any)}
                  className={`p-3 rounded-md transition-colors ${currentTool === tool.id ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <tool.icon size={20} />
                </button>
              ))}
            </div>
            <div className="w-px h-8 bg-gray-300" />
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
              {[
                { id: 'rect', icon: Square },
                { id: 'circle', icon: Circle },
                { id: 'arrow', icon: MoveUpRight },
                { id: 'callout', icon: MessageSquareText }
              ].map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setCurrentTool(tool.id as any)}
                  className={`p-3 rounded-md transition-colors ${currentTool === tool.id ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <tool.icon size={20} />
                </button>
              ))}
            </div>
            <div className="w-px h-8 bg-gray-300" />
            <div className="flex items-center gap-2 border p-1 rounded-lg bg-gray-50">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setDrawColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${drawColor === c ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={drawColor}
                onChange={e => setDrawColor(e.target.value)}
                className="w-8 h-8 border-none p-0 bg-transparent cursor-pointer"
              />
              <div className="w-px h-6 bg-gray-300 mx-2" />
              <input
                type="range"
                min="1"
                max="20"
                value={brushWidth}
                onChange={e => setBrushWidth(Number(e.target.value))}
                className="w-20 accent-blue-600"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={handleUndo}
                className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors"
              >
                <Undo />
              </button>
              <button
                onClick={handleRedo}
                className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors"
              >
                <Redo />
              </button>
              <button
                onClick={handleDelete}
                disabled={!hasSelection}
                title="ลบวัตถุที่เลือก"
                className="p-2 hover:bg-red-50 rounded text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Trash2 />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex bg-gray-500/50">
        {isSidebarOpen && (
          <div className="absolute inset-y-0 left-0 w-[240px] bg-white shadow-xl z-30 flex flex-col transition-transform duration-300 border-r">
            <div className="p-3 border-b bg-gray-50 font-medium text-sm text-gray-600">
              Pages ({totalPages})
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <div
                  key={p}
                  draggable={isPageManagementMode}
                  onDragStart={(e) => handleDragStart(e, p)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, p)}
                  onClick={() => {
                    handlePageChange(p);
                    if (isMobile && !isPageManagementMode) setIsSidebarOpen(false);
                  }}
                  className={`relative cursor-pointer rounded border-2 transition-all p-1 bg-gray-100 ${currentPage === p ? 'border-blue-500 ring-1 ring-blue-300' : 'border-transparent hover:border-gray-300'} ${draggedPage === p ? 'opacity-50 ring-2 ring-indigo-400 border-indigo-400' : ''}`}
                >
                  <div className="w-full flex items-center justify-center bg-white overflow-hidden min-h-[100px] relative">
                    {thumbnails[p] ? (
                      <img
                        src={thumbnails[p].src}
                        style={{ width: '100%', height: 'auto' }}
                        className="shadow-sm"
                        alt={`Page ${p}`}
                      />
                    ) : (
                      <div className="text-gray-400 text-xs">Loading...</div>
                    )}

                    {/* Management Overlay */}
                    {isPageManagementMode && (
                      <div className="absolute top-1 right-1 flex flex-col gap-1 z-10">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMovePage(p, 'up'); }}
                          disabled={p === 1}
                          className="p-1 bg-white border rounded shadow hover:bg-gray-100 text-gray-700 disabled:opacity-30"
                          title="เลื่อนขึ้น"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMovePage(p, 'down'); }}
                          disabled={p === totalPages}
                          className="p-1 bg-white border rounded shadow hover:bg-gray-100 text-gray-700 disabled:opacity-30"
                          title="เลื่อนลง"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // H4: Set pending page — renders inline confirm instead of window.confirm
                            setPendingDeletePage(p);
                          }}
                          disabled={totalPages <= 1}
                          className="p-1 bg-red-50 border border-red-200 rounded shadow hover:bg-red-100 text-red-600 disabled:opacity-30"
                          title="ลบหน้านี้"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                    {/* H4: Inline delete confirmation */}
                    {pendingDeletePage === p && (
                      <div className="absolute inset-x-0 bottom-0 bg-red-600 text-white text-xs rounded-b-md p-1.5 flex items-center justify-between gap-1 z-10">
                        <span className="font-medium truncate">\u0e25\u0e1a\u0e2b\u0e19\u0e49\u0e32 {p}?</span>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeletePage(p); setPendingDeletePage(null); }}
                            className="px-1.5 py-0.5 bg-white text-red-700 rounded font-bold hover:bg-red-50"
                          >\u0e43\u0e0a\u0e48</button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPendingDeletePage(null); }}
                            className="px-1.5 py-0.5 bg-red-500 text-white rounded hover:bg-red-400"
                          >\u0e44\u0e21\u0e48</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-center text-xs mt-1 font-medium text-gray-500">
                    {p}
                  </div>
                </div>
              ))}
            </div>

            {/* Append PDF Buttons */}
            {isPageManagementMode && (
              <div className="p-3 border-t bg-gray-50 shrink-0 space-y-2">
                <input
                  type="file"
                  id="append-pdf-input-start"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleAppendPdf(e, 'start')}
                />
                <input
                  type="file"
                  id="append-pdf-input-end"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleAppendPdf(e, 'end')}
                />
                <label
                  htmlFor="append-pdf-input-start"
                  className="flex items-center justify-center w-full gap-2 px-3 py-2 bg-white border-2 border-dashed border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-100 hover:border-indigo-400 cursor-pointer transition-colors font-medium text-sm"
                >
                  <FilePlus size={18} />
                  <span>แทรก PDF ด้านหน้าสุด</span>
                </label>
                <label
                  htmlFor="append-pdf-input-end"
                  className="flex items-center justify-center w-full gap-2 px-3 py-2 bg-white border-2 border-dashed border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-100 hover:border-indigo-400 cursor-pointer transition-colors font-medium text-sm"
                >
                  <FilePlus size={18} />
                  <span>แทรก PDF ด้านหลังสุด</span>
                </label>
                <p className="text-[10px] text-gray-500 text-center mt-2 leading-tight">การเพิ่มไฟล์อาจใช้เวลาสักครู่ ขึ้นอยู่กับขนาดไฟล์</p>
              </div>
            )}
          </div>
        )}

        {/* Markup List panel (S8) */}
        {isMarkupListOpen && (
          <div className="absolute inset-y-0 right-0 w-[280px] bg-white shadow-xl z-30 flex flex-col border-l">
            <div className="p-3 border-b bg-gray-50 font-medium text-sm text-gray-600 flex items-center justify-between shrink-0">
              <span>รายการคอมเมนต์ ({markupEntries.length})</span>
              <button onClick={() => setIsMarkupListOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {markupEntries.length === 0 ? (
                <p className="text-xs text-gray-400 text-center mt-4">ยังไม่มีคอมเมนต์ที่เป็นข้อความ</p>
              ) : (
                markupEntries.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => {
                      handlePageChange(entry.page);
                      if (isMobile) setIsMarkupListOpen(false);
                    }}
                    className="p-2 rounded border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span className="font-medium text-blue-600">หน้า {entry.page}</span>
                      <span className="truncate max-w-[120px]">{entry.author}</span>
                    </div>
                    <p className="text-sm text-gray-700 break-words">{entry.text}</p>
                  </div>
                ))
              )}
            </div>
            {markupEntries.length > 0 && (
              <div className="p-3 border-t shrink-0">
                <button
                  onClick={() => handleExportMarkupList()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <FileSpreadsheet size={16} />
                  ส่งออก Excel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scroll Container */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto relative touch-none transition-all ${isSidebarOpen && !isMobile ? 'ml-[240px]' : ''}`}
          style={{
            backgroundColor: '#6b7280',
            scrollBehavior: 'auto'
          }}
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white flex flex-col items-center">
                <Loader2 className="animate-spin h-10 w-10 mb-4" />
                Loading PDF...
              </div>
            </div>
          ) : (
            <div
              className="origin-top-left"
              style={{
                width: baseDimensions.width ? `${baseDimensions.width * visualScale + 64}px` : '100%',
                height: baseDimensions.height ? `${baseDimensions.height * visualScale + 64}px` : '100%',
                minWidth: '100%',
                minHeight: '100%',
                padding: '32px',
                display: (baseDimensions.width * visualScale + 64) < (scrollContainerRef.current?.clientWidth || 0) ? 'flex' : 'block',
                justifyContent: (baseDimensions.width * visualScale + 64) < (scrollContainerRef.current?.clientWidth || 0) ? 'center' : 'flex-start',
                alignItems: (baseDimensions.height * visualScale + 64) < (scrollContainerRef.current?.clientHeight || 0) ? 'center' : 'flex-start',
              }}
            >
              <div
                ref={containerRef}
                className="shadow-2xl"
                style={{
                  position: 'relative',
                  width: baseDimensions.width ? `${baseDimensions.width * renderedScale}px` : 'auto',
                  height: baseDimensions.height ? `${baseDimensions.height * renderedScale}px` : 'auto',
                  backgroundColor: 'white',
                  transform: `scale(${scaleRatio})`,
                  transformOrigin: 'top left',
                  willChange: 'transform',
                }}
              />
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20 pointer-events-auto">
          <div className="bg-white/90 backdrop-blur shadow-lg border rounded-full px-2 py-1 flex items-center gap-1">
            <button
              onClick={() => handleZoom(visualScaleRef.current - 0.1)}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            >
              <Minus size={16} />
            </button>
            <span className="text-xs font-bold min-w-[3rem] text-center">
              {Math.round(visualScale * 100)}%
            </span>
            <button
              onClick={() => handleZoom(visualScaleRef.current + 0.1)}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            >
              <Plus size={16} />
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1" />
            <button
              onClick={handleFitWidth}
              title="Fit Width"
              className="p-2 hover:bg-blue-50 text-blue-600 rounded-full transition-colors"
            >
              <Monitor size={16} />
            </button>
          </div>
          <div className="bg-white/90 backdrop-blur shadow-lg border rounded-full px-2 py-1 flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-bold min-w-[2rem] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}