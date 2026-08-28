// src/lib/utils/markupExport.ts
import * as XLSX from 'xlsx';

export interface MarkupEntry {
  page: number;
  author: string;
  text: string;
  createdAt: string;
  id: string;
}

export function exportMarkupListToExcel(entries: MarkupEntry[], fileName: string) {
  const rows = entries.map(e => ({
    'หน้า': e.page,
    'ผู้บันทึก': e.author,
    'ข้อความ': e.text,
    'วันที่': e.createdAt ? new Date(e.createdAt).toLocaleString('th-TH') : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Markup List');
  XLSX.writeFile(workbook, fileName);
}
