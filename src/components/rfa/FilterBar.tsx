// src/components/rfa/FilterBar.tsx

import React from 'react';
import { Search } from 'lucide-react';
import { Site, Category } from '@/types/rfa';
import { STATUS_LABELS, CREATOR_ROLES } from '@/lib/config/workflow';

// กำหนด Type ของ Props ที่ Component นี้ต้องการ
interface Filters {
  rfaType: string;
  status: string;
  siteId: string;
  showAllRevisions: boolean;
  categoryId: string;
  responsibleParty: string;
}

interface FilterBarProps {
  filters: Filters;
  handleFilterChange: (key: keyof Filters, value: any) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  resetFilters: () => void;
  sites: Site[];
  categories: Category[];
  availableStatuses: string[];
  availableResponsibleParties: { value: string; label: string }[];
}

const inputStyle = "w-full mt-1 h-10 px-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none";

const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  handleFilterChange,
  searchTerm,
  setSearchTerm,
  resetFilters,
  sites,
  categories,
  availableStatuses,
  availableResponsibleParties,
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        {/* Project Filter */}
        <div className="md:col-span-2">
          <label htmlFor="site-filter" className="text-sm font-medium text-gray-700">โครงการ</label>
          <select
            id="site-filter"
            value={filters.siteId}
            onChange={(e) => handleFilterChange('siteId', e.target.value)}
            // 🟢 แก้ไข: เติม bg-white text-gray-900
            className={inputStyle}
          >
            <option value="ALL">ทุกโครงการ</option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search Filter */}
        <div className="md:col-span-2">
          <label htmlFor="search-filter" className="text-sm font-medium text-gray-700">ค้นหา</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              id="search-filter"
              type="text"
              placeholder="เลขที่, ชื่อเอกสาร..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              // 🟢 แก้ไข: เติม bg-white text-gray-900
              className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className="md:col-span-2">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">สถานะ</label>
          <select
            id="status-filter"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            // 🟢 แก้ไข: เติม bg-white text-gray-900
            className={inputStyle} // ✅ ใช้ class ใหม่
          >
            <option value="ALL">ทุกสถานะ</option>
            {availableStatuses.map(statusKey => (
              <option key={statusKey} value={statusKey}>
                {STATUS_LABELS[statusKey] || statusKey}
              </option>
            ))}
          </select>
        </div>

        {/* Responsible Party Filter */}
        <div className="md:col-span-2">
          <label htmlFor="responsible-party-filter" className="text-sm font-medium text-gray-700">ผู้รับผิดชอบ</label>
          <select
            id="responsible-party-filter"
            value={filters.responsibleParty}
            onChange={(e) => handleFilterChange('responsibleParty', e.target.value)}
            className={inputStyle}
          >
            {availableResponsibleParties.map(party => (
              <option key={party.value} value={party.value}>{party.label}</option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div className="md:col-span-2">
          <label htmlFor="category-filter" className="text-sm font-medium text-gray-700">หมวดงาน</label>
          <select
            id="category-filter"
            className={inputStyle}
            value={filters.categoryId}
            onChange={(e) => handleFilterChange('categoryId', e.target.value)}
          >
            <option value="ALL">ทุกหมวดงาน</option>
            {categories.map(cat => (
              <option key={cat.categoryCode} value={cat.categoryCode}>
                {cat.categoryCode}
              </option>
            ))}
          </select>
        </div>

        {/* Checkbox */}
        <div className="md:col-span-1 flex items-center h-10">
          <input
            id="show-all-revisions"
            type="checkbox"
            checked={filters.showAllRevisions}
            onChange={(e) => handleFilterChange('showAllRevisions', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none cursor-pointer"
          />
          <label htmlFor="show-all-revisions" className="ml-2 text-sm text-gray-700 cursor-pointer select-none">ทุกฉบับ</label>
        </div>

        {/* Reset Button */}
        <div className="md:col-span-1">
          <button
            onClick={resetFilters}
            className="w-full h-10 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-colors"
            aria-label="รีเซ็ตตัวกรองทั้งหมด"
          >
            รีเซ็ต
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;