import { db } from '@hq/db';

export default async function CustomersPage() {
  const customers = await db.customer.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Customers</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            {['Name', 'Email', 'Phone', 'Status'].map((h) => (
              <th
                key={h}
                style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#374151' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '10px 12px' }}>{c.name}</td>
              <td style={{ padding: '10px 12px', color: '#6b7280' }}>{c.email ?? '—'}</td>
              <td style={{ padding: '10px 12px', color: '#6b7280' }}>{c.phone ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{c.status}</td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr>
              <td
                colSpan={4}
                style={{ padding: '24px 12px', color: '#9ca3af', textAlign: 'center' }}
              >
                No customers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
