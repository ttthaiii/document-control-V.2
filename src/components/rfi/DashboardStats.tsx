// src/components/rfi/DashboardStats.tsx
//
// Two donut charts, same shape as RFA's dashboard/rfa/DashboardStats.tsx (so both
// modules read as one visual system): status breakdown + หมวดงาน (discipline)
// breakdown, click-to-filter, count in the middle. Category colors + the muted status
// theme both come from '@/lib/config/chartColors' — the single declared palette RFA's
// chart already uses — instead of a second copy that could drift out of theme.
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RFI_ACTIVE_STATUSES, RFI_STATUS_LABELS, RFI_STATUS_COLORS } from '@/lib/config/rfi-workflow';
import { getCategoryColor } from '@/lib/config/chartColors';
import { RFIDocument } from '@/types/rfi';

interface DashboardStatsProps {
  allDocuments: RFIDocument[];
  categoryDocuments: RFIDocument[];
  onChartFilter: (filterKey: 'status' | 'categoryId', value: string) => void;
  activeFilters: { status: string; categoryId: string };
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

const DashboardStats: React.FC<DashboardStatsProps> = ({ allDocuments, categoryDocuments, onChartFilter, activeFilters }) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => setIsSmallScreen(window.innerWidth < 1280);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of allDocuments) counts[doc.status] = (counts[doc.status] || 0) + 1;
    return RFI_ACTIVE_STATUSES
      .map(status => ({
        name: RFI_STATUS_LABELS[status],
        value: counts[status] || 0,
        statusKey: status as string,
        color: RFI_STATUS_COLORS[status] || '#94a3b8',
      }))
      .filter(item => item.value > 0);
  }, [allDocuments]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of categoryDocuments) {
      const name = doc.category?.categoryCode;
      if (!name || name === 'N/A' || name === '-') continue;
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, color: getCategoryColor(name) }))
      .sort((a, b) => b.value - a.value);
  }, [categoryDocuments]);

  const totalStatus = statusData.reduce((sum, item) => sum + item.value, 0);
  const totalCategory = categoryData.reduce((sum, item) => sum + item.value, 0);

  if (allDocuments.length === 0 && categoryDocuments.length === 0) {
    return <div className="text-center p-8 text-gray-500 bg-white rounded-lg shadow border border-gray-100">ไม่มีข้อมูลเอกสาร</div>;
  }

  const handleStatusClick = (data: any) => {
    const statusKey = data.payload?.statusKey || data.statusKey;
    if (!statusKey) return;
    onChartFilter('status', activeFilters.status === statusKey ? 'ALL' : statusKey);
  };

  const handleCategoryClick = (data: any) => {
    const name = data.payload?.name || data.name;
    if (!name) return;
    onChartFilter('categoryId', activeFilters.categoryId === name ? 'ALL' : name);
  };

  const innerRadius = isSmallScreen ? 80 : 100;
  const outerRadius = isSmallScreen ? 110 : 135;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Chart 1: Status Distribution */}
      <div className="bg-white p-6 rounded-lg shadow h-full border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">สถานะเอกสาร</h3>
        <div className="relative w-full h-[380px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={statusData}
                isAnimationActive={false}
                cx="50%" cy="50%"
                innerRadius={innerRadius} outerRadius={outerRadius}
                dataKey="value" nameKey="name"
                onClick={handleStatusClick}
                className="cursor-pointer"
                paddingAngle={2}
              >
                {statusData.map((entry) => (
                  <Cell
                    key={`cell-${entry.name}`}
                    fill={entry.color}
                    stroke="none"
                    style={{ opacity: activeFilters.status === 'ALL' || activeFilters.status === entry.statusKey ? 1 : 0.2 }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                onClick={handleStatusClick}
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
            <span className="text-4xl font-bold text-gray-800 leading-none">{totalStatus}</span>
          </div>
        </div>
      </div>

      {/* Chart 2: Discipline (หมวดงาน) */}
      <div className="bg-white p-6 rounded-lg shadow h-full border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">หมวดงาน</h3>
        <div className="relative w-full h-[380px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={categoryData}
                isAnimationActive={false}
                cx="50%" cy="50%"
                innerRadius={innerRadius} outerRadius={outerRadius}
                dataKey="value" nameKey="name"
                onClick={handleCategoryClick}
                className="cursor-pointer"
                paddingAngle={2}
              >
                {categoryData.map((entry) => (
                  <Cell
                    key={`cell-${entry.name}`}
                    fill={entry.color}
                    stroke="none"
                    style={{ opacity: activeFilters.categoryId === 'ALL' || activeFilters.categoryId === entry.name ? 1 : 0.2 }}
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
            <span className="text-4xl font-bold text-gray-800 leading-none">{totalCategory}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
