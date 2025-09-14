// src/components/rfa/DashboardStats.tsx (แก้ไขแล้ว)
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth/useAuth';
import { STATUSES, STATUS_LABELS } from '@/lib/config/workflow';
import { Loader2 } from 'lucide-react';
import { RFADocument } from '@/types/rfa';

// ... (Interfaces and constants remain the same) ...
interface StatsData {
  responsibleParty: { [key: string]: number };
  categories: { [key: string]: number };
}
interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
}
interface DashboardStatsProps {
  allDocuments: RFADocument[]; 
  onChartFilter: (filterKey: string, value: string) => void;
  activeFilters: { rfaType: string; status: string; categoryId: string }; 
  categories: Category[];
}

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

const STATUS_COLORS: { [key: string]: string } = {
  [STATUSES.PENDING_REVIEW]: '#0088FE',
  [STATUSES.PENDING_CM_APPROVAL]: '#00C49F',
  [STATUSES.REVISION_REQUIRED]: '#FFBB28',
  [STATUSES.APPROVED]: '#28A745',
  [STATUSES.REJECTED]: '#DC3545',
  [STATUSES.APPROVED_WITH_COMMENTS]: '#20C997',
  [STATUSES.APPROVED_REVISION_REQUIRED]: '#FD7E14',
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
  
  const stats = useMemo<StatsData | null>(() => {
    const docsForStats = allDocuments; 
      
    const newStats: StatsData = {
      responsibleParty: { BIM: 0, SITE: 0, CM: 0, APPROVED: 0 },
      categories: {},
    };

    for (const doc of docsForStats) {
      switch (doc.status) {
        case STATUSES.PENDING_REVIEW:
            newStats.responsibleParty.SITE += 1;
            break;
        case STATUSES.PENDING_CM_APPROVAL:
            newStats.responsibleParty.CM += 1;
            break;
        case STATUSES.REVISION_REQUIRED:
        case STATUSES.APPROVED_REVISION_REQUIRED:
            newStats.responsibleParty.BIM += 1;
            break;
        case STATUSES.APPROVED:
        case STATUSES.APPROVED_WITH_COMMENTS:
            newStats.responsibleParty.APPROVED += 1;
            break;
      }

      // ✅ KEY CHANGE: Consistently use doc.category.id for aggregation key
      const categoryId = doc.category?.id || 'N/A';
      if (categoryId !== 'N/A') {
          newStats.categories[categoryId] = (newStats.categories[categoryId] || 0) + 1;
      }
    }
    return newStats;
  }, [allDocuments]);

  const responsiblePartyData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: STATUS_LABELS[STATUSES.PENDING_REVIEW], value: stats.responsibleParty.SITE, statusKey: STATUSES.PENDING_REVIEW, color: STATUS_COLORS[STATUSES.PENDING_REVIEW] },
      { name: STATUS_LABELS[STATUSES.PENDING_CM_APPROVAL], value: stats.responsibleParty.CM, statusKey: STATUSES.PENDING_CM_APPROVAL, color: STATUS_COLORS[STATUSES.PENDING_CM_APPROVAL] },
      { name: STATUS_LABELS[STATUSES.REVISION_REQUIRED], value: stats.responsibleParty.BIM, statusKey: STATUSES.REVISION_REQUIRED, color: STATUS_COLORS[STATUSES.REVISION_REQUIRED] },
      { name: STATUS_LABELS[STATUSES.APPROVED], value: stats.responsibleParty.APPROVED, statusKey: STATUSES.APPROVED, color: STATUS_COLORS[STATUSES.APPROVED] },
    ].filter(item => item.value > 0);
  }, [stats]);

  // ✅ KEY CHANGE: Logic updated to map from categoryId (the key) to its details
  const categoryData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.categories)
      .map(([categoryId, value]) => {
        const categoryDetails = categories.find(c => c.id === categoryId);
        return {
          id: categoryId,
          name: categoryDetails?.categoryCode || categoryId, // Display code, fallback to ID
          value: value as number,
          color: getColorForString(categoryDetails?.categoryCode || categoryId)
        };
      })
      .filter(item => item.value > 0);
  }, [stats, categories]);

  // ... (The rest of the file remains the same) ...
  const { displayData: displayResponsibleData, total: displayTotalResponsible } = useMemo(() => {
    const total = responsiblePartyData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: responsiblePartyData, total };
  }, [responsiblePartyData]);

  const { displayData: displayCategoryData, total: displayTotalCategory } = useMemo(() => {
    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: categoryData, total };
  }, [categoryData]);


  if (!stats) { return <div className="text-center p-8 text-gray-500">ไม่มีข้อมูลสำหรับแสดงผล</div>; }

  const handleResponsibleClick = (data: any) => {
    const statusKey = data.payload.statusKey;
    onChartFilter('status', activeFilters.status === statusKey ? 'ALL' : statusKey);
  };

  const handleCategoryClick = (data: any) => {
    const categoryId = data.payload.id;
    onChartFilter('categoryId', activeFilters.categoryId === categoryId ? 'ALL' : categoryId);
  };
  
  const pieCx = isMobile ? '50%' : '40%';
  const textLeftPosition = isMobile ? '50%' : '30%';
  const textTopPosition = isMobile ? '45%' : '50%';
  
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div>
          {/* Responsible Party Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะตามผู้รับผิดชอบ</h3>
            <div className="relative w-full h-[300px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayResponsibleData}
                    cx={pieCx}
                    cy="50%"
                    innerRadius={isMobile ? 80 : 115}
                    outerRadius={isMobile ? 110 : 150}
                    dataKey="value"
                    nameKey="name"
                    onClick={handleResponsibleClick}
                    className="cursor-pointer"
                    isAnimationActive={false}
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
                    layout={isMobile ? 'horizontal' : 'vertical'}
                    verticalAlign={isMobile ? 'bottom' : 'middle'}
                    align={isMobile ? 'center' : 'right'}
                    wrapperStyle={isMobile ? { paddingTop: '20px' } : {}}
                    width={isMobile ? undefined : 150}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div 
                className="absolute -translate-y-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
                style={{ 
                  top: textTopPosition,
                  left: textLeftPosition 
                }}
              >
                <span className="text-base text-gray-500">จำนวนเอกสาร</span>
                <span className="text-4xl font-bold text-gray-800 mt-1">{displayTotalResponsible}</span>
              </div>
            </div>
          </div>
      </div>
      
      <div>
          {/* Category Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะตามหมวดหมู่</h3>
            <div className="relative w-full h-[300px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayCategoryData}
                    cx={pieCx}
                    cy="50%"
                    innerRadius={isMobile ? 80 : 115}
                    outerRadius={isMobile ? 110 : 150}
                    dataKey="value"
                    nameKey="name"
                    onClick={handleCategoryClick}
                    className="cursor-pointer"
                    isAnimationActive={false}
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
                    layout={isMobile ? 'horizontal' : 'vertical'}
                    verticalAlign={isMobile ? 'bottom' : 'middle'}
                    align={isMobile ? 'center' : 'right'}
                    wrapperStyle={isMobile ? { paddingTop: '20px' } : {}}
                    width={isMobile ? undefined : 150}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div 
                className="absolute -translate-y-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
                style={{ 
                  top: textTopPosition,
                  left: textLeftPosition 
                }}
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