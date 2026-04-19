import Link from 'next/link';

// Linear/Attio-style operational dashboard. See skills/ui-design/SKILL.md.

const stats = [
  { label: 'Open approvals', value: '—', sub: 'Awaiting review' },
  { label: 'Active workflows', value: '—', sub: 'Running now' },
  { label: 'Inbox unread', value: '—', sub: 'Last 24h' },
  { label: 'Agents online', value: '—', sub: 'Ready to work' },
];

const quickLinks: Array<{ href: string; label: string; meta: string }> = [
  { href: '/inbox', label: 'Inbox', meta: 'Triage messages and requests' },
  { href: '/approvals', label: 'Approvals', meta: 'Review and sign off' },
  { href: '/workflows', label: 'Workflows', meta: 'Design and run automations' },
  { href: '/agents', label: 'Agents', meta: 'Manage AI workers' },
  { href: '/objects', label: 'Objects', meta: 'CRM records and custom types' },
  { href: '/files', label: 'Files', meta: 'Documents and shared media' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 pt-6 pb-10">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Dashboard</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
          Welcome to HQ
        </h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Your organisation&rsquo;s operating system. Use the sidebar to navigate, or jump in below.
        </p>
      </div>

      {/* Stat row */}
      <div className="mb-8 flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex-1 px-4 py-3 ${i > 0 ? 'border-l border-[#e6e8eb]' : ''}`}
          >
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">
              {s.label}
            </p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">
              {s.value}
            </p>
            <p className="mt-1.5 text-[11px] text-[#8a8f98]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">
          Jump in
        </h2>
        <p className="text-[11px] text-[#8a8f98]">&mdash; the six things you open most</p>
      </div>

      <div className="divide-y divide-[#eff0f2] rounded-lg border border-[#e6e8eb] bg-white">
        {quickLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex h-11 items-center px-4 transition-colors hover:bg-[#fafbfb]"
          >
            <span className="text-[12.5px] font-medium text-[#0f1011]">{l.label}</span>
            <span className="ml-3 text-[11.5px] text-[#8a8f98]">{l.meta}</span>
            <span className="ml-auto text-[11px] text-[#d0d6e0] transition-colors group-hover:text-[#62666d]">
              &rsaquo;
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
