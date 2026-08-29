import "server-only";

export interface DatabaseRuntimeConfig {
  connectionUrl: string;
  managementSecret: string;
}

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export function readDatabaseRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DatabaseRuntimeConfig {
  const connectionUrl = environment.DATABASE_URL?.trim();
  const managementSecret = environment.INVOICE_MANAGEMENT_SECRET;

  if (!connectionUrl) {
    throw new DatabaseConfigurationError(
      "The server database connection is not configured.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(connectionUrl);
  } catch {
    throw new DatabaseConfigurationError(
      "The server database connection is invalid.",
    );
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new DatabaseConfigurationError(
      "The server database connection must use PostgreSQL.",
    );
  }

  if (!managementSecret || managementSecret.length < 32) {
    throw new DatabaseConfigurationError(
      "The invoice management secret must contain at least 32 characters.",
    );
  }

  return { connectionUrl, managementSecret };
}
