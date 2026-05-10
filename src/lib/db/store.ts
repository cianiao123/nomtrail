/**
 * File-based JSON database.
 * Persists data to .data/ directory so trips survive server restarts.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

function readCollection<T>(collection: string): Record<string, T> {
  ensureDir();
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return {};
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeCollection<T>(collection: string, data: Record<string, T>): void {
  ensureDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), "utf-8");
}

export const db = {
  /** Get all items in a collection */
  getAll: <T>(collection: string): T[] => {
    const data = readCollection<T>(collection);
    return Object.values(data);
  },

  /** Get single item by id */
  getById: <T>(collection: string, id: string): T | null => {
    const data = readCollection<T>(collection);
    return data[id] ?? null;
  },

  /** Create or update an item */
  put: <T extends { id: string }>(collection: string, item: T): T => {
    const data = readCollection<T>(collection);
    data[item.id] = item;
    writeCollection(collection, data);
    return item;
  },

  /** Delete an item by id */
  delete: (collection: string, id: string): boolean => {
    const data = readCollection(collection);
    if (!data[id]) return false;
    delete data[id];
    writeCollection(collection, data);
    return true;
  },

  /** Query items matching a predicate */
  query: <T>(collection: string, predicate: (item: T) => boolean): T[] => {
    const data = readCollection<T>(collection);
    return Object.values(data).filter(predicate);
  },
};
