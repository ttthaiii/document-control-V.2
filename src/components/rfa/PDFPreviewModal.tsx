// src/components/rfa/PDFPreviewModal.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { RFAFile } from '@/types/rfa';
import { 
  X, Edit3, Undo, Trash2, Menu, Plus, Minus, Save,
  MousePointer2, Hand, Square, Circle, Eraser, Monitor, Type, XCircle,
  Loader2, ChevronLeft, ChevronRight, Download
} from 'lucide-react';

import * as fabric from 'fabric';
import { PDFDocument } from 'pdf-lib'; // ต้อง npm install pdf-lib

interface PDFPreviewModalProps {
  isOpen: boolean;
  file: RFAFile | null;
  onClose: () => void;
  onSave?: (editedFile: File) => void | Promise<void>;
  allowEdit?: boolean;
}

const PRESET_COLORS = ['#000000', '#DC2626', '#2563EB', '#16A34A', '#EA580C'];

// [CONFIG] ค่านี้คือเพดานความละเอียดที่ยอมรับได้
// 8192px คือค่าปลอดภัยสำหรับ iPad/Laptop ส่วนใหญ่ (4K = ~4000px)
// ถ้าเครื่องแรงปรับเป็น 12000 ได้ แต่ 8192 คือจุดสมดุลที่ดี
const MAX_RENDER_DIMENSION = 8192; 

export default function PDFPreviewModal({ 
  isOpen, file, onClose, onSave, allowEdit = true
}: PDFPreviewModalProps) {
  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentCanvasRef = useRef<fabric.Canvas | null>(null);
  const pdfDocRef = useRef<any>(null);
  
  const canvasDataRef = useRef<{ [key: number]: any }>({}); 
  const pageCanvasCacheRef = useRef<{ [page: number]: { canvas: HTMLCanvasElement, scale: number } }>({});

  const pendingScrollRef = useRef<{ left: number, top: number } | null>(null);

  const isRenderingRef = useRef(false);
  const activePageRef = useRef(1);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const visualScaleRef = useRef(1.0);
  const lastZoomTimeRef = useRef(0);

  // --- States ---
  const [isEditing, setIsEditing] = useState(false); 
  const [currentTool, setCurrentTool] = useState<'select' | 'draw' | 'rect' | 'circle' | 'eraser' | 'hand' | 'text'>('hand');
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

  // Gestures
  const isPinchingRef = useRef(false);
  const startPinchDistRef = useRef<number>(0);
  const startPinchScaleRef = useRef<number>(1.0);

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
        if(currentCanvasRef.current) {
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
        const loadingTask = pdfjsLib.getDocument(file.fileUrl);
        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        activePageRef.current = 1;
        setIsLoading(false);
      } catch (error) { console.error(error); setIsLoading(false); }
    };
    loadPDF();
  }, [isOpen, file]);

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
        } catch (e) {}
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

        const existingPdfBytes = await fetch(file.fileUrl).then(res => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
            const pageData = canvasDataRef.current[i + 1]; 
            if (pageData) {
                const page = pages[i];
                const { width, height } = page.getSize();
                const tempCanvas = document.createElement('canvas');
                // ใช้ StaticCanvas เพื่อ Render ลายเซ็นให้คมชัดที่สุด
                const fCanvas = new fabric.StaticCanvas(tempCanvas, { width, height });
                await fCanvas.loadFromJSON(pageData);
                // Export เป็น PNG 2x เพื่อความคมชัดตอนแปะลง PDF
                const imgData = fCanvas.toDataURL({ format: 'png', multiplier: 2 });
                const pngImage = await pdfDoc.embedPng(imgData);
                page.drawImage(pngImage, { x: 0, y: 0, width: width, height: height });
            }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' }); // Cast 'as any' แก้ Error TypeScript
        
        const editedFile = new File([blob], `edited_${file.fileName}`, { type: 'application/pdf' });
        await onSave(editedFile); 

    } catch (error) { 
        console.error('Save error:', error);
        alert("บันทึกไม่สำเร็จ: กรุณาลองใหม่อีกครั้ง"); 
    } 
    finally { 
        setIsSaving(false); 
    }
  };

  const handleDownload = async () => {
    if (!file) return;
    try {
        const response = await fetch(file.fileUrl);
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
        window.open(file.fileUrl, '_blank');
    }
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

      // [IMPORTANT] อย่าเพิ่งลบ container.innerHTML = '' ตรงนี้! 
      // เราจะปล่อยภาพเก่าค้างไว้ก่อน (Double Buffering)

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

  // --- Event Listeners (Exponential Zoom) ---
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
      if(newPage < 1 || newPage > totalPages) return;
      saveCurrentPageData(); 
      setCurrentPage(newPage);
  };

  const handleFitWidth = () => {
      if(!scrollContainerRef.current || !baseDimensions.width) return;
      saveCurrentPageData();
      const containerWidth = scrollContainerRef.current.clientWidth - 64;
      const newScale = containerWidth / baseDimensions.width;
      handleZoom(newScale); 
  };

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
       if (e.path && e.path.globalCompositeOperation === 'destination-out') {
           e.path.set({ selectable: false, evented: false });
           canvas.discardActiveObject(); 
       }
       canvas.requestRenderAll();
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
            if(evt.preventDefault) evt.preventDefault(); 
            if(evt.stopPropagation) evt.stopPropagation();
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
                scrollContainerRef.current.scrollLeft -= deltaX;
                scrollContainerRef.current.scrollTop -= deltaY;
            }
            lastX = clientX; 
            lastY = clientY;
            if(evt.preventDefault) evt.preventDefault();
            if(evt.stopPropagation) evt.stopPropagation();
        });

        canvas.on('mouse:up', () => { 
            if (isDragging) {
                isDragging = false; 
                canvas.setCursor('grab');
            }
        });

    } else if (['select', 'draw', 'eraser', 'text', 'rect', 'circle'].includes(activeTool)) {
        if(activeTool === 'select') { 
            canvas.selection = true; 
            canvas.defaultCursor = 'default'; 
        }
        else if(activeTool === 'draw') {
            canvas.isDrawingMode = true;
            const brush = new fabric.PencilBrush(canvas);
            brush.width = brushWidth; 
            brush.color = drawColor;
            canvas.freeDrawingBrush = brush;
        }
        else if(activeTool === 'eraser') {
            canvas.isDrawingMode = true;
            const brush = new fabric.PencilBrush(canvas);
            brush.width = brushWidth * 5; 
            brush.color = 'white'; 
            // @ts-ignore
            brush.createPath = function(pathData) {
                // @ts-ignore
                const path = fabric.PencilBrush.prototype.createPath.call(this, pathData);
                path.globalCompositeOperation = 'destination-out'; 
                return path;
            }
            canvas.freeDrawingBrush = brush;
        }
        else if(activeTool === 'text') {
            canvas.defaultCursor = 'text';
            canvas.on('mouse:down', (o: any) => {
                if (o.target) return;
                const pointer = canvas.getScenePoint(o.e);
                const text = new fabric.IText('ข้อความ', { 
                    left: pointer.x, 
                    top: pointer.y, 
                    fontFamily: 'Arial', 
                    fill: drawColor, 
                    fontSize: 24 / renderedScale
                });
                canvas.add(text); 
                canvas.setActiveObject(text); 
                text.enterEditing(); 
                setCurrentTool('select');
                canvas.requestRenderAll();
            });
        }
        else if(['rect', 'circle'].includes(activeTool)) {
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
                    shape = new fabric.Rect({ ...opts, width:0, height:0 });
                } else {
                    shape = new fabric.Ellipse({ 
                        ...opts, 
                        rx:0, 
                        ry:0, 
                        originX:'center', 
                        originY:'center' 
                    });
                }
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
                        rx: Math.abs(startX - pointer.x)/2, 
                        ry: Math.abs(startY - pointer.y)/2, 
                        left: (startX + pointer.x)/2, 
                        top: (startY + pointer.y)/2 
                    });
                }
                canvas.requestRenderAll();
            });
            canvas.on('mouse:up', () => { 
                isDown = false; 
                if(shape){ 
                    shape.set({selectable:true, evented:true}); 
                    shape.setCoords(); 
                } 
                shape = null; 
                setCurrentTool('select'); 
                canvas.requestRenderAll();
            });
        }
    }
  }, [currentTool, drawColor, brushWidth, renderedScale, isEditing]);

  useEffect(() => { 
    if(currentCanvasRef.current) setupTool(currentCanvasRef.current); 
  }, [currentTool, drawColor, brushWidth, setupTool]);

  const handleUndo = () => { 
    const c = currentCanvasRef.current; 
    if(!c) return; 
    const objs = c.getObjects(); 
    if(objs.length) { 
      c.remove(objs[objs.length-1]); 
      c.requestRenderAll(); 
    }
  };
  
  const handleDelete = () => { 
    const c = currentCanvasRef.current; 
    if(!c) return; 
    c.getActiveObjects().forEach((o:any) => c.remove(o)); 
    c.discardActiveObject(); 
    c.requestRenderAll(); 
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/95 flex flex-col h-full w-full touch-none">
      
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
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="flex items-center gap-2 px-3 py-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                >
                    <Edit3 size={18} />
                    <span className="hidden sm:inline font-medium">แก้ไข</span>
                </button>
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
               onClick={handleDownload}
               className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 border border-gray-200"
               title="ดาวน์โหลดไฟล์ต้นฉบับ"
             >
               <Download size={20}/>
             </button>

             <button 
               onClick={onClose} 
               className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
             >
               <X size={20}/>
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
                        <tool.icon size={20}/>
                      </button>
                  ))}
               </div>
               <div className="w-px h-8 bg-gray-300"/>
               <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                   {[
                     { id: 'rect', icon: Square }, 
                     { id: 'circle', icon: Circle }
                   ].map(tool => (
                      <button 
                        key={tool.id} 
                        onClick={() => setCurrentTool(tool.id as any)} 
                        className={`p-3 rounded-md transition-colors ${currentTool === tool.id ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        <tool.icon size={20}/>
                      </button>
                  ))}
               </div>
               <div className="w-px h-8 bg-gray-300"/>
               <div className="flex items-center gap-2 border p-1 rounded-lg bg-gray-50">
                   {PRESET_COLORS.map(c => (
                     <button 
                       key={c} 
                       onClick={() => setDrawColor(c)} 
                       className={`w-6 h-6 rounded-full border-2 transition-all ${drawColor === c ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-105'}`} 
                       style={{ backgroundColor: c}}
                     />
                   ))}
                   <input 
                     type="color" 
                     value={drawColor} 
                     onChange={e => setDrawColor(e.target.value)} 
                     className="w-8 h-8 border-none p-0 bg-transparent cursor-pointer"
                   />
                   <div className="w-px h-6 bg-gray-300 mx-2"/>
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
                     <Undo/>
                   </button>
                   <button 
                     onClick={handleDelete} 
                     className="p-2 hover:bg-red-50 rounded text-red-500 transition-colors"
                   >
                     <Trash2/>
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
                        {Array.from({length: totalPages}, (_, i) => i+1).map(p => (
                            <div 
                              key={p} 
                              onClick={() => { 
                                handlePageChange(p); 
                                if(isMobile) setIsSidebarOpen(false); 
                              }} 
                              className={`cursor-pointer rounded border-2 transition-all p-1 bg-gray-100 ${currentPage === p ? 'border-blue-500 ring-1 ring-blue-300' : 'border-transparent hover:border-gray-300'}`}
                            >
                              <div className="w-full flex items-center justify-center bg-white overflow-hidden min-h-[100px]">
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
                              </div>
                              <div className="text-center text-xs mt-1 font-medium text-gray-500">
                                {p}
                              </div>
                            </div>
                        ))}
                    </div>
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
                    <Loader2 className="animate-spin h-10 w-10 mb-4"/>
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
                      <Minus size={16}/>
                    </button>
                    <span className="text-xs font-bold min-w-[3rem] text-center">
                      {Math.round(visualScale * 100)}%
                    </span>
                    <button 
                      onClick={() => handleZoom(visualScaleRef.current + 0.1)} 
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
                    >
                      <Plus size={16}/>
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"/>
                    <button 
                      onClick={handleFitWidth} 
                      title="Fit Width" 
                      className="p-2 hover:bg-blue-50 text-blue-600 rounded-full transition-colors"
                    >
                      <Monitor size={16}/>
                    </button>
                </div>
                <div className="bg-white/90 backdrop-blur shadow-lg border rounded-full px-2 py-1 flex items-center gap-2">
                    <button 
                      onClick={() => handlePageChange(currentPage-1)} 
                      disabled={currentPage===1} 
                      className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={18}/>
                    </button>
                    <span className="text-xs font-bold min-w-[2rem] text-center">
                      {currentPage} / {totalPages}
                    </span>
                    <button 
                      onClick={() => handlePageChange(currentPage+1)} 
                      disabled={currentPage===totalPages} 
                      className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={18}/>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
}