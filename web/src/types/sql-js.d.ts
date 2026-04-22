declare module "sql.js" {
  export interface Statement {
    bind(values?: unknown[] | Record<string, unknown>): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    get(): unknown[];
    free(): boolean;
  }

  export class Database {
    constructor(data?: Uint8Array | ArrayLike<number> | null);
    run(sql: string, params?: unknown[]): Database;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<{ Database: typeof Database }>;
}
