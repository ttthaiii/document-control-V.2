'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth/useAuth';
import { ROLES, Role } from '@/lib/config/workflow';
import { CheckCircle, Copy, AlertTriangle, FileText, Upload, Download, UserPlus, Users } from 'lucide-react';

// --- Interfaces ---
interface InviteUserFormData {
  email: string;
  name: string;
  employeeId: string;
  role: Role;
  sites: string[];
}

interface CsvUser {
  email: string;
  name: string;
  employeeId: string;
  role: string;
}

interface Site { id: string; name: string; }

export function InviteUserForm() {
  const { firebaseUser } = useAuth();
  const [mode, setMode] = useState<'single' | 'batch'>('single'); 
  const [loading, setLoading] = useState(false);
  
  const [result, setResult] = useState<{ success: boolean; invitationUrl?: string; warning?: string; error?: string; } | null>(null);
  const [batchResult, setBatchResult] = useState<{ success: number; failed: number; details: any[] } | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedUsers, setParsedUsers] = useState<CsvUser[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  const [availableSites, setAvailableSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteUserFormData>();

  useEffect(() => {
    const fetchSites = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) setAvailableSites(data.sites);
      } catch (error) { console.error("Failed to fetch sites", error); } 
      finally { setSitesLoading(false); }
    };
    fetchSites();
  }, [firebaseUser]);

  // --- Logic: CSV Parser (แก้ไขใหม่) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvError(null);
    setBatchResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    try {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 2) throw new Error("ไฟล์ CSV ว่างเปล่าหรือรูปแบบไม่ถูกต้อง");

        // 1. Clean Headers: ลบ BOM (อักขระพิเศษจาก Excel) และแปลงเป็น lowercase
        const headers = lines[0]
            .replace(/^\uFEFF/, '') // ลบ BOM
            .split(',')
            .map(h => h.trim().toLowerCase().replace(/[\r\n"]/g, ''));

        // Validate Headers
        if (!headers.includes('email') || !headers.includes('role')) {
            throw new Error("CSV ต้องมีคอลัมน์ Email และ Role เป็นอย่างน้อย");
        }

        const users: CsvUser[] = [];
        
        for (let i = 1; i < lines.length; i++) {
            // รองรับ CSV ที่อาจจะมี comma ใน quote (แบบง่าย) หรือ split ปกติ
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, '')); 
            
            if (values.length < headers.length) continue;

            const tempObj: any = {};
            headers.forEach((header, index) => {
                tempObj[header] = values[index];
            });

            // 2. Map Fields ให้ตรงกับ API (Mapping Logic)
            // API ต้องการ: email, name, employeeId, role
            const mappedUser: any = {
                email: tempObj['email'],
                name: tempObj['name'] || tempObj['fullname'] || '',
                role: tempObj['role'] || tempObj['position'] || '',
                // Map หลายชื่อ เพื่อความยืดหยุ่น
                employeeId: tempObj['employeeid'] || tempObj['id'] || tempObj['empid'] || tempObj['employee_id'] || '' 
            };

            // กรองแถวว่าง
            if (mappedUser.email) {
                users.push(mappedUser as CsvUser);
            }
        }
        
        if (users.length === 0) throw new Error("ไม่พบข้อมูลที่ถูกต้องในไฟล์");
        setParsedUsers(users);

    } catch (err: any) {
        console.error("CSV Parse Error:", err);
        setCsvError(err.message);
        setParsedUsers([]);
    }
  };

  // --- Submit Single ---
  const onSingleSubmit = async (data: InviteUserFormData) => {
    setLoading(true); setResult(null);
    try {
      const token = await firebaseUser?.getIdToken();
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const resData = await response.json();
      if (resData.success) {
        setResult({ success: true, invitationUrl: resData.invitationUrl, warning: resData.warning });
        reset();
      } else {
        setResult({ success: false, error: resData.error });
      }
    } catch (error) { setResult({ success: false, error: 'Network error' }); } 
    finally { setLoading(false); }
  };

  // --- Submit Batch ---
  const onBatchSubmit = async () => {
    if (parsedUsers.length === 0 || selectedSites.length === 0) return;
    
    setLoading(true); 
    setBatchResult(null);
    setCsvError(null);

    try {
        const token = await firebaseUser?.getIdToken();
        
        // Debug: ดูข้อมูลที่จะส่งไป
        console.log("Sending Batch Data:", { users: parsedUsers, sites: selectedSites });

        const response = await fetch('/api/admin/invite/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ users: parsedUsers, sites: selectedSites }),
        });
        const resData = await response.json();
        
        if (resData.success) {
            setBatchResult(resData.summary);
            setParsedUsers([]); // Clear data on success
            setCsvFile(null);
            // Reset file input
            const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
            if(fileInput) fileInput.value = '';
        } else {
            setCsvError(resData.error || "เกิดข้อผิดพลาดในการส่งข้อมูล");
        }
    } catch (error) { 
        setCsvError('Network error while sending batch request'); 
    }
    finally { setLoading(false); }
  };

  // --- Helper: Download Template ---
  const downloadTemplate = () => {
    const csvContent = "\uFEFFEmail,Name,EmployeeId,Role\nuser1@example.com,Somchai Jaidee,EMP001,BIM\nuser2@example.com,Somsri Rakngan,EMP002,Site Admin";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ttsdoc_invite_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSiteSelection = (siteId: string, checked: boolean) => {
      setSelectedSites(prev => checked ? [...prev, siteId] : prev.filter(id => id !== siteId));
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-lg border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">เชิญผู้ใช้ใหม่</h2>
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
                onClick={() => setMode('single')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${mode === 'single' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <UserPlus size={16} className="mr-2"/> ทีละคน
            </button>
            <button 
                onClick={() => setMode('batch')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${mode === 'batch' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <Users size={16} className="mr-2"/> Import CSV
            </button>
        </div>
      </div>

      {/* === FORM: SINGLE MODE === */}
      {mode === 'single' && (
        <form onSubmit={handleSubmit(onSingleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">รหัสพนักงาน <span className="text-red-500">*</span></label>
                    <input type="text" {...register('employeeId', { required: 'จำเป็น' })} className="w-full px-3 py-2 border rounded-md" placeholder="EMP-001" />
                    {errors.employeeId && <span className="text-xs text-red-500">กรุณากรอกข้อมูล</span>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                    <input type="text" {...register('name', { required: 'จำเป็น' })} className="w-full px-3 py-2 border rounded-md" placeholder="สมชาย ใจดี" />
                    {errors.name && <span className="text-xs text-red-500">กรุณากรอกข้อมูล</span>}
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล <span className="text-red-500">*</span></label>
                    <input type="email" {...register('email', { required: 'จำเป็น' })} className="w-full px-3 py-2 border rounded-md" placeholder="user@example.com" />
                    {errors.email && <span className="text-xs text-red-500">กรุณากรอกข้อมูล</span>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ตำแหน่ง <span className="text-red-500">*</span></label>
                    <select {...register('role', { required: 'จำเป็น' })} className="w-full p-2 border rounded-md">
                        <option value="">-- เลือก --</option>
                        {Object.values(ROLES).map((role) => (<option key={role} value={role}>{role}</option>))}
                    </select>
                    {errors.role && <span className="text-xs text-red-500">กรุณาเลือก</span>}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">โครงการ <span className="text-red-500">*</span></label>
                {sitesLoading ? <p className="text-xs text-gray-500">Loading...</p> : (
                    <div className="mt-1 p-3 border rounded-md max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {availableSites.map(site => (
                            <label key={site.id} className="flex items-center text-sm">
                                <input type="checkbox" {...register('sites', { required: true })} value={site.id} className="mr-2 text-blue-600 rounded" />
                                {site.name}
                            </label>
                        ))}
                    </div>
                )}
                {errors.sites && <span className="text-xs text-red-500">เลือกอย่างน้อย 1 โครงการ</span>}
            </div>

            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                {loading ? 'กำลังส่ง...' : 'ส่งคำเชิญ'}
            </button>

            {result && (
                <div className={`mt-4 p-4 rounded border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {result.success ? (
                        <div className="flex items-start">
                            <CheckCircle className="w-5 h-5 text-green-600 mr-2 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-green-800">สำเร็จ!</h4>
                                <p className="text-sm text-green-700">{result.warning || "ส่งอีเมลเรียบร้อยแล้ว"}</p>
                                <div className="mt-2 flex gap-2">
                                    <input readOnly value={result.invitationUrl} className="text-xs border rounded px-2 py-1 w-full" />
                                    <button onClick={() => navigator.clipboard.writeText(result.invitationUrl!)} className="p-1 bg-gray-200 rounded"><Copy size={14}/></button>
                                </div>
                            </div>
                        </div>
                    ) : <p className="text-red-700 text-sm">Error: {result.error}</p>}
                </div>
            )}
        </form>
      )}

      {/* === FORM: BATCH MODE === */}
      {mode === 'batch' && (
        <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                    <FileText size={16} className="mr-2"/> คำแนะนำการเตรียมไฟล์
                </h3>
                <p className="text-xs text-blue-600 mb-3">
                    ไฟล์ CSV ต้องมีหัวตาราง: <code className="bg-blue-100 px-1 rounded">Email, Name, EmployeeId, Role</code>
                </p>
                <button onClick={downloadTemplate} className="text-xs flex items-center text-blue-700 hover:underline">
                    <Download size={14} className="mr-1"/> ดาวน์โหลดไฟล์ตัวอย่าง (Template)
                </button>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">1. เลือกโครงการ (จะถูกเพิ่มให้ทุกคนในไฟล์) <span className="text-red-500">*</span></label>
                <div className="p-3 border rounded-md max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50">
                    {availableSites.map(site => (
                        <label key={site.id} className="flex items-center text-sm">
                            <input 
                                type="checkbox" 
                                checked={selectedSites.includes(site.id)}
                                onChange={(e) => handleSiteSelection(site.id, e.target.checked)}
                                className="mr-2 text-blue-600 rounded" 
                            />
                            {site.name}
                        </label>
                    ))}
                </div>
                {selectedSites.length === 0 && <p className="text-xs text-red-500 mt-1">* กรุณาเลือกอย่างน้อย 1 โครงการ</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">2. อัปโหลดไฟล์ CSV</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                    <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
                    <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
                        <Upload size={32} className="text-gray-400 mb-2"/>
                        <span className="text-sm text-gray-600 font-medium">คลิกเพื่อเลือกไฟล์ CSV</span>
                        <span className="text-xs text-gray-400 mt-1">หรือลากไฟล์มาวางที่นี่</span>
                    </label>
                </div>
                {csvFile && (
                    <div className="mt-2 flex items-center justify-between bg-gray-50 p-2 rounded text-sm">
                        <span className="truncate font-medium">{csvFile.name}</span>
                        <span className="text-green-600 text-xs bg-green-100 px-2 py-0.5 rounded-full">พบ {parsedUsers.length} รายการ</span>
                    </div>
                )}
                {csvError && <p className="text-xs text-red-500 mt-2">{csvError}</p>}
            </div>

            {/* Preview Table */}
            {parsedUsers.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs font-semibold border-b">ตัวอย่างข้อมูล (5 รายการแรก)</div>
                    <table className="min-w-full text-xs text-left">
                        <thead className="bg-white border-b">
                            <tr>
                                <th className="px-3 py-2">Email</th>
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">ID</th>
                                <th className="px-3 py-2">Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedUsers.slice(0, 5).map((u, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    <td className="px-3 py-2 truncate max-w-[120px]">{u.email}</td>
                                    <td className="px-3 py-2 truncate max-w-[100px]">{u.name}</td>
                                    <td className="px-3 py-2">{u.employeeId}</td>
                                    <td className="px-3 py-2">{u.role}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {parsedUsers.length > 5 && <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50 text-center">...และอีก {parsedUsers.length - 5} รายการ</div>}
                </div>
            )}

            <button 
                onClick={onBatchSubmit} 
                disabled={loading || parsedUsers.length === 0 || selectedSites.length === 0} 
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
                {loading ? `กำลังประมวลผล...` : `นำเข้าและส่งคำเชิญ ${parsedUsers.length} รายการ`}
            </button>

            {/* Batch Result */}
            {batchResult && (
                <div className="mt-4 p-4 bg-gray-50 border rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-2">สรุปผลการนำเข้า</h4>
                    <div className="flex gap-4 text-sm mb-3">
                        <span className="text-green-600 flex items-center"><CheckCircle size={16} className="mr-1"/> สำเร็จ: {batchResult.success}</span>
                        <span className="text-red-600 flex items-center"><XCircle size={16} className="mr-1"/> ล้มเหลว: {batchResult.failed}</span>
                    </div>
                    {batchResult.details.filter(d => d.status === 'error').length > 0 && (
                        <div className="max-h-32 overflow-y-auto border-t pt-2">
                            <p className="text-xs font-medium text-red-500 mb-1">รายการที่ผิดพลาด:</p>
                            <ul className="space-y-1">
                                {batchResult.details.filter(d => d.status === 'error').map((d, i) => (
                                    <li key={i} className="text-xs text-gray-600 flex justify-between">
                                        <span>{d.email}</span>
                                        <span className="text-red-500">{d.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
      )}
    </div>
  );
}

import { XCircle } from 'lucide-react';