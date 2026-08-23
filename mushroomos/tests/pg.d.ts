/**
 * A minimal ambient declaration for the part of `pg` these tests use.
 *
 * `@types/pg` is not installed and adding a dependency for four method signatures is a worse
 * trade than declaring them. The scripts in `scripts/` are `.mjs` and outside tsconfig's include,
 * which is why this only became necessary once the proofs moved into `npm test`.
 */
declare module 'pg' {
  export interface QueryResult<R = Record<string, unknown>> {
    rows: R[];
    rowCount: number | null;
  }

  export interface ClientConfig {
    connectionString?: string;
    ssl?: { rejectUnauthorized: boolean };
    statement_timeout?: number;
  }

  export class Client {
    constructor(config?: ClientConfig);
    connect(): Promise<void>;
    query<R = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }

  const pg: { Client: typeof Client };
  export default pg;
}
