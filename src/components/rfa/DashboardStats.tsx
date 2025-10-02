'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth/useAuth';
import { STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/lib/config/workflow'; // Import STATUS_COLORS
import { Loader2 } from 'lucide-react';
import { RFADocument } from '@/types/rfa';

// ... (Interface StatsData, Category ไม่มีการเปลี่ยนแปลง) ...
interface StatsData {
  responsibleParty: { [key: string]: number };
  categories: { [key: string]: number };
}
interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
}


// ✅✅✅ [FIX 1] อัปเดต Interface ของ Props ทั้งหมด ✅✅✅
interface DashboardStatsProps {
  allDocuments: RFADocument[]; 
  onChartFilter: (filterKey: string, value: string) => void; // ✅ [REVERT] value เป็น string เท่านั้น
  activeFilters: { 
    rfaType: string; 
    status: string; // ✅ [REVERT] status เป็น string
    categoryId: string; 
  }; 
  categories: Category[];
}

// ... (Component CustomTooltip, const CATEGORY_COLORS, function getColorForString ไม่มีการเปลี่ยนแปลง) ...
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
  // ... (ส่วน state, useMemo ของ stats, categoryData, displayData ไม่มีการเปลี่ยนแปลง) ...
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
      responsibleParty: { BIM: 0, SITE: 0, CM: 0, APPROVED: 0, REJECTED: 0 },
      categories: {},
    };
    for (const doc of docsForStats) {
      switch (doc.status) {
        case STATUSES.PENDING_REVIEW:
        case STATUSES.PENDING_FINAL_APPROVAL:
            newStats.responsibleParty.SITE += 1;
            break;
        case STATUSES.PENDING_CM_APPROVAL:
            newStats.responsibleParty.CM += 1;
            break;
        case STATUSES.REVISION_REQUIRED:
        case STATUSES.APPROVED_REVISION_REQUIRED:
            newStats.responsibleParty.BIM += 1;
            break;
        case STATUSES.REJECTED:
             newStats.responsibleParty.REJECTED += 1;
            break;
        case STATUSES.APPROVED:
        case STATUSES.APPROVED_WITH_COMMENTS:
            newStats.responsibleParty.APPROVED += 1;
            break;
      }
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
      { name: 'รอ SITE ตรวจสอบ', value: stats.responsibleParty.SITE, statusKey: STATUSES.PENDING_REVIEW, color: STATUS_COLORS[STATUSES.PENDING_REVIEW] },
      { name: 'รอ CM อนุมัติ', value: stats.responsibleParty.CM, statusKey: STATUSES.PENDING_CM_APPROVAL, color: STATUS_COLORS[STATUSES.PENDING_CM_APPROVAL] },
      { name: 'รอ BIM แก้ไข', value: stats.responsibleParty.BIM, statusKey: STATUSES.REVISION_REQUIRED, color: STATUS_COLORS[STATUSES.REVISION_REQUIRED] },
      { name: 'อนุมัติแล้ว', value: stats.responsibleParty.APPROVED, statusKey: STATUSES.APPROVED, color: STATUS_COLORS[STATUSES.APPROVED] },
      { name: 'ไม่อนุมัติ', value: stats.responsibleParty.REJECTED, statusKey: STATUSES.REJECTED, color: STATUS_COLORS[STATUSES.REJECTED] }
    ].filter(item => item.value > 0);
  }, [stats]);

  const categoryData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.categories)
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
  }, [stats, categories]);

  const { displayData: displayResponsibleData, total: displayTotalResponsible } = useMemo(() => {
    const total = responsiblePartyData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: responsiblePartyData, total };
  }, [responsiblePartyData]);

  const { displayData: displayCategoryData, total: displayTotalCategory } = useMemo(() => {
    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
    return { displayData: categoryData, total };
  }, [categoryData]);


  if (!stats) { return <div className="text-center p-8 text-gray-500">ไม่มีข้อมูลสำหรับแสดงผล</div>; }

  // ✅✅✅ [FIX 2] แก้ไข Logic ของ Click Handler ทั้งหมด ✅✅✅
  const handleResponsibleClick = (data: any) => {
      const statusKey = data.payload?.statusKey || data.statusKey;
      if (!statusKey) return;
      
      // ถ้าคลิกที่สถานะที่เลือกไว้อยู่แล้ว ให้ยกเลิก Filter, ถ้าไม่ ให้เลือกสถานะนั้น
      onChartFilter('status', activeFilters.status === statusKey ? 'ALL' : statusKey);
  };
  
  const handleCategoryClick = (data: any) => {
    const categoryId = data.id; // ใช้ data.id จาก legend payload
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
                    {/* ✅✅✅ [FIX 3] แก้ไข Logic การแสดง Opacity ✅✅✅ */}
                    {displayResponsibleData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`} 
                        fill={entry.color} 
                        style={{ opacity: activeFilters.status === 'ALL' || activeFilters.status === entry.statusKey ? 1 : 0.3 }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  {/* ✅✅✅ [FIX 4] ทำให้ Legend คลิกได้และเป็นวงกลม ✅✅✅ */}
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