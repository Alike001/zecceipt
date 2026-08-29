import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

const connectionUrl = process.env.DATABASE_URL?.trim();

if (!connectionUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const parsedUrl = new URL(connectionUrl);

if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
  throw new Error("DATABASE_URL must use PostgreSQL.");
}

const migrationsDirectory = path.join(process.cwd(), "db", "migrations");
const migrationFiles = (await fs.readdir(migrationsDirectory))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
const sql = postgres(connectionUrl, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  for (const migrationFile of migrationFiles) {
    const alreadyApplied = await sql`
      SELECT name FROM schema_migrations WHERE name = ${migrationFile}
    `;

    if (alreadyApplied.length > 0) continue;

    const migration = await fs.readFile(
      path.join(migrationsDirectory, migrationFile),
      "utf8",
    );
    const statements = migration
      .split("-- statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await sql.begin(async (transaction) => {
      for (const statement of statements) {
        await transaction.unsafe(statement);
      }

      await transaction`
        INSERT INTO schema_migrations (name) VALUES (${migrationFile})
      `;
    });
  }

  console.log(`Applied ${migrationFiles.length} database migration file(s).`);
} finally {
  await sql.end({ timeout: 5 });
}
