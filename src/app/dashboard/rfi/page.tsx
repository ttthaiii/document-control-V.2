'use client'

// src/app/dashboard/rfi/page.tsx
//
// The RFI list page. Same shape as dashboard/rfa/page.tsx — a live onSnapshot query,
// client-side filters, a create modal — with three deliberate differences:
//
//   1. No list API. The page reads Firestore directly, so an answer posted by SITE
//      shows up on BIM's screen without a refresh.
//   2. Filters include รอใครอยู่ and เกินกำหนด, which is how the RFI workflow is
//      actually navigated. The words Internal/External appear nowhere (D-01).
//   3. Filter controls are inline rather than a FilterBar component: RFI has its own
//      filter set, and a shared component would need a prop for every difference.

import React, { Suspense, useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import RFIListTable from '@/components/rfi/RFIListTable'
import CreateRFIForm from '@/components/rfi/CreateRFIForm'
import RFIDetailModal from '@/components/rfi/RFIDetailModal'
import { RFIDocument } from '@/types/rfi'
import { Role } from '@/lib/config/workflow'
import {
  RFI_STATUS_LABELS,
  RFI_PARTY_LABELS,
  RFI_PARTY_COLORS,
  RFI_DISCIPLINES,
  getResponsibleParties,
  isOverdue,
  RFIParty,
} from '@/lib/config/rfi-workflow'
import { PERMISSION_KEYS, PERMISSION_DEFAULTS } from '@/lib/config/permissions'
import { Plus, RefreshCw, HelpCircle, RotateCcw, Search } from 'lucide-react'
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot, orderBy, documentId } from 'firebase/firestore'

interface Site {
  id: string;
  name: string;
  /** userId -> permission group ('RFI') -> key ('create_rfi') -> granted. */
  userOverrides?: { [userId: string]: Record<string, Record<string, boolean>> };
}

interface Filters {
  status: string;
  siteId: string;
  categoryId: string;
  responsibleParty: string;
  overdueOnly: boolean;
}

const INITIAL_FILTERS: Filters = {
  status: 'ALL', siteId: 'ALL', categoryId: 'ALL', responsibleParty: 'ALL', overdueOnly: false,
};

const selectClass = "h-10 px-3 border border-gray-300 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none";

function RFIContent() {
  const { user, firebaseUser } = useAuth();
  const searchParams = useSearchParams();

  const [allDocuments, setAllDocuments] = useState<RFIDocument[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<Filters>({
    ...INITIAL_FILTERS,
    // Lets the sidebar or a notification link land on a pre-filtered view.
    responsibleParty: searchParams.get('party') || 'ALL',
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<RFIDocument | null>(null);

  // --- Projects (live, because userOverrides drive the create button) ---
  useEffect(() => {
    if (!user?.sites || user.sites.length === 0) {
      setSites([]);
      return;
    }
    const sitesQuery = query(collection(db, 'sites'), where(documentId(), 'in', user.sites));
    const unsubscribe = onSnapshot(sitesQuery, (snapshot) => {
      setSites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site)));
    });
    return () => unsubscribe();
  }, [user]);

  // --- Documents (live) ---
  useEffect(() => {
    if (!firebaseUser || !user?.sites || user.sites.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Needs the composite index siteId + updatedAt (firestore.indexes.json).
    const q = query(
      collection(db, 'rfiDocuments'),
      where('siteId', 'in', user.sites),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: RFIDocument[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // The document stores siteId only; the name is joined in below from `sites`.
          site: { id: data.siteId, name: '' },
          category: {
            id: data.categoryId,
            categoryCode: data.categoryCode || data.categoryName || '-',
            categoryName: data.categoryName || '',
          },
          permissions: {},
        } as RFIDocument;
      });
      setAllDocuments(docs);
      setLoading(false);
    }, (error) => {
      console.error('[RFI] Error fetching realtime documents:', error.code, error.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firebaseUser, user]);

  // --- Create permission (default role list + per-site override, same as RFA) ---
  const canCreate = useMemo(() => {
    if (!user) return false;
    const permKey = `RFI.${PERMISSION_KEYS.RFI.CREATE}`;
    const [group, key] = permKey.split('.');
    const defaultAllowed = (PERMISSION_DEFAULTS[permKey] || []).includes(user.role as Role);

    // No sites loaded yet — fall back to the role default so the button is not
    // hidden by a slow query.
    if (sites.length === 0) return defaultAllowed;

    return sites.some(site => {
      const override = site.userOverrides?.[user.id]?.[group]?.[key];
      if (override !== undefined) return override === true;
      return defaultAllowed;
    });
  }, [user, sites]);

  const documentsWithSiteNames = useMemo(() => {
    const sitesMap = new Map(sites.map(s => [s.id, s.name]));
    return allDocuments.map(doc => ({
      ...doc,
      site: { ...doc.site, name: sitesMap.get(doc.site.id) || 'N/A' },
    }));
  }, [allDocuments, sites]);

  const filteredDocuments = useMemo(() => {
    let docs = documentsWithSiteNames;

    if (filters.status !== 'ALL') docs = docs.filter(d => d.status === filters.status);
    if (filters.siteId !== 'ALL') docs = docs.filter(d => d.site.id === filters.siteId);
    if (filters.categoryId !== 'ALL') docs = docs.filter(d => d.category?.categoryCode === filters.categoryId);
    if (filters.overdueOnly) docs = docs.filter(d => isOverdue(d));

    if (filters.responsibleParty !== 'ALL') {
      // A document appears under EVERY party it is waiting on, so the two-party case
      // (answer BIM + forward to CM) is not lost from either filter.
      docs = docs.filter(d => getResponsibleParties(d).includes(filters.responsibleParty as RFIParty));
    }

    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      docs = docs.filter(d =>
        (d.runningNumber || '').toLowerCase().includes(search) ||
        (d.documentNumber || '').toLowerCase().includes(search) ||
        (d.title || '').toLowerCase().includes(search)
      );
    }

    return docs;
  }, [documentsWithSiteNames, filters, searchTerm]);

/**
   * Counts run on the project-filtered set, so they match what the table shows.
   *
   * Party counts are computed for EVERY party and the empty ones are dropped when the
   * cards render. There are five asking/answering parties now (BIM, ME, SN, SITE, CM)
   * and showing all five on a project that only has BIM work would be noise.
   */
  const stats = useMemo(() => {
    const base = documentsWithSiteNames.filter(d =>
      filters.siteId === 'ALL' || d.site.id === filters.siteId
    );
    const byParty = {} as Record<RFIParty, number>;
    (Object.keys(RFI_PARTY_LABELS) as RFIParty[]).forEach(party => {
      byParty[party] = base.filter(d => getResponsibleParties(d).includes(party)).length;
    });
    return {
      total: base.length,
      byParty,
      overdue: base.filter(d => isOverdue(d)).length,
    };
  }, [documentsWithSiteNames, filters.siteId]);

  /** Disciplines actually present, unioned with the standard list so filters stay stable. */
  const availableCategories = useMemo(() => {
    const found = new Set(
      documentsWithSiteNames.map(d => d.category?.categoryCode).filter(Boolean) as string[]
    );
    RFI_DISCIPLINES.forEach(d => found.add(d));
    return Array.from(found).sort();
  }, [documentsWithSiteNames]);

  const handleFilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setSearchTerm('');
  };

  if (!user) return null;

  // A card per party that actually has documents, between the total and the overdue
  // count. A project with no MEP work simply never shows a "รอ ME" card.
  const partyCards = (['BIM', 'ME', 'SN', 'SITE', 'CM'] as RFIParty[])
    .filter(party => stats.byParty[party] > 0 || filters.responsibleParty === party)
    .map(party => ({
      label: RFI_PARTY_LABELS[party],
      value: stats.byParty[party],
      colour: RFI_PARTY_COLORS[party],
      party,
      overdue: false,
    }));

  const statCards: {
    label: string; value: number; colour: string; party?: RFIParty; overdue?: boolean;
  }[] = [
    { label: 'ทั้งหมด', value: stats.total, colour: '#334155' },
    ...partyCards,
    { label: 'เกินกำหนด', value: stats.overdue, colour: '#DC2626', overdue: true },
  ];

  return (
    <AuthGuard>
      <div className="max-w-screen-2xl mx-auto">

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <HelpCircle className="text-blue-600" size={32} />
            RFI Documents
            <span className="text-base font-medium text-gray-500">ขอข้อมูลเพิ่มเติม</span>
          </h1>
          <div className="flex items-center space-x-3 mt-4 sm:mt-0">
            <span className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing...' : 'Real-time'}
            </span>
            {canCreate && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                สร้าง RFI
              </button>
            )}
          </div>
        </div>

        {/* Stat strip. Each card is a filter shortcut — clicking "รอ CM" filters to it. */}
        <div className="flex flex-wrap gap-3 mb-6">
          {statCards.map(card => {
            const isActive = card.overdue
              ? filters.overdueOnly
              : card.party
                ? filters.responsibleParty === card.party
                : filters.responsibleParty === 'ALL' && !filters.overdueOnly;
            return (
              <button
                key={card.label}
                onClick={() => {
                  if (card.overdue) {
                    setFilters(prev => ({ ...prev, overdueOnly: !prev.overdueOnly, responsibleParty: 'ALL' }));
                  } else if (card.party) {
                    setFilters(prev => ({
                      ...prev,
                      responsibleParty: prev.responsibleParty === card.party ? 'ALL' : card.party!,
                      overdueOnly: false,
                    }));
                  } else {
                    setFilters(prev => ({ ...prev, responsibleParty: 'ALL', overdueOnly: false }));
                  }
                }}
                className={`bg-white rounded-xl border p-4 text-left transition-all hover:shadow-sm flex-1 min-w-[120px] ${isActive ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}
              >
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: card.colour }}>{card.value}</p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขที่เอกสาร หรือหัวข้อคำถาม"
                className={`${selectClass} w-full pl-9`}
              />
            </div>

            <select value={filters.siteId} onChange={(e) => handleFilterChange('siteId', e.target.value)} className={selectClass}>
              <option value="ALL">ทุกโครงการ</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <select value={filters.categoryId} onChange={(e) => handleFilterChange('categoryId', e.target.value)} className={selectClass}>
              <option value="ALL">ทุกหมวดงาน</option>
              {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className={selectClass}>
              <option value="ALL">ทุกสถานะ</option>
              {Object.entries(RFI_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select value={filters.responsibleParty} onChange={(e) => handleFilterChange('responsibleParty', e.target.value)} className={selectClass}>
              <option value="ALL">รอใครก็ได้</option>
              {Object.entries(RFI_PARTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.overdueOnly}
                onChange={(e) => handleFilterChange('overdueOnly', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              เฉพาะที่เกินกำหนด
            </label>

            <button
              onClick={resetFilters}
              className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4" /> ล้างตัวกรอง
            </button>
          </div>
        </div>

        <div className="mt-6">
          <RFIListTable documents={filteredDocuments} isLoading={loading} onDocumentClick={setSelectedDocument} />
        </div>

        {selectedDocument && (
          <RFIDetailModal
            document={selectedDocument}
            onClose={() => setSelectedDocument(null)}
          />
        )}

        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <CreateRFIForm
              onClose={() => setIsCreateModalOpen(false)}
              isModal={true}
              userProp={{
                id: user.id,
                email: user.email,
                role: user.role,
                sites: user.sites || [],
              }}
            />
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

export default function RFIListPage() {
  return (
    <Suspense fallback={<div>Loading Page...</div>}>
      <RFIContent />
    </Suspense>
  );
}
