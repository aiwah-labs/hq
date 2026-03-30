'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CountryData {
  country: string;
  companies: number;
  contacts: number;
}

export function CountryBreakdown({ data }: { data: CountryData[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="country"
          width={100}
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
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
        <Bar dataKey="companies" fill="#14b8a6" radius={[0, 4, 4, 0]} maxBarSize={22} name="Companies" />
        <Bar dataKey="contacts" fill="#0ea5e9" radius={[0, 4, 4, 0]} maxBarSize={22} name="Contacts" />
      </BarChart>
    </ResponsiveContainer>
  );
}
