// Curated per-route placements, not a kind-based fallback: every asset appears at most twice.
// Home placements live here too, so tests can audit the entire public site budget.
export const homeArtwork = ['engineering', 'sketch', 'batch', 'parts', 'keepsake', 'everyday', 'printer']
export const routeArtwork = {
  '/services': 'parts',
  '/for/education': 'research',
  '/for/business': 'engineering',
  '/for/personal': 'everyday',
  '/services/research-lab': 'research',
  '/services/student-project': 'keepsake',
  '/services/campus-gifts': 'exhibition',
  '/services/exhibition': 'exhibition',
  '/services/industrial-parts': 'batch',
  '/services/small-batch': 'stand',
  '/services/personal-print': 'vase',
  '/services/rush-print': 'rush',
  '/materials': 'printer',
  '/guides/file-prep': 'sketch',
  '/guides/fdm-design': 'stand',
  '/about': 'vase',
  '/contact': 'rush',
}
