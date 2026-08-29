import "server-only";

export type DatabaseValue = string | number | bigint | boolean | Date | null;

export interface DatabaseTransaction {
  query<Row extends Record<string, unknown>>(
    text: string,
    parameters?: readonly DatabaseValue[],
  ): Promise<readonly Row[]>;
}

export interface Database extends DatabaseTransaction {
  transaction<Result>(
    callback: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result>;
}
