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
import DashboardStats from '@/components/rfi/DashboardStats'
import { RFIDocument } from '@/types/rfi'
import { Role } from '@/lib/config/workflow'
import {
  RFI_STATUS_LABELS,
  RFI_ACTIVE_STATUSES,
  RFI_PARTY_LABELS,
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

function matchesSearch(doc: RFIDocument, term: string): boolean {
  if (!term.trim()) return true;
  const search = term.toLowerCase();
  return (
    (doc.runningNumber || '').toLowerCase().includes(search) ||
    (doc.documentNumber || '').toLowerCase().includes(search) ||
    (doc.title || '').toLowerCase().includes(search)
  );
}

/** Applies every Filters field EXCEPT the ones named in `skip` — lets each donut
 * chart exclude its own dimension so it shows a true breakdown instead of
 * collapsing to one slice when that same filter is active. */
function applyFilters<T extends RFIDocument & { site: { id: string } }>(
  docs: T[],
  f: Filters,
  skip: Partial<Record<keyof Filters, boolean>> = {}
): T[] {
  let out = docs;
  if (!skip.status && f.status !== 'ALL') out = out.filter(d => d.status === f.status);
  if (!skip.siteId && f.siteId !== 'ALL') out = out.filter(d => d.site.id === f.siteId);
  if (!skip.categoryId && f.categoryId !== 'ALL') out = out.filter(d => d.category?.categoryCode === f.categoryId);
  if (!skip.overdueOnly && f.overdueOnly) out = out.filter(d => isOverdue(d));
  if (!skip.responsibleParty && f.responsibleParty !== 'ALL') {
    out = out.filter(d => getResponsibleParties(d).includes(f.responsibleParty as RFIParty));
  }
  return out;
}

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

    // CM only ever sees documents that have reached them (roadmap T-007). This filter
    // MUST match firestore.rules exactly — the rule rejects the whole query for CM
    // otherwise (see firestore.rules rfiDocuments). Needs the composite index
    // siteId + cmInvolved + updatedAt (firestore.indexes.json); other roles use the
    // plain siteId + updatedAt index.
    const q = user.role === 'CM'
      ? query(
          collection(db, 'rfiDocuments'),
          where('siteId', 'in', user.sites),
          where('cmInvolved', '==', true),
          orderBy('updatedAt', 'desc')
        )
      : query(
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
    return applyFilters(documentsWithSiteNames, filters).filter(d => matchesSearch(d, searchTerm));
  }, [documentsWithSiteNames, filters, searchTerm]);

  const statusChartDocuments = useMemo(() => {
    return applyFilters(documentsWithSiteNames, filters, { status: true }).filter(d => matchesSearch(d, searchTerm));
  }, [documentsWithSiteNames, filters, searchTerm]);

  const categoryChartDocuments = useMemo(() => {
    return applyFilters(documentsWithSiteNames, filters, { categoryId: true }).filter(d => matchesSearch(d, searchTerm));
  }, [documentsWithSiteNames, filters, searchTerm]);

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

        <DashboardStats
          allDocuments={statusChartDocuments}
          categoryDocuments={categoryChartDocuments}
          onChartFilter={(key, value) => handleFilterChange(key, value)}
          activeFilters={{ status: filters.status, categoryId: filters.categoryId }}
        />

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
              {RFI_ACTIVE_STATUSES.map(status => (
                <option key={status} value={status}>{RFI_STATUS_LABELS[status]}</option>
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
