import countries from 'i18n-iso-countries';

// Register English locale
import enLocale from 'i18n-iso-countries/langs/en.json';
countries.registerLocale(enLocale);

// Manual alias map for common short-form and regional variants
const ALIASES: Record<string, string> = {
  // Middle East
  'UAE':                        'AE',
  'UNITED ARAB EMIRATES':       'AE',
  'KSA':                        'SA',
  'SAUDI':                      'SA',
  'SAUDI ARABIA':               'SA',
  'KINGDOM OF SAUDI ARABIA':    'SA',
  'QATAR':                      'QA',
  'BAHRAIN':                    'BH',
  'OMAN':                       'OM',
  'KUWAIT':                     'KW',
  'JORDAN':                     'JO',
  'LEBANON':                    'LB',
  'ISRAEL':                     'IL',
  // Europe
  'UK':                         'GB',
  'UNITED KINGDOM':             'GB',
  'BRITAIN':                    'GB',
  'GREAT BRITAIN':              'GB',
  'ENGLAND':                    'GB',
  'SCOTLAND':                   'GB',
  'WALES':                      'GB',
  // Americas
  'USA':                        'US',
  'UNITED STATES':              'US',
  'UNITED STATES OF AMERICA':   'US',
  'US':                         'US',
  // Asia Pacific
  'HONG KONG':                  'HK',
  'TAIWAN':                     'TW',
  'SOUTH KOREA':                'KR',
  'KOREA':                      'KR',
  'VIETNAM':                    'VN',
  // Africa
  'EGYPT':                      'EG',
  'SOUTH AFRICA':               'ZA',
  'NIGERIA':                    'NG',
  'KENYA':                      'KE',
  'MOROCCO':                    'MA',
  'GHANA':                      'GH',
};

/**
 * Given a country name (can be dirty / abbreviated / variant),
 * return the ISO Alpha-2 code (e.g. "UAE" → "AE") or null if not resolvable.
 */
export function normalizeCountryToISO(name: string): string | null {
  if (!name || !name.trim()) return null;
  const key = name.trim().toUpperCase();

  // 1. Try manual alias map first
  if (ALIASES[key]) return ALIASES[key];

  // 2. Try i18n-iso-countries name lookup (English)
  const iso = countries.getAlpha2Code(name.trim(), 'en');
  if (iso) return iso;

  // 3. Partial match — find the closest country name containing this string
  const allNames = countries.getNames('en');
  for (const [code, cName] of Object.entries(allNames)) {
    if (
      cName.toUpperCase().includes(key) ||
      key.includes(cName.toUpperCase())
    ) {
      return code;
    }
  }

  return null;
}

/**
 * Return the canonical English country name for a given raw name string.
 * Falls back to the original input if not resolvable.
 */
export function normalizeCountryName(name: string): string {
  const iso = normalizeCountryToISO(name);
  if (!iso) return name;
  return countries.getName(iso, 'en') ?? name;
}
