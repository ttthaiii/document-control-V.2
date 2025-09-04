// src/components/rfa/DashboardStats.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth/useAuth';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

const DashboardStats = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { firebaseUser } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      if (!firebaseUser) return;
      setLoading(true);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/dashboard/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [firebaseUser]);

  if (loading) {
    return <div className="text-center p-8">กำลังโหลดข้อมูลสรุป...</div>;
  }

  if (!stats) {
    return <div className="text-center p-8 text-red-500">ไม่สามารถโหลดข้อมูลสรุปได้</div>;
  }

  const responsiblePartyData = [
    { name: 'รอ BIM ดำเนินการ', value: stats.responsibleParty.BIM },
    { name: 'รอ SITE ตรวจสอบ', value: stats.responsibleParty.SITE },
    { name: 'รอ CM อนุมัติ', value: stats.responsibleParty.CM },
    { name: 'อนุมัติแล้ว', value: stats.responsibleParty.APPROVED },
  ].filter(item => item.value > 0);

  const categoryData = Object.entries(stats.categories)
    .map(([name, value]) => ({ name, value: value as number }))
    .filter(item => item.value > 0);
    
  const totalResponsible = responsiblePartyData.reduce((sum, item) => sum + item.value, 0);
  const totalCategory = categoryData.reduce((sum, item) => sum + item.value, 0);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Responsible Party Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">
            สถานะตามผู้รับผิดชอบ
        </h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={responsiblePartyData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                    >
                        {responsiblePartyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                     <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold">
                        {totalResponsible}
                    </text>
                </PieChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* Category Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
         <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">
            สถานะตามหมวดหมู่
        </h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                    >
                        {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold">
                        {totalCategory}
                    </text>
                </PieChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;