import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config.js';

export interface StoredGoogleToken {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
}

export class GoogleTokenStore {
  private readonly pool?: Pool;

  constructor(private readonly filePath = config.google.tokenPath, databaseUrl = process.env.DATABASE_URL || '') {
    if (databaseUrl) {
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 2,
        ssl: (process.env.DATABASE_SSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined
      });
    }
  }

  async get(): Promise<StoredGoogleToken | null> {
    if (config.google.refreshToken) return { refreshToken: config.google.refreshToken };
    if (this.pool) {
      await this.initDb();
      const result = await this.pool.query("SELECT value FROM doomy_settings WHERE key = 'google_oauth_token'");
      return result.rows[0]?.value || null;
    }
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as StoredGoogleToken;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(token: StoredGoogleToken) {
    if (this.pool) {
      await this.initDb();
      await this.pool.query(`
        INSERT INTO doomy_settings (key, value, updated_at) VALUES ('google_oauth_token', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [JSON.stringify(token)]);
      return;
    }
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    await writeFile(temp, JSON.stringify(token, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.filePath);
  }

  async close() { await this.pool?.end(); }

  private async initDb() {
    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS doomy_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}

export const googleTokenStore = new GoogleTokenStore();
