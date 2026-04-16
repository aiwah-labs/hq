'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface CampaignData {
  name: string;
  prospects: number;
  sent: number;
  opened: number;
  replied: number;
}

export function CampaignPerformance({ data }: { data: CampaignData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-muted">
        No campaigns with activity yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            fontSize: 12,
            color: '#e2e8f0',
          }}
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
        <Bar dataKey="prospects" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={32} name="Enrolled" />
        <Bar dataKey="sent" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={32} name="Sent" />
        <Bar dataKey="opened" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={32} name="Opened" />
        <Bar dataKey="replied" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} name="Replied" />
      </BarChart>
    </ResponsiveContainer>
  );
}
