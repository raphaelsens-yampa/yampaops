/**
 * Busca paginada para a API do Supabase (PostgREST).
 *
 * A API corta silenciosamente o resultado em 1.000 linhas por requisição
 * (independente de `.limit()` maior). Qualquer consulta que possa passar
 * disso DEVE usar `fetchAllPaged` para não exibir números truncados.
 */
export const SUPABASE_PAGE_SIZE = 1000;

type PagedResult<T> = { data: T[] | null; error: { message: string } | null };
type PagedBuilder<T> = { range: (from: number, to: number) => PromiseLike<PagedResult<T>> };

/**
 * @param build função que cria uma NOVA query a cada página (sem `.range`).
 * Sempre inclua um `.order(...)` estável no builder para evitar linhas repetidas/perdidas.
 */
export async function fetchAllPaged<T>(
  build: () => PagedBuilder<T>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build().range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return { data: all, error: error.message };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    if (page > 500) break; // trava de segurança
  }
  return { data: all, error: null };
}
