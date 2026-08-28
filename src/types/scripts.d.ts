declare module "*/pagedQueryGuard.mjs" {
  export const VOLATILE_TABLES: string[];
  export function findViolations(rootDir?: string): { file: string; line: number; table: string; message: string }[];
}
declare module "*/pagedQueryBaseline.mjs" {
  export function splitByBaseline(
    violations: { file: string; line: number; table: string; message: string }[],
    allow?: string[],
  ): { blocking: { file: string; line: number; table: string; message: string }[]; stale: string[] };
}
