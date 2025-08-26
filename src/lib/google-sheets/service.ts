// lib/google-sheets/service.ts (ไฟล์ใหม่)
import { google } from 'googleapis';

interface TaskData {
  taskCategory: string;    // หมวดงาน (Column E)
  taskName: string;        // ชื่องาน (Column B)
  projectName: string;     // โครงการ (Column C)
  taskUid?: string;        // ลำดับ (Column A)
  startDate?: string;      // วันเริ่ม
  finishDate?: string;     // วันจบ
  percentComplete?: number; // ความคืบหน้า
}

interface SheetConfig {
  sheetId: string;
  sheetName: string;
}

export class GoogleSheetsService {
  private sheets: any;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * ดึงข้อมูลจาก Google Sheets
   */
  async getSheetData(sheetId: string, sheetName: string = 'DB_TaskOverview'): Promise<any[]> {
    try {
      console.log(`📊 Reading from sheet: ${sheetId}/${sheetName}`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!A:Z`, // อ่านทุกคอลัมน์
      });

      const rows = response.data.values || [];
      
      if (rows.length === 0) {
        throw new Error('No data found in sheet');
      }

      // แถวแรกเป็น header
      const headers = rows[0];
      const dataRows = rows.slice(1);

      console.log(`📋 Found ${dataRows.length} rows with headers:`, headers);

      return dataRows.map((row: any[]) => {
        const rowData: any = {};
        headers.forEach((header: string, index: number) => {
          rowData[header] = row[index] || '';
        });
        return rowData;
      });

    } catch (error) {
      console.error('❌ Error reading from Google Sheets:', error);
      throw new Error(`Cannot read from Google Sheets: ${error}`);
    }
  }

  /**
   * ดึงรายชื่อโครงการทั้งหมดจาก sheet
   */
  async getAvailableProjects(sheetId: string, sheetName: string = 'DB_TaskOverview'): Promise<string[]> {
    try {
      const data = await this.getSheetData(sheetId, sheetName);
      
      // ดึงโครงการที่ไม่ซ้ำจากคอลัมน์ 'โครงการ'
      const projects = Array.from(new Set(
        data
          .map((row: any) => row['โครงการ'] || row['Project'] || '') // รองรับทั้งไทยและอังกฤษ
          .filter((project: string) => project.trim())
          .map((project: string) => project.trim())
      )).sort();

      console.log(`🏗️ Found ${projects.length} projects:`, projects);
      
      return projects;

    } catch (error) {
      console.error('❌ Error getting projects:', error);
      throw error;
    }
  }

  /**
   * ดึงหมวดงานตามโครงการ
   */
  async getTaskCategoriesByProject(sheetId: string, projectName: string, sheetName: string = 'DB_TaskOverview'): Promise<string[]> {
    try {
      const data = await this.getSheetData(sheetId, sheetName);
      
      // กรองเฉพาะโครงการที่ระบุ
      const projectTasks = data.filter((row: any) => {
        const rowProject = row['โครงการ'] || row['Project'] || '';
        return rowProject.trim() === projectName.trim();
      });

      // ดึงหมวดงานที่ไม่ซ้ำ
      const categories = Array.from(new Set(
        projectTasks
          .map((row: any) => row['หมวดงาน'] || row['Category'] || '')
          .filter((category: string) => category.trim())
          .map((category: string) => category.trim())
      )).sort();

      console.log(`📂 Project "${projectName}" has ${categories.length} categories:`, categories);
      
      return categories;

    } catch (error) {
      console.error('❌ Error getting categories:', error);
      throw error;
    }
  }

  /**
   * ดึงชื่องานตามโครงการและหมวดงาน
   */
  async getTasksByProjectAndCategory(
    sheetId: string, 
    projectName: string, 
    category: string, 
    sheetName: string = 'DB_TaskOverview'
  ): Promise<TaskData[]> {
    try {
      const data = await this.getSheetData(sheetId, sheetName);
      
      // กรองตามโครงการและหมวดงาน
      const filteredTasks = data.filter((row: any) => {
        const rowProject = row['โครงการ'] || row['Project'] || '';
        const rowCategory = row['หมวดงาน'] || row['Category'] || '';
        
        return rowProject.trim() === projectName.trim() && 
               rowCategory.trim() === category.trim();
      });

      // แปลงเป็น TaskData format
      const tasks: TaskData[] = filteredTasks.map((row: any) => ({
        taskCategory: row['หมวดงาน'] || row['Category'] || '',
        taskName: row['ชื่องาน'] || row['Task Name'] || '',
        projectName: row['โครงการ'] || row['Project'] || '',
        taskUid: row['ลำดับ'] || row['UID'] || '',
        startDate: row['วันเริ่ม'] || row['Start Date'] || '',
        finishDate: row['วันจบ'] || row['Finish Date'] || '',
        percentComplete: parseFloat(row['ความคืบหน้า'] || row['Progress'] || '0') || 0
      }));

      console.log(`📋 Found ${tasks.length} tasks for "${projectName}" > "${category}"`);
      
      return tasks;

    } catch (error) {
      console.error('❌ Error getting tasks:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบว่าโครงการมีอยู่ใน sheet หรือไม่
   */
  async validateProjectInSheet(sheetId: string, projectName: string, sheetName: string = 'DB_TaskOverview'): Promise<{
    isValid: boolean;
    availableProjects: string[];
    tasksCount?: number;
  }> {
    try {
      const availableProjects = await this.getAvailableProjects(sheetId, sheetName);
      const isValid = availableProjects.includes(projectName);
      
      let tasksCount = 0;
      if (isValid) {
        const data = await this.getSheetData(sheetId, sheetName);
        tasksCount = data.filter((row: any) => {
          const rowProject = row['โครงการ'] || row['Project'] || '';
          return rowProject.trim() === projectName.trim();
        }).length;
      }

      return {
        isValid,
        availableProjects,
        tasksCount
      };

    } catch (error) {
      console.error('❌ Error validating project:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const googleSheetsService = new GoogleSheetsService();