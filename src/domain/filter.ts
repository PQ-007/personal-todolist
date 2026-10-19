/** Case-insensitive search over title and notes. An empty query matches everything. */
export function matchesQuery(t: { title: string; description: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${t.title} ${t.description}`.toLowerCase().includes(q);
}
