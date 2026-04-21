declare module 'pg' {
  export class Pool {
    constructor(config?: Record<string, unknown>);
    query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  }
}
