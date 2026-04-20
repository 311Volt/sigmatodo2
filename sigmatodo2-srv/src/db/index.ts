import { IS_PROD } from '../config';
import { SQLiteDB } from './sqlite';
import { SupabaseDB } from './supabase';
import { config } from '../config';

export type DB = SQLiteDB | SupabaseDB;

let _db: DB | null = null;

export function getDB(): DB {
  if (!_db) {
    _db = IS_PROD ? new SupabaseDB() : new SQLiteDB(config.dbPath);
  }
  return _db;
}
