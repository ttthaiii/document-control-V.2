// src/components/rfa/DashboardStats.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { STATUS_LABELS, STATUSES } from '@/lib/config/workflow';
import { getCategoryColor, MUTED_PALETTE } from '@/lib/config/chartColors';
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
  availableStatuses: string[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="p-3 bg-white/90 backdrop-blur-sm shadow-lg rounded-lg border border-gray-200 z-50">
        <div className="flex items-center">
          <span
            className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
            style={{ backgroundColor: data.payload.color }}
            aria-hidden="true"
          />
          <p className="text-sm text-text-body font-medium">{`${data.name}: ${data.value}`}</p>
        </div>
      </div>
    );
  }
  return null;
};

// CATEGORY_COLORS + getCategoryColor now come from '@/lib/config/chartColors' —
// single declared source so RFI's หมวดงาน chart uses the exact same palette.

// ✅ [แก้ไข 1] กำหนดสีแยกรายสถานะให้ชัดเจน (ไม่ Group รวมกันแล้ว)
// Values now reference MUTED_PALETTE (same hex as before — no visual change) so
// another module's status enum can reuse these exact tones by name.
const STATUS_CHART_COLORS: { [key: string]: string } = {
  // กลุ่มสีเทาอมฟ้า/หิน (รออนุมัติ - สงบ รอคอย)
  [STATUSES.PENDING_REVIEW]: MUTED_PALETTE.slateGrey,           // เทาอมฟ้าตุ่นๆ
  [STATUSES.PENDING_CM_APPROVAL]: MUTED_PALETTE.deepSlate,      // เทาเข้มขึ้นมาหน่อย
  [STATUSES.PENDING_FINAL_APPROVAL]: MUTED_PALETTE.blueGrey,    // เทากลางๆ

  // กลุ่มสีเขียวธรรมชาติ (ผ่าน - สำเร็จ)
  [STATUSES.APPROVED]: MUTED_PALETTE.mossGreen,                 // เขียวมอส/เขียวใบไม้แก่
  [STATUSES.APPROVED_WITH_COMMENTS]: MUTED_PALETTE.mutedTeal,   // เขียวอมฟ้าปนเทา - ให้ดูต่างจากมอส

  // กลุ่มสีดิน/ทราย (แก้ไข - แจ้งเตือน)
  [STATUSES.REVISION_REQUIRED]: MUTED_PALETTE.mutedLime,        // เหลืองอมเขียวตุ่นๆ
  [STATUSES.APPROVED_REVISION_REQUIRED]: MUTED_PALETTE.terracotta, // สีส้มอิฐ/ดินเผา - แจ้งเตือนเข้มข้นกว่า

  // กลุ่มสีแดงสนิม (ไม่ผ่าน - ปฏิเสธ)
  [STATUSES.REJECTED]: MUTED_PALETTE.rust,                      // แดงสนิม/ดินแดงเข้ม
};

const DashboardStats: React.FC<DashboardStatsProps> = ({ allDocuments, onChartFilter, activeFilters, categories, availableStatuses }) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => setIsSmallScreen(window.innerWidth < 1280);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const statsByStatus = useMemo(() => {
    const statusCounts: { [key: string]: number } = {};
    const categoryCounts: { [key: string]: { value: number, name: string } } = {};
    for (const doc of allDocuments) {
      statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;
      const categoryId = doc.category?.id || 'N/A';
      const categoryName = doc.category?.categoryCode || categoryId;
      if (categoryName !== 'N/A') {
        if (!categoryCounts[categoryName]) {
          categoryCounts[categoryName] = { value: 0, name: categoryName };
        }
        categoryCounts[categoryName].value += 1;
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
    const entries = Object.entries(statsByStatus.categoryCounts).sort((a, b) => b[1].value - a[1].value);

    return entries.map(([categoryId, { value, name }]) => {
      return {
        id: categoryId,
        name: name,
        value: value,
        color: getCategoryColor(name)
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
    const categoryName = data.payload?.name || data.name;
    if (!categoryName) return;
    onChartFilter('categoryId', activeFilters.categoryId === categoryName ? 'ALL' : categoryName);
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
                  {displayResponsibleData.map((entry) => {
                    // Highlight logic: 
                    // 1. If a specific status is selected, only highlight that one.
                    // 2. If 'ALL' is selected for status, but a specific Responsible Party is selected, 
                    //    highlight all statuses belonging to that party (which is what availableStatuses holds).
                    // 3. Otherwise, highlight everything.
                    const isHighlighted = activeFilters.status === 'ALL'
                      ? availableStatuses.includes(entry.statusKey)
                      : activeFilters.status === entry.statusKey;

                    return (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={entry.color}
                        stroke="none"
                        style={{ opacity: isHighlighted ? 1 : 0.2 }}
                      />
                    );
                  })}
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
              style={{ top: '42%', left: '50%', transform: 'translate(-50%, -50%)' }}
            >
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">TOTAL</span>
              <span className="text-4xl font-bold text-gray-800 leading-none">{displayTotalResponsible}</span>
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
                      style={{ opacity: activeFilters.categoryId === 'ALL' || activeFilters.categoryId === entry.name ? 1 : 0.3 }}
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
              style={{ top: '42%', left: '50%', transform: 'translate(-50%, -50%)' }}
            >
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">TOTAL</span>
              <span className="text-4xl font-bold text-gray-800 leading-none">{displayTotalCategory}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;