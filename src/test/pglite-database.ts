import { readFile, readdir } from "node:fs/promises";

import { PGlite, type Transaction } from "@electric-sql/pglite";

import type { Database, DatabaseTransaction, DatabaseValue } from "@/lib/db";

interface PGliteQueryExecutor {
  query<Row>(query: string, parameters?: unknown[]): Promise<{ rows: Row[] }>;
}

function createExecutor(executor: PGliteQueryExecutor): DatabaseTransaction {
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      parameters: readonly DatabaseValue[] = [],
    ) {
      const result = await executor.query<Row>(text, [...parameters]);
      return result.rows;
    },
  };
}

export async function createTestDatabase(): Promise<{
  database: Database;
  close: () => Promise<void>;
}> {
  const pglite = await PGlite.create();
  const migrationsDirectory = new URL("../../db/migrations/", import.meta.url);
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migration = await readFile(
      new URL(migrationFile, migrationsDirectory),
      "utf8",
    );

    for (const statement of migration
      .split("-- statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pglite.exec(statement);
    }
  }

  const database: Database = {
    ...createExecutor(pglite),
    transaction(callback) {
      return pglite.transaction((transaction: Transaction) =>
        callback(createExecutor(transaction)),
      );
    },
  };

  return { database, close: () => pglite.close() };
}
