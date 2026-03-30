import { db } from '@hq/db';

export default async function ProductsPage() {
  const products = await db.product.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Products</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            {['Name', 'Price', 'Status'].map((h) => (
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
          {products.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '10px 12px' }}>{p.name}</td>
              <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                {p.price != null ? `$${p.price}` : '—'}
              </td>
              <td style={{ padding: '10px 12px' }}>{p.status}</td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td
                colSpan={3}
                style={{ padding: '24px 12px', color: '#9ca3af', textAlign: 'center' }}
              >
                No products yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
