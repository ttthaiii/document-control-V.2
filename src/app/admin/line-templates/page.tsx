'use client';
import React, { useEffect, useState } from 'react';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { ROLES, Role } from '@/lib/config/workflow';
import { useAuth } from '@/lib/auth/useAuth';
import Layout from '@/components/layout/Layout';
import Spinner from '@/components/shared/Spinner';
import { GitBranch, AlertCircle, ArrowUp, ArrowDown, Save, Plus, Trash2 } from 'lucide-react';
import type { LineTemplate, LineStageTemplate, LineModule } from '@/lib/config/lineTemplate';

// Thai gloss for each role that can appear in a stage (display only).
const ROLE_LABELS: Record<string, string> = {
  CM: 'ผู้ควบคุมงาน (CM)',
  Designer: 'ผู้ออกแบบ (Designer)',
  Owner: 'เจ้าของโครงการ (Owner)',
};

// Role options offered in the stage editor's dropdown — role-level only (no person-level
// picking; that is a later phase). Order here is just the dropdown's own order, unrelated
// to a stage's position in the line.
const STAGE_ROLE_OPTIONS: Role[] = [ROLES.CM, ROLES.DESIGNER, ROLES.OWNER];

const EMPTY_FORM = { module: 'RFA' as LineModule, stages: [] as LineStageTemplate[] };

// Project (site) option for the scope selector — shape from GET /api/admin/projects.
type SiteOption = { id: string; name?: string; shortName?: string; cmSystemType?: string };

export default function LineTemplatesPage() {
  const { firebaseUser } = useAuth();
  const [templates, setTemplates] = useState<LineTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');

  const fetchTemplates = async (siteId: string) => {
    if (!firebaseUser) return;
    try {
      setLoading(true);
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/line-templates?siteId=${encodeURIComponent(siteId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setTemplates(data.templates);
      else setError(data.error || 'โหลดเทมเพลตไม่สำเร็จ');
    } catch { setError('เครือข่ายมีปัญหา'); }
    finally { setLoading(false); }
  };

  const fetchSites = async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/projects', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setSites(data.projects);
    } catch { /* non-fatal — scope selector just falls back to default-only */ }
  };

  useEffect(() => { fetchTemplates(selectedSiteId); }, [firebaseUser, selectedSiteId]);
  useEffect(() => { fetchSites(); }, [firebaseUser]);

  // ── stage list helpers ──
  // T-016: a line is a generic ORDERED list of role-stages (array position = order). A role
  // (including CM) may appear any number of times, so stages are addressed by index, not role.
  const renumber = (stages: LineStageTemplate[]): LineStageTemplate[] =>
    stages.map((s, i) => ({ ...s, order: i }));

  const addStage = () =>
    setForm((f) => ({ ...f, stages: renumber([...f.stages, { role: STAGE_ROLE_OPTIONS[0], order: f.stages.length, mandatory: false }]) }));

  const removeStage = (index: number) =>
    setForm((f) => ({ ...f, stages: renumber(f.stages.filter((_, i) => i !== index)) }));

  const moveStage = (index: number, dir: -1 | 1) =>
    setForm((f) => {
      const swap = index + dir;
      if (swap < 0 || swap >= f.stages.length) return f;
      const next = [...f.stages];
      [next[index], next[swap]] = [next[swap], next[index]];
      return { ...f, stages: renumber(next) };
    });

  const setStageRole = (index: number, role: Role) =>
    setForm((f) => ({ ...f, stages: f.stages.map((s, i) => (i === index ? { ...s, role } : s)) }));

  const toggleStageMandatory = (index: number) =>
    setForm((f) => ({ ...f, stages: f.stages.map((s, i) => (i === index ? { ...s, mandatory: !s.mandatory } : s)) }));

  const editExisting = (t: LineTemplate) => {
    setForm({ module: t.module, stages: renumber([...t.stages].sort((a, b) => a.order - b.order)) });
    setNotice('');
  };

  const resetForm = () => { setForm(EMPTY_FORM); setNotice(''); };

  const save = async () => {
    if (!firebaseUser) return;
    // T-016: the line is fully configurable — the only rule is >=1 stage of any role
    // (CM may be the only stage, repeat, or be absent). Mirrors the server-side check.
    if (form.stages.length === 0) { setNotice('กรุณาเพิ่มอย่างน้อย 1 ขั้นตอน'); return; }
    try {
      setSaving(true);
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/line-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ module: form.module, stages: form.stages, siteId: selectedSiteId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`บันทึกแล้ว (เวอร์ชัน ${data.template.version}) · ตรวจเอกสารที่ค้างอยู่ ${data.impact.scanned} ฉบับ · ปรับ ${data.impact.updated} ฉบับ`);
        await fetchTemplates(selectedSiteId);
      } else setNotice(data.error || 'บันทึกไม่สำเร็จ');
    } catch { setNotice('เครือข่ายมีปัญหา'); }
    finally { setSaving(false); }
  };

  const deleteTemplate = async (t: LineTemplate) => {
    if (!firebaseUser) return;
    if (!t.id.includes('__')) return; // system-default — UI keeps its button disabled anyway
    if (!confirm('ยืนยันลบเทมเพลตนี้?')) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/line-templates?id=${encodeURIComponent(t.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) await fetchTemplates(selectedSiteId);
      else setNotice(data.error || 'ลบไม่สำเร็จ');
    } catch { setNotice('เครือข่ายมีปัญหา'); }
  };

  const sortedSites = [...sites].sort((a, b) => (a.name || a.shortName || '').localeCompare(b.name || b.shortName || ''));

  return (
    <AuthGuard requiredRoles={[ROLES.ADMIN]}>
      <Layout>
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <GitBranch className="mr-2 text-blue-600" /> เทมเพลตเส้นทางอนุมัติ (Approval Line)
            </h1>
            <p className="text-gray-500 mt-1">กำหนดลำดับขั้นตอนผู้พิจารณา (CM / Designer / Owner) แบบอิสระต่อโมดูล — CM จะอยู่ตำแหน่งไหน กี่ครั้ง หรือไม่มีเลยก็ได้</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ── Existing templates ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold text-gray-800">เทมเพลตที่มีอยู่</h2>
              {loading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : templates.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีเทมเพลต — สร้างใหม่ทางด้านขวา</p>
              ) : (
                <ul className="space-y-2">
                  {templates.map((t) => {
                    const isDefault = !t.id.includes('__');
                    return (
                      <li key={t.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            <span className="mr-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">{t.module}</span>
                            {isDefault && <span className="mr-2 text-xs text-gray-500">template เริ่มต้น — แก้ได้ ลบไม่ได้</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {[...t.stages].sort((a, b) => a.order - b.order).map((s) => ROLE_LABELS[s.role] ?? s.role).join(' → ') || '—'} · v{t.version}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => editExisting(t)} className="text-sm text-blue-600 hover:underline">แก้ไข</button>
                          <button
                            onClick={() => deleteTemplate(t)}
                            disabled={isDefault}
                            aria-label="ลบ"
                            title={isDefault ? 'template เริ่มต้น — แก้ได้ ลบไม่ได้' : 'ลบเทมเพลต'}
                            className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ── Create / edit form ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold text-gray-800">สร้าง / แก้ไขเทมเพลต</h2>

              <label className="mb-1 block text-sm font-medium text-gray-700">ขอบเขตโครงการ (project scope)</label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">ค่าเริ่มต้นทั้งระบบ (default)</option>
                {sortedSites.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.cmSystemType === 'EXTERNAL'}>
                    {(s.name || s.shortName || s.id) + (s.cmSystemType === 'EXTERNAL' ? ' — โครงการนี้ไม่มีสายอนุมัติภายนอก' : '')}
                  </option>
                ))}
              </select>

              <label className="mb-1 block text-sm font-medium text-gray-700">โมดูล</label>
              <select
                value={form.module}
                onChange={(e) => setForm((f) => ({ ...f, module: e.target.value as LineModule }))}
                className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="RFA">RFA</option>
                <option value="RFI">RFI</option>
              </select>

              <p className="mb-2 text-sm font-medium text-gray-700">ลำดับขั้นตอน (ordered stages)</p>
              <div className="space-y-2">
                {form.stages.length === 0 && (
                  <p className="text-sm text-gray-400">ยังไม่มีขั้นตอน — กดเพิ่มขั้นตอนด้านล่าง</p>
                )}
                {form.stages.map((stage, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
                    <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                    <select
                      value={stage.role}
                      onChange={(e) => setStageRole(index, e.target.value as Role)}
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      {STAGE_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role] ?? role}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={stage.mandatory} onChange={() => toggleStageMandatory(index)} className="h-3.5 w-3.5" />
                      บังคับ
                    </label>
                    <button onClick={() => moveStage(index, -1)} disabled={index === 0} aria-label="ขึ้น" className="text-gray-400 hover:text-gray-700 disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => moveStage(index, 1)} disabled={index === form.stages.length - 1} aria-label="ลง" className="text-gray-400 hover:text-gray-700 disabled:opacity-30">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeStage(index)} aria-label="ลบขั้นตอน" className="text-gray-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addStage}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> เพิ่มขั้นตอน
              </button>

              {notice && <p className="mt-3 text-sm text-gray-700">{notice}</p>}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึกเทมเพลต'}
                </button>
                <button onClick={resetForm} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Plus className="h-4 w-4" /> ใหม่
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}
