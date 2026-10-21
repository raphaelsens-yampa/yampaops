/** Sources are ordered by priority; the first nonempty phone wins per email. */
export function cohortPhoneMap(sources: { email: string | null; phone: string | null }[][]) {
  const phones = new Map<string, string>();
  for (const source of sources) {
    for (const row of source) {
      const email = row.email?.trim().toLowerCase();
      const phone = row.phone?.trim();
      if (email && phone && !phones.has(email)) phones.set(email, phone);
    }
  }
  return phones;
}