export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: '24px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 32 }}>HQ</div>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {[
            { href: '/dashboard', label: 'Dashboard' },
            { href: '/objects', label: 'Objects' },
            { href: '/messaging', label: 'Messaging' },
            { href: '/notes', label: 'Notes' },
            { href: '/files', label: 'Files' },
            { href: '/agents', label: 'Agents' },
            { href: '/workflows', label: 'Workflows' },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                style={{
                  display: 'block',
                  padding: '6px 12px',
                  borderRadius: 6,
                  color: '#374151',
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 32 }}>{children}</main>
    </div>
  );
}
