'use client'

// src/components/rfi/RFIListTable.tsx
//
// The RFI list. Built from RFAListTable so the two feel like one system, with the two
// columns the RFI workflow needs and RFA has no equivalent of:
//
//   กำหนดตอบ  — the due date, plus how many days it is overdue by.
//   รอใครอยู่  — who has to act. This is what the UI shows instead of Internal/External
//                (D-01), and it can name TWO parties at once: when SITE answers BIM and
//                forwards to CM in one move, both are genuinely pending.
//
// Status labels and colours are imported from config rather than passed in as props
// (RFA passes them). rfi-workflow.ts is client-safe, so a prop would only add a way
// for a caller to supply the wrong palette.

import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Calendar, User, Building, Tag, ArrowUp, ArrowDown, CalendarClock, AlertTriangle } from 'lucide-react'
import { RFIDocument } from '@/types/rfi'
import { ROLES } from '@/lib/config/workflow'
import {
  getRfiStatusLabel,
  getRfiStatusColor,
  RFI_PARTY_LABELS,
  RFI_AWAITING_CM_COLOR,
  RFI_AWAITING_CM_LABEL,
  RFI_STATUSES,
  getResponsibleParties,
  isOverdue,
  getDaysOverdue,
  getDaysUntilDue,
  toRfiDate,
} from '@/lib/config/rfi-workflow'
import Spinner from '@/components/shared/Spinner'

interface RFIListTableProps {
  documents: RFIDocument[]
  isLoading: boolean
  /** Optional until the detail modal exists (file plan #11). Rows are inert without it. */
  onDocumentClick?: (document: RFIDocument) => void
  /** CM only sees documents already filtered to their own status, so "รอใครอยู่"
   * (which names internal parties like Site/BIM) is hidden entirely for CM — mirrors
   * the same column removal in RFAListTable. */
  userRole?: string
}

// Date conversion lives in rfi-workflow (toRfiDate) so this table and isOverdue can
// never disagree about whether a document is late.
const formatDate = (value: unknown): string => {
  const d = toRfiDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** The colour maps hold hex, so badges are tinted inline instead of via Tailwind classes. */
const badgeStyle = (hex: string) => ({ backgroundColor: `${hex}1A`, color: hex });

type SortDirection = 'ascending' | 'descending';
type SortKey = 'runningNumber' | 'documentNumber' | 'site.name' | 'category.categoryCode'
  | 'status' | 'dueDate' | 'responsibleParty' | 'updatedAt';

function StatusBadges({ doc }: { doc: RFIDocument }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Label and colour both come from the helpers, which fold in the CM track:
          after CM answers, PENDING_CM reads "CM ตอบแล้ว" instead of "รอ CM ตอบ". */}
      <span
        className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium"
        style={badgeStyle(getRfiStatusColor(doc))}
      >
        {getRfiStatusLabel(doc)}
      </span>
      {/* The CM track runs in parallel with `status`, so it needs its own badge —
          a document can be closed on the BIM side and still waiting on CM. */}
      {doc.awaitingCm && doc.status !== RFI_STATUSES.PENDING_CM && (
        <span
          className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={badgeStyle(RFI_AWAITING_CM_COLOR)}
        >
          + {RFI_AWAITING_CM_LABEL}
        </span>
      )}
    </div>
  );
}

function PartyBadges({ doc }: { doc: RFIDocument }) {
  const parties = getResponsibleParties(doc);
  return (
    <span className="text-sm text-gray-900">
      {parties.map(party => RFI_PARTY_LABELS[party]).join(', ')}
    </span>
  );
}

/** 7-day/3-day/overdue warning bands. Nothing else beyond these three states. */
type DueUrgency = 'red' | 'orange' | 'yellow';

const dueUrgency = (doc: RFIDocument, overdue: boolean, remaining: number | null): DueUrgency | null => {
  if (overdue || (remaining !== null && remaining <= 0)) return 'red';
  if (remaining !== null && remaining <= 3) return 'orange';
  if (remaining !== null && remaining <= 7) return 'yellow';
  return null;
};

const DUE_URGENCY_TEXT_CLASS: Record<DueUrgency, string> = {
  red: 'text-red-600',
  orange: 'text-orange-600',
  yellow: 'text-yellow-700',
};

function DueCell({ doc }: { doc: RFIDocument }) {
  const overdue = isOverdue(doc);
  const late = getDaysOverdue(doc);
  const remaining = getDaysUntilDue(doc);
  if (!doc.dueDate) return <span className="text-sm text-gray-400">ไม่ได้กำหนด</span>;

  const urgency = dueUrgency(doc, overdue, remaining);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm ${urgency ? `font-semibold ${DUE_URGENCY_TEXT_CLASS[urgency]}` : 'text-gray-700'}`}>
        {formatDate(doc.dueDate)}
      </span>
      {overdue && late > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
          <AlertTriangle className="w-3 h-3" /> เกิน {late} วัน
        </span>
      )}
      {!overdue && urgency && remaining !== null && (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${DUE_URGENCY_TEXT_CLASS[urgency]}`}>
          <AlertTriangle className="w-3 h-3" /> {remaining <= 0 ? 'ถึงกำหนดวันนี้' : `เหลือ ${remaining} วัน`}
        </span>
      )}
    </div>
  );
}

export default function RFIListTable({ documents, isLoading, onDocumentClick, userRole }: RFIListTableProps) {
  const showResponsibleParty = userRole !== ROLES.CM;
  // The due date is an internal SLA the company tracks against itself — CM's own
  // review cadence isn't bound by it, so it's hidden for CM the same way the
  // responsible-party column is. The external approvers (Designer, Owner) sit
  // outside that internal SLA too, so they don't see the due-date column either.
  const showDueDate =
    userRole !== ROLES.CM &&
    userRole !== ROLES.DESIGNER &&
    userRole !== ROLES.OWNER;
  const [isMobile, setIsMobile] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(
    { key: 'updatedAt', direction: 'descending' }
  );

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const sortedDocuments = useMemo(() => {
    const sortable = [...documents];
    if (!sortConfig) return sortable;

    /** Reads 'site.name' style paths and flattens whatever it finds to a string. */
    const getNested = (obj: RFIDocument, path: string): string => {
      const value = path.split('.').reduce<unknown>(
        (o, p) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[p] : undefined),
        obj
      );
      return value == null ? '' : String(value);
    };

    sortable.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (sortConfig.key === 'updatedAt') {
        aValue = toRfiDate(a.updatedAt)?.getTime() || 0;
        bValue = toRfiDate(b.updatedAt)?.getTime() || 0;
      } else if (sortConfig.key === 'dueDate') {
        // Documents with no due date sort last in both directions: an empty cell is
        // not "very early", and pushing it to the end keeps the deadline view useful.
        aValue = toRfiDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        bValue = toRfiDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      } else if (sortConfig.key === 'responsibleParty') {
        aValue = getResponsibleParties(a).join(',');
        bValue = getResponsibleParties(b).join(',');
      } else {
        aValue = getNested(a, sortConfig.key);
        bValue = getNested(b, sortConfig.key);
      }

      if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
    return sortable;
  }, [documents, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (!sortConfig || sortConfig.key !== columnKey) return <span className="w-4 h-4 ml-2" />;
    return (
      <span className="ml-2">
        {sortConfig.direction === 'ascending' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full h-96 flex justify-center items-center bg-white rounded-lg shadow">
        <Spinner />
      </div>
    );
  }

  if (sortedDocuments.length === 0) {
    return (
      <div className="w-full h-96 flex flex-col justify-center items-center bg-white rounded-lg shadow text-center">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700">ไม่พบเอกสาร</h3>
        <p className="text-gray-500 mt-1">ลองเปลี่ยนตัวกรอง หรือสร้างเอกสารใหม่</p>
      </div>
    );
  }

  const rowInteraction = onDocumentClick
    ? 'hover:bg-gray-100 cursor-pointer transition-colors'
    : '';

  // Mobile view (cards)
  if (isMobile) {
    return (
      <div className="space-y-4">
        {sortedDocuments.map(doc => (
          <div
            key={doc.id}
            onClick={() => onDocumentClick?.(doc)}
            className={`rounded-lg shadow border p-4 bg-white ${onDocumentClick ? 'cursor-pointer' : ''} ${isOverdue(doc) ? 'border-red-300' : ''}`}
          >
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-600">{doc.runningNumber}</p>
                <h3 className="font-medium text-gray-900 text-sm truncate mt-0.5">
                  {doc.documentNumber}
                </h3>
                <p className="text-sm text-gray-600 line-clamp-2 mt-1">{doc.title}</p>
              </div>
              <div className="flex-shrink-0"><StatusBadges doc={doc} /></div>
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center"><Building className="w-3 h-3 mr-2" />{doc.site?.name || '-'}</div>
              <div className="flex items-center"><Tag className="w-3 h-3 mr-2" />{doc.category?.categoryCode || '-'}</div>
              {showResponsibleParty && (
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3" /> ผู้รับผิดชอบ: <PartyBadges doc={doc} />
                </div>
              )}
              {showDueDate && (
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-3 h-3" /> กำหนดตอบ: <DueCell doc={doc} />
                </div>
              )}
              <div className="flex items-center"><Calendar className="w-3 h-3 mr-2" />อัปเดต: {formatDate(doc.updatedAt)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Desktop view (table)
  return (
    <div className="sticky top-16 bg-white rounded-lg shadow overflow-hidden h-[calc(100vh-12rem)] flex flex-col">
      <div className="overflow-auto flex-1 scroll-locked-when-modal">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button onClick={() => requestSort('runningNumber')} className="flex items-center justify-center w-full">
                  เลขที่ระบบ <SortIcon columnKey="runningNumber" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button onClick={() => requestSort('site.name')} className="flex items-center w-full">
                  โครงการ <SortIcon columnKey="site.name" />
                </button>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button onClick={() => requestSort('category.categoryCode')} className="flex items-center justify-center w-full">
                  หมวดงาน <SortIcon columnKey="category.categoryCode" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เอกสาร</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button onClick={() => requestSort('status')} className="flex items-center justify-center w-full">
                  สถานะ <SortIcon columnKey="status" />
                </button>
              </th>
              {showDueDate && (
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => requestSort('dueDate')} className="flex items-center justify-center w-full">
                    กำหนดตอบ <SortIcon columnKey="dueDate" />
                  </button>
                </th>
              )}
              {showResponsibleParty && (
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => requestSort('responsibleParty')} className="flex items-center justify-center w-full">
                    ผู้รับผิดชอบ <SortIcon columnKey="responsibleParty" />
                  </button>
                </th>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button onClick={() => requestSort('updatedAt')} className="flex items-center justify-center w-full">
                  อัปเดตล่าสุด <SortIcon columnKey="updatedAt" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDocuments.map(doc => (
              <tr
                key={doc.id}
                onClick={() => onDocumentClick?.(doc)}
                className={`${isOverdue(doc) ? 'bg-red-50' : 'bg-white'} ${rowInteraction}`}
              >
                <td className="px-6 py-4">
                  <p className="text-sm font-semibold text-blue-600 text-center">{doc.runningNumber || '-'}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-800">{doc.site?.name || '-'}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-600 text-center">{doc.category?.categoryCode || '-'}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.documentNumber}
                    </p>
                    <p className="text-sm text-gray-600 line-clamp-2">{doc.title}</p>
                  </div>
                </td>
                <td className="px-6 py-4"><StatusBadges doc={doc} /></td>
                {showDueDate && (
                  <td className="px-6 py-4 text-center"><DueCell doc={doc} /></td>
                )}
                {showResponsibleParty && (
                  <td className="px-6 py-4 text-center"><PartyBadges doc={doc} /></td>
                )}
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-600 text-center">{formatDate(doc.updatedAt)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
