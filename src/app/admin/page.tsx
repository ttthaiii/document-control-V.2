import { InviteUserForm } from '@/lib/components/admin/InviteUserForm';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
          👑 Admin Panel - ttsdoc v2
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Invite User Form */}
          <div>
            <InviteUserForm />
          </div>
          
          {/* Instructions */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4 text-gray-800">
              📋 วิธีใช้งาน
            </h2>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-1 text-xs mr-3 mt-0.5">1</span>
                <p>ใส่อีเมลและเลือกตำแหน่งงานของผู้ใช้ใหม่</p>
              </div>
              <div className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-1 text-xs mr-3 mt-0.5">2</span>
                <p>คลิก "สร้างคำเชิญ" เพื่อสร้าง invitation link</p>
              </div>
              <div className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-1 text-xs mr-3 mt-0.5">3</span>
                <p>Copy link และส่งให้ผู้ใช้ทาง LINE, WhatsApp, หรือทางอื่น</p>
              </div>
              <div className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-1 text-xs mr-3 mt-0.5">4</span>
                <p>ผู้ใช้คลิก link → ตั้งรหัสผ่าน → เข้าใช้งานได้เลย</p>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm">
                💡 <strong>Tips:</strong> Link จะหมดอายุใน 7 วัน หากผู้ใช้ไม่ได้ใช้งานภายในเวลาที่กำหนด 
                จะต้องสร้าง invitation ใหม่
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}