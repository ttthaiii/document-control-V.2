// src/components/rfa/PDFAnnotatorModal.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import * as fabric from 'fabric'; 
import { PDFDocument } from 'pdf-lib';
import { X, Save, Type, Square, Pen, Eraser, ChevronLeft, ChevronRight, MousePointer } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';
import { RFAFile } from '@/types/rfa';

// --- Polyfill for Promise.withResolvers (จำเป็นสำหรับ react-pdf v9 ในบาง Browser/Env) ---
if (typeof Promise.withResolvers === 'undefined' && typeof window !== 'undefined') {
  // @ts-expect-error Polyfill logic
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

interface PDFAnnotatorModalProps {
  isOpen: boolean;
  file: RFAFile | null;
  onClose: () => void;
  onSave: (editedFile: File) => Promise<void>;
}

export default function PDFAnnotatorModal({ isOpen, file, onClose, onSave }: PDFAnnotatorModalProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'text' | 'rect'>('select');
  const [brushColor, setBrushColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(3);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const pagesAnnotations = useRef<Record<number, any>>({});

  // ✅ ย้ายการตั้งค่า Worker มาไว้ใน useEffect (ทำงานครั้งเดียวเมื่อ Component ถูก Mount)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // ใช้ unpkg เพื่อความเสถียร
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
  }, []);

  // Load PDF
  useEffect(() => {
    if (isOpen && file) {
      setPageNumber(1);
      pagesAnnotations.current = {};
      
      fetch(file.fileUrl)
        .then(res => res.blob())
        .then(blob => setPdfBlob(blob))
        .catch(err => console.error("Error loading PDF:", err));
    }
  }, [isOpen, file]);

  const changePage = (offset: number) => {
    if (!fabricCanvasRef.current) return;
    const json = fabricCanvasRef.current.toJSON();
    pagesAnnotations.current[pageNumber] = json;
    setPageNumber(prev => Math.min(Math.max(prev + offset, 1), numPages));
  };

  const onPageLoadSuccess = async (page: any) => {
    if (!canvasRef.current || !containerRef.current) return;

    const viewport = page.getViewport({ scale: 1.5 });
    canvasRef.current.width = viewport.width;
    canvasRef.current.height = viewport.height;

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
    }

    // สร้าง Fabric Canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: viewport.width,
      height: viewport.height,
      isDrawingMode: activeTool === 'draw',
    });

    // ตั้งค่า Brush (ตรวจสอบความปลอดภัยก่อนใช้)
    if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = brushColor;
        canvas.freeDrawingBrush.width = brushSize;
    } else {
        // ถ้าไม่มี ให้สร้างใหม่ (เผื่อกรณี fabric version เก่า)
        const brush = new fabric.PencilBrush(canvas);
        brush.color = brushColor;
        brush.width = brushSize;
        canvas.freeDrawingBrush = brush;
    }

    fabricCanvasRef.current = canvas;

    if (pagesAnnotations.current[pageNumber]) {
      canvas.loadFromJSON(pagesAnnotations.current[pageNumber], canvas.renderAll.bind(canvas));
    }
    
    handleToolChange(activeTool);
  };

  const handleToolChange = (tool: 'select' | 'draw' | 'text' | 'rect') => {
    setActiveTool(tool);
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = tool === 'draw';

    if (tool === 'draw') {
        if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = brushColor;
            canvas.freeDrawingBrush.width = brushSize;
        }
    } else {
        canvas.selection = tool === 'select';
        canvas.defaultCursor = 'default';
    }
  };

  const addObject = (type: 'text' | 'rect') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    handleToolChange('select');

    if (type === 'text') {
      const text = new fabric.IText('พิมพ์ข้อความ...', {
        left: 100, top: 100,
        fontFamily: 'Arial',
        fill: brushColor,
        fontSize: 20,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
    } else if (type === 'rect') {
      const rect = new fabric.Rect({
        left: 100, top: 100,
        width: 100, height: 60,
        fill: 'transparent',
        stroke: brushColor,
        strokeWidth: 3,
      });
      canvas.add(rect);
      canvas.setActiveObject(rect);
    }
  };

  const deleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.discardActiveObject();
      activeObjects.forEach((obj: fabric.Object) => {
        canvas.remove(obj);
      });
    }
  };

  const handleSave = async () => {
    if (!fabricCanvasRef.current || !pdfBlob || !file) return;
    setIsSaving(true);

    try {
      const currentJson = fabricCanvasRef.current.toJSON();
      pagesAnnotations.current[pageNumber] = currentJson;

      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pdfPages = pdfDoc.getPages();

      const pageIndices = Object.keys(pagesAnnotations.current).map(Number);
      const canvas = fabricCanvasRef.current;

      for (const pIndex of pageIndices) {
        if (pIndex > pdfPages.length) continue;

        await new Promise<void>((resolve) => {
            canvas.loadFromJSON(pagesAnnotations.current[pIndex], () => {
                canvas.renderAll();
                resolve();
            });
        });

        if (canvas.getObjects().length === 0) continue;

        const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
        const pngImageBytes = await fetch(dataUrl).then(res => res.arrayBuffer());
        
        const pngImage = await pdfDoc.embedPng(pngImageBytes);
        const pdfPage = pdfPages[pIndex - 1];
        const { width, height } = pdfPage.getSize();

        pdfPage.drawImage(pngImage, {
          x: 0, y: 0, width: width, height: height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const newFileName = `EDITED_${Date.now()}_${file.fileName}`;
      
      const newFile = new File([pdfBytes as any], newFileName, { type: 'application/pdf' });

      await onSave(newFile);
      onClose();

    } catch (error) {
      console.error("Save failed:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกไฟล์");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-[70] flex flex-col items-center justify-center p-4">
      
      <div className="bg-white w-full max-w-6xl rounded-t-lg p-3 flex items-center justify-between border-b shadow-md z-10">
        <div className="flex items-center space-x-2">
            <h3 className="font-bold text-gray-700 mr-4 hidden sm:block truncate max-w-[200px]">{file.fileName}</h3>
            
            <div className="flex bg-gray-100 rounded-lg p-1 space-x-1">
                <button onClick={() => handleToolChange('select')} className={`p-2 rounded ${activeTool === 'select' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`} title="เลือก/ย้าย"><MousePointer size={18}/></button>
                <button onClick={() => handleToolChange('draw')} className={`p-2 rounded ${activeTool === 'draw' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`} title="วาดเส้น"><Pen size={18}/></button>
                <button onClick={() => { handleToolChange('text'); addObject('text'); }} className={`p-2 rounded ${activeTool === 'text' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`} title="พิมพ์ข้อความ"><Type size={18}/></button>
                <button onClick={() => { handleToolChange('rect'); addObject('rect'); }} className={`p-2 rounded ${activeTool === 'rect' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`} title="สร้างสี่เหลี่ยม"><Square size={18}/></button>
            </div>

            <input 
                type="color" 
                value={brushColor} 
                onChange={(e) => { 
                    setBrushColor(e.target.value); 
                    if(fabricCanvasRef.current && fabricCanvasRef.current.freeDrawingBrush) {
                        fabricCanvasRef.current.freeDrawingBrush.color = e.target.value; 
                    }
                }} 
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                title="เลือกสี"
            />
            
            <button onClick={deleteSelected} className="p-2 rounded text-red-500 hover:bg-red-50 hover:text-red-600" title="ลบที่เลือก"><Eraser size={18}/></button>
        </div>

        <div className="flex items-center space-x-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center disabled:bg-blue-400">
                {isSaving ? <Spinner className="w-4 h-4 mr-2 text-white"/> : <Save size={16} className="mr-2"/>}
                บันทึกไฟล์ใหม่
            </button>
        </div>
      </div>

      <div className="bg-gray-500 w-full max-w-6xl h-[80vh] overflow-auto flex justify-center relative" ref={containerRef}>
        {pdfBlob ? (
            <Document
                file={pdfBlob}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                className="my-4 shadow-lg"
                loading={<div className="text-white mt-10"><Spinner className="text-white"/></div>}
            >
                <div className="relative">
                    <Page 
                        pageNumber={pageNumber} 
                        scale={1.5} 
                        renderTextLayer={false} 
                        renderAnnotationLayer={false}
                        onRenderSuccess={onPageLoadSuccess}
                    />
                    <div className="absolute top-0 left-0 z-10">
                        <canvas ref={canvasRef} />
                    </div>
                </div>
            </Document>
        ) : (
            <div className="flex items-center justify-center h-full text-white">กำลังโหลดเอกสาร...</div>
        )}
      </div>

      <div className="bg-white w-full max-w-6xl rounded-b-lg p-3 flex items-center justify-center border-t">
        <button onClick={() => changePage(-1)} disabled={pageNumber <= 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft/></button>
        <span className="mx-4 text-sm text-gray-600">หน้า {pageNumber} จาก {numPages}</span>
        <button onClick={() => changePage(1)} disabled={pageNumber >= numPages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight/></button>
      </div>

    </div>
  );
}