// src/components/rfa/DashboardStats.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { STATUS_LABELS, STATUSES } from '@/lib/config/workflow'; 
import { RFADocument } from '@/types/rfa';

interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
}

interface DashboardStatsProps {
  allDocuments: RFADocument[]; 
  onChartFilter: (filterKey: string, value: string) => void;
  activeFilters: { 
    rfaType: string; 
    status: string;
    categoryId: string; 
  }; 
  categories: Category[];
}

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="p-3 bg-white/90 backdrop-blur-sm shadow-lg rounded-lg border border-gray-200 z-50">
          <div className="flex items-center">
            <div style={{ width: 12, height: 12, backgroundColor: data.payload.color, marginRight: 8, borderRadius: '50%' }}></div>
            <p className="text-sm text-gray-700 font-medium">{`${data.name}: ${data.value}`}</p>
          </div>
        </div>
      );
    }
    return null;
};

const CATEGORY_COLORS = [
  '#5D4037', // Dark Coffee (น้ำตาลเข้มกาแฟ)
  '#7CB342', // Grass Green (เขียวหญ้า)
  '#EF6C00', // Persimmon (ส้มลูกพลับ)
  '#455A64', // Blue Grey (เทาอมฟ้าเข้ม)
  '#C0CA33', // Muted Lime (เขียวมะนาวตุ่น)
  '#8D6E63', // Taupe (น้ำตาลเทา)
  '#00897B', // Teal (เขียวหัวเป็ด)
  '#FBC02D', // Mustard (เหลืองมัสตาร์ด)
  '#6D4C41', // Cocoa (น้ำตาลโกโก้)
  '#2E7D32', // Forest Green (เขียวป่า)
  '#D84315', // Burnt Sienna (ส้มอิฐไหม้)
  '#546E7A', // Slate (เทาหินชนวน)
  '#9E9D24', // Olive (เขียวมะกอก)
  '#3E2723', // Espresso (น้ำตาลเข้มเกือบดำ)
  '#FFB74D', // Apricot (ส้มอ่อน)
  '#00695C', // Deep Teal (เขียวทะเลลึก)
  '#AFB42B', // Olive Yellow (เหลืองอมเขียว)
  '#795548', // Earth Brown (น้ำตาลดิน)
  '#90A4AE', // Light Slate (เทาหินอ่อน)
  '#A1887F', // Sand (สีทรายเข้ม)
];

// ✅ [แก้ไข 1] กำหนดสีแยกรายสถานะให้ชัดเจน (ไม่ Group รวมกันแล้ว)
const STATUS_CHART_COLORS: { [key: string]: string } = {
    // กลุ่มสีเทาอมฟ้า/หิน (รออนุมัติ - สงบ รอคอย)
    [STATUSES.PENDING_REVIEW]: '#78909C',           // Slate Grey (เทาอมฟ้าตุ่นๆ)
    [STATUSES.PENDING_CM_APPROVAL]: '#546E7A',      // Deep Slate (เทาเข้มขึ้นมาหน่อย)
    [STATUSES.PENDING_FINAL_APPROVAL]: '#607D8B',   // Blue Grey (เทากลางๆ)
    
    // กลุ่มสีเขียวธรรมชาติ (ผ่าน - สำเร็จ)
    [STATUSES.APPROVED]: '#558B2F',                 // Moss Green (เขียวมอส/เขียวใบไม้แก่)
    [STATUSES.APPROVED_WITH_COMMENTS]: '#4DB6AC',   // Muted Teal / Sage (เขียวอมฟ้าปนเทา - ให้ดูต่างจากมอส)
    
    // กลุ่มสีดิน/ทราย (แก้ไข - แจ้งเตือน)
    [STATUSES.REVISION_REQUIRED]: '#C0CA33',        // Muted Lime / Olive Yellow (เหลืองอมเขียวตุ่นๆ)
    [STATUSES.APPROVED_REVISION_REQUIRED]: '#D87D4A', // Terracotta / Muted Orange (สีส้มอิฐ/ดินเผา - แจ้งเตือนเข้มข้นกว่า)
    
    // กลุ่มสีแดงสนิม (ไม่ผ่าน - ปฏิเสธ)
    [STATUSES.REJECTED]: '#A5574C',                 // Rust Red / Clay (แดงสนิม/ดินแดงเข้ม)
};

const DashboardStats: React.FC<DashboardStatsProps> = ({ allDocuments, onChartFilter, activeFilters, categories }) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => setIsSmallScreen(window.innerWidth < 1280);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const statsByStatus = useMemo(() => {
    const statusCounts: { [key: string]: number } = {};
    const categoryCounts: { [key: string]: number } = {};
    for (const doc of allDocuments) {
      statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;
      const categoryId = doc.category?.id || 'N/A';
      if (categoryId !== 'N/A') {
          categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
      }
    }
    return { statusCounts, categoryCounts };
  }, [allDocuments]);

  const responsiblePartyData = useMemo(() => {
    if (!statsByStatus) return [];
    
    // ✅ [แก้ไข 2] ยกเลิกการใช้ groupMapping แล้วดึงสีจาก STATUS_CHART_COLORS โดยตรง
    return Object.entries(statsByStatus.statusCounts)
      .map(([statusKey, value]) => {
        const label = STATUS_LABELS[statusKey];
        // ดึงสีตาม Key ของสถานะเป๊ะๆ ถ้าไม่เจอให้ใช้สีเทา
        const color = STATUS_CHART_COLORS[statusKey] || '#94a3b8';

        if (!label) return null;
        return { name: label, value: value, statusKey: statusKey, color: color };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.value > 0);
  }, [statsByStatus]);

  const categoryData = useMemo(() => {
    if (!statsByStatus) return [];
    const entries = Object.entries(statsByStatus.categoryCounts).sort((a, b) => b[1] - a[1]); 

    return entries.map(([categoryId, value], index) => {
        const categoryDetails = categories.find(c => c.id === categoryId);
        return {
          id: categoryId,
          name: categoryDetails?.categoryCode || categoryId,
          value: value as number,
          color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] 
        };
      })
      .filter(item => item.value > 0);
  }, [statsByStatus, categories]);

  const { displayData: displayResponsibleData, total: displayTotalResponsible } = useMemo(() => {
    const total = responsiblePartyData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: responsiblePartyData, total };
  }, [responsiblePartyData]);

  const { displayData: displayCategoryData, total: displayTotalCategory } = useMemo(() => {
    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: categoryData, total };
  }, [categoryData]);

  if (allDocuments.length === 0) { return <div className="text-center p-8 text-gray-500 bg-white rounded-lg shadow border border-gray-100">ไม่มีข้อมูลเอกสาร</div>; }

  const handleResponsibleClick = (data: any) => {
      const statusKey = data.payload?.statusKey || data.statusKey;
      if (!statusKey) return;
      onChartFilter('status', activeFilters.status === statusKey ? 'ALL' : statusKey);
  };
  
  const handleCategoryClick = (data: any) => {
    const categoryId = data.payload?.id || data.id;
    if (!categoryId) return;
    onChartFilter('categoryId', activeFilters.categoryId === categoryId ? 'ALL' : categoryId);
  };
  
  const innerRadius = isSmallScreen ? 80 : 100; 
  const outerRadius = isSmallScreen ? 110 : 135; 

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Chart 1: Status Distribution */}
      <div>
          <div className="bg-white p-6 rounded-lg shadow h-full border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะเอกสาร</h3>
            <div className="relative w-full h-[380px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayResponsibleData}
                    isAnimationActive={false}
                    cx="50%" cy="50%" 
                    innerRadius={innerRadius} outerRadius={outerRadius}
                    dataKey="value" nameKey="name"
                    onClick={handleResponsibleClick}
                    className="cursor-pointer"
                    paddingAngle={2}
                  >
                    {displayResponsibleData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`} 
                        fill={entry.color} 
                        stroke="none"
                        style={{ opacity: activeFilters.status === 'ALL' || activeFilters.status === entry.statusKey ? 1 : 0.3 }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    onClick={handleResponsibleClick}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }}
                    className="cursor-pointer"
                  />
                </PieChart>
              </ResponsiveContainer>
              <div 
                className="absolute flex flex-col items-center justify-center pointer-events-none"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -60%)' }}
              >
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">TOTAL</span>
                <span className="text-3xl font-bold text-gray-800">{displayTotalResponsible}</span>
              </div>
            </div>
          </div>
      </div>
      
      {/* Chart 2: Category */}
      <div>
          <div className="bg-white p-6 rounded-lg shadow h-full border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะตามหมวดหมู่</h3>
            <div className="relative w-full h-[380px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayCategoryData}
                    isAnimationActive={false}
                    cx="50%" cy="50%"
                    innerRadius={innerRadius} outerRadius={outerRadius}
                    dataKey="value" nameKey="name"
                    onClick={handleCategoryClick}
                    className="cursor-pointer"
                    paddingAngle={2}
                  >
                    {displayCategoryData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`}
                        fill={entry.color}
                        stroke="none"
                        style={{ opacity: activeFilters.categoryId === 'ALL' || activeFilters.categoryId === entry.id ? 1 : 0.3 }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    onClick={handleCategoryClick}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }}
                    className="cursor-pointer"
                  />
                </PieChart>
              </ResponsiveContainer>
              <div 
                className="absolute flex flex-col items-center justify-center pointer-events-none"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -60%)' }}
              >
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">TOTAL</span>
                <span className="text-3xl font-bold text-gray-800">{displayTotalCategory}</span>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};

export default DashboardStats;