// src/components/rfa/DashboardStats.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { STATUS_LABELS } from '@/lib/config/workflow'; 
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
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', 
  '#FF6363', '#BC5090', '#36A2EB', '#FFCE56', '#4BC0C0', 
  '#9966FF', '#FF9F40', '#8AC926', '#1982C4', '#6A4C93', 
  '#F15BB5', '#FEE440', '#00B4D8', '#90BE6D', '#F94144'
];

// ✅ ปรับชุดสี: แยก REJECTED ออกมาให้ชัดเจน
const RESPONSIBLE_COLORS: { [key: string]: string } = {
    'SITE': '#3B82F6',      // Blue (Site Review)
    'CM': '#8B5CF6',        // Violet (CM Approval)
    'BIM': '#F59E0B',       // Amber/Orange (Fixing)
    'APPROVED': '#10B981',  // Emerald (Done)
    'REJECTED': '#EF4444',  // Red (Rejected) <-- เพิ่มสีแดงสำหรับไม่อนุมัติ
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
    
    // ✅ Mapping ใหม่: แยก REJECTED ไปหากลุ่มสีแดง
    const groupMapping: { [key: string]: string } = {
        'PENDING_REVIEW': 'SITE',
        'PENDING_FINAL_APPROVAL': 'SITE',
        'PENDING_CM_APPROVAL': 'CM',
        'REVISION_REQUIRED': 'BIM',
        'APPROVED_REVISION_REQUIRED': 'BIM',
        'APPROVED': 'APPROVED',
        'APPROVED_WITH_COMMENTS': 'APPROVED',
        'REJECTED': 'REJECTED' // <-- แยกกลุ่มออกมา
    };

    return Object.entries(statsByStatus.statusCounts)
      .map(([statusKey, value]) => {
        const label = STATUS_LABELS[statusKey];
        const group = groupMapping[statusKey] || 'SITE';
        const color = RESPONSIBLE_COLORS[group] || '#999';

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
      {/* Chart 1: Responsible Party */}
      <div>
          <div className="bg-white p-6 rounded-lg shadow h-full border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะตามผู้รับผิดชอบ</h3>
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