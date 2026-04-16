'use client';

interface GeoRow {
  country: string;
  companies: number;
  contacts: number;
}

/** Visual geographic representation — proportional region cards with a "heat" scale */
export function GeoMap({ data }: { data: GeoRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[13px] text-muted">
        No geographic data yet
      </div>
    );
  }

  const maxCompanies = Math.max(...data.map((d) => d.companies), 1);

  // Region groupings for visual layout
  const regions: Record<string, string[]> = {
    'Middle East': ['UAE', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Oman', 'Kuwait', 'Jordan', 'Lebanon', 'Israel'],
    'South Asia': ['India', 'Pakistan', 'Sri Lanka', 'Bangladesh', 'Nepal'],
    'Europe': ['UK', 'United Kingdom', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Belgium', 'Austria', 'Poland', 'Portugal', 'Czech Republic', 'Romania', 'Greece', 'Hungary'],
    'Americas': ['USA', 'United States', 'Canada', 'Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile'],
    'Africa': ['South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Morocco', 'Ghana', 'Tanzania'],
    'Asia Pacific': ['China', 'Japan', 'Singapore', 'Australia', 'Thailand', 'Malaysia', 'Indonesia', 'New Zealand', 'South Korea', 'Philippines', 'Vietnam', 'Hong Kong', 'Taiwan'],
  };

  // Assign each country to a region
  const countryToRegion = new Map<string, string>();
  for (const [region, countries] of Object.entries(regions)) {
    for (const c of countries) {
      countryToRegion.set(c.toLowerCase(), region);
    }
  }

  // Group data by region
  const regionData = new Map<string, GeoRow[]>();
  for (const row of data) {
    const region = countryToRegion.get(row.country.toLowerCase()) ?? 'Other';
    if (!regionData.has(region)) regionData.set(region, []);
    regionData.get(region)!.push(row);
  }

  // Sort regions by total companies
  const sortedRegions = [...regionData.entries()].sort(
    (a, b) => b[1].reduce((s, r) => s + r.companies, 0) - a[1].reduce((s, r) => s + r.companies, 0)
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 @lg:grid-cols-3">
      {sortedRegions.map(([region, rows]) => {
        const totalCo = rows.reduce((s, r) => s + r.companies, 0);
        const totalCt = rows.reduce((s, r) => s + r.contacts, 0);
        return (
          <div key={region} className="rounded-[8px] border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{region}</span>
              <span className="text-[11px] text-muted">{totalCo} co · {totalCt} ct</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rows
                .sort((a, b) => b.companies - a.companies)
                .map((row) => {
                  const intensity = Math.max(0.15, row.companies / maxCompanies);
                  return (
                    <span
                      key={row.country}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `rgba(20, 184, 166, ${intensity})`,
                        color: intensity > 0.5 ? '#f0fdfa' : '#99f6e4',
                      }}
                    >
                      {row.country}
                      <span className="opacity-70">{row.companies}</span>
                    </span>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
