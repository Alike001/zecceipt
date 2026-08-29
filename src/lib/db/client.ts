import "server-only";

import postgres from "postgres";

import { readDatabaseRuntimeConfig } from "@/lib/db/env";
import type {
  Database,
  DatabaseTransaction,
  DatabaseValue,
} from "@/lib/db/types";

interface QuerySql {
  unsafe<Row extends Record<string, unknown>[]>(
    text: string,
    parameters?: readonly unknown[],
  ): Promise<Row>;
}

function createQueryExecutor(sql: QuerySql): DatabaseTransaction {
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      parameters: readonly DatabaseValue[] = [],
    ) {
      const result = await sql.unsafe<Row[]>(text, parameters);
      return Array.from(result);
    },
  };
}

export function createPostgresDatabase(connectionUrl: string): Database {
  const sql = postgres(connectionUrl, {
    max: 1,
    prepare: false,
    types: { bigint: postgres.BigInt },
  });
  const queryExecutor = createQueryExecutor(sql);

  return {
    ...queryExecutor,
    transaction(callback) {
      return sql.begin((transactionSql) =>
        callback(createQueryExecutor(transactionSql as unknown as QuerySql)),
      ) as unknown as Promise<
        ReturnType<typeof callback> extends Promise<infer Result>
          ? Result
          : never
      >;
    },
  };
}

let defaultDatabase: Database | undefined;

export function getDatabase(): Database {
  defaultDatabase ??= createPostgresDatabase(
    readDatabaseRuntimeConfig().connectionUrl,
  );
  return defaultDatabase;
}
