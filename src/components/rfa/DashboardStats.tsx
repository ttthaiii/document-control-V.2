// src/components/rfa/DashboardStats.tsx (แก้ไขใหม่ทั้งหมด)
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/lib/config/workflow';
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

// --- Helper Components (ไม่มีการเปลี่ยนแปลง) ---
const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="p-3 bg-white/90 backdrop-blur-sm shadow-lg rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div style={{ width: 12, height: 12, backgroundColor: data.payload.color, marginRight: 8, borderRadius: '50%' }}></div>
            <p className="text-sm text-gray-700">{`${data.name}: ${data.value}`}</p>
          </div>
        </div>
      );
    }
    return null;
};
const CATEGORY_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF6363', '#BC5090'];
const getColorForString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % CATEGORY_COLORS.length);
    return CATEGORY_COLORS[index];
};


const DashboardStats: React.FC<DashboardStatsProps> = ({ allDocuments, onChartFilter, activeFilters, categories }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // --- 👇 [แก้ไข] Logic การนับข้อมูลสถานะใหม่ทั้งหมด ---
  const statsByStatus = useMemo(() => {
    const statusCounts: { [key: string]: number } = {};
    const categoryCounts: { [key: string]: number } = {};
    
    for (const doc of allDocuments) {
      // นับทุกสถานะแยกกัน
      statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;
      
      const categoryId = doc.category?.id || 'N/A';
      if (categoryId !== 'N/A') {
          categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
      }
    }
    return { statusCounts, categoryCounts };
  }, [allDocuments]);

  // --- 👇 [แก้ไข] Logic การสร้างข้อมูลสำหรับ Chart สถานะใหม่ทั้งหมด ---
  const responsiblePartyData = useMemo(() => {
    if (!statsByStatus) return [];
    
    // แปลงข้อมูลที่นับได้ ให้เป็นรูปแบบที่ Chart ใช้งานได้
    return Object.entries(statsByStatus.statusCounts)
      .map(([statusKey, value]) => {
        // ดึงชื่อและสีมาจาก workflow.ts
        const label = STATUS_LABELS[statusKey];
        const color = STATUS_COLORS[statusKey];
        
        if (!label || !color) return null; // ไม่แสดงสถานะที่ไม่มีการตั้งค่า

        return {
          name: label,
          value: value,
          statusKey: statusKey, // Key ที่จะใช้ filter คือ key ของสถานะจริงๆ
          color: color,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.value > 0);
  }, [statsByStatus]);


  // --- Logic ส่วน Category ไม่มีการเปลี่ยนแปลง ---
  const categoryData = useMemo(() => {
    if (!statsByStatus) return [];
    return Object.entries(statsByStatus.categoryCounts)
      .map(([categoryId, value]) => {
        const categoryDetails = categories.find(c => c.id === categoryId);
        return {
          id: categoryId,
          name: categoryDetails?.categoryCode || categoryId,
          value: value as number,
          color: getColorForString(categoryDetails?.categoryCode || categoryId)
        };
      })
      .filter(item => item.value > 0);
  }, [statsByStatus, categories]);

  // --- Logic ส่วนที่เหลือไม่มีการเปลี่ยนแปลง ---
  const { displayData: displayResponsibleData, total: displayTotalResponsible } = useMemo(() => {
    const total = responsiblePartyData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: responsiblePartyData, total };
  }, [responsiblePartyData]);

  const { displayData: displayCategoryData, total: displayTotalCategory } = useMemo(() => {
    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: categoryData, total };
  }, [categoryData]);

  if (allDocuments.length === 0) { return <div className="text-center p-8 text-gray-500">ไม่มีข้อมูลสำหรับแสดงผล</div>; }

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
  
  const pieCx = isMobile ? '50%' : '40%';
  const textLeftPosition = isMobile ? '50%' : '30%';
  const textTopPosition = isMobile ? '45%' : '50%';
  
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะตามผู้รับผิดชอบ</h3>
            <div className="relative w-full h-[300px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayResponsibleData}
                    isAnimationActive={false}
                    cx={pieCx} cy="50%"
                    innerRadius={isMobile ? 80 : 115} outerRadius={isMobile ? 110 : 150}
                    dataKey="value" nameKey="name"
                    onClick={handleResponsibleClick}
                    className="cursor-pointer"
                  >
                    {displayResponsibleData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`} 
                        fill={entry.color} 
                        style={{ opacity: activeFilters.status === 'ALL' || activeFilters.status === entry.statusKey ? 1 : 0.3 }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    onClick={handleResponsibleClick}
                    layout={isMobile ? 'horizontal' : 'vertical'}
                    verticalAlign={isMobile ? 'bottom' : 'middle'}
                    align={isMobile ? 'center' : 'right'}
                    wrapperStyle={isMobile ? { paddingTop: '20px' } : {}}
                    width={isMobile ? undefined : 150}
                    className="cursor-pointer"
                  />
                </PieChart>
              </ResponsiveContainer>
              <div 
                className="absolute -translate-y-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
                style={{ top: textTopPosition, left: textLeftPosition }}
              >
                <span className="text-base text-gray-500">จำนวนเอกสาร</span>
                <span className="text-4xl font-bold text-gray-800 mt-1">{displayTotalResponsible}</span>
              </div>
            </div>
          </div>
      </div>
      
      <div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะตามหมวดหมู่</h3>
            <div className="relative w-full h-[300px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayCategoryData}
                    isAnimationActive={false}
                    cx={pieCx} cy="50%"
                    innerRadius={isMobile ? 80 : 115} outerRadius={isMobile ? 110 : 150}
                    dataKey="value" nameKey="name"
                    onClick={handleCategoryClick}
                    className="cursor-pointer"
                  >
                    {displayCategoryData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`}
                        fill={entry.color}
                        style={{ opacity: activeFilters.categoryId === 'ALL' || activeFilters.categoryId === entry.id ? 1 : 0.3 }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    onClick={handleCategoryClick}
                    layout={isMobile ? 'horizontal' : 'vertical'}
                    verticalAlign={isMobile ? 'bottom' : 'middle'}
                    align={isMobile ? 'center' : 'right'}
                    wrapperStyle={isMobile ? { paddingTop: '20px' } : {}}
                    width={isMobile ? undefined : 150}
                    className="cursor-pointer"
                  />
                </PieChart>
              </ResponsiveContainer>
              <div 
                className="absolute -translate-y-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
                style={{ top: textTopPosition, left: textLeftPosition }}
              >
                <span className="text-base text-gray-500">จำนวนเอกสาร</span>
                <span className="text-4xl font-bold text-gray-800 mt-1">{displayTotalCategory}</span>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};

export default DashboardStats;