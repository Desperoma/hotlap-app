/** Drapeau d'un code pays ISO (« FR » → 🇫🇷). */
export function flagOf(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}

/** « 🇫🇷 Metz, Grand Est » ; vide si rien n'est renseigné (ou masqué). */
export function placeLine(p: { country_code?: string | null; region?: string | null; home_city?: string | null }): string {
  const where = [p.home_city?.trim(), p.region?.trim()].filter(Boolean).join(', ');
  return [flagOf(p.country_code), where].filter(Boolean).join(' ');
}
