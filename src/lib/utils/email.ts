import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInvitationEmail(
  to: string, 
  inviteLink: string, 
  inviterName: string,
  userData: { name: string, role: string }
) {
  // ✅ แก้ไขข้อความหัวเรื่องใน HTML
  const headerText = "ยินดีต้อนรับสู่ระบบ TTS Document Control"; 
  const themeColor = "#f97316";
  
  const htmlContent = `
    <div style="font-family: 'Sarabun', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: ${themeColor}; padding: 20px; text-align: center;">
        <h2 style="color: white; margin: 0; font-size: 20px;">${headerText}</h2>
      </div>
      
      <div style="padding: 30px; background-color: #ffffff;">
        <p style="font-size: 16px; color: #374151;">เรียน คุณ <strong>${userData.name}</strong>,</p>
        
        <p style="color: #4b5563; line-height: 1.6;">
          คุณได้รับเชิญให้เข้าร่วมระบบบริหารจัดการเอกสารภายในโครงการ (TTS Document Control)
        </p>
        
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <table style="width: 100%;">
            <tr>
              <td style="color: #6b7280; width: 100px;">ตำแหน่ง:</td>
              <td style="font-weight: bold; color: #111827;">${userData.role}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: ${themeColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            ตั้งรหัสผ่านและเริ่มใช้งาน
          </a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          หากปุ่มกดไม่ได้ สามารถคลิกลิงก์ด้านล่าง:<br>
          <a href="${inviteLink}" style="color: ${themeColor};">${inviteLink}</a>
        </p>
      </div>
      
      <div style="background-color: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #9ca3af;">
        © TTS Engineering - Automated System
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: to,
    // ✅ แก้ไขหัวข้ออีเมล (Subject) ที่จะแสดงใน Inbox ผู้รับ
    subject: 'แจ้งเชิญเข้าร่วมใช้งานระบบบริหารจัดการเอกสารภายในโครงการ (TTS Document Control)', 
    html: htmlContent,
  });
}