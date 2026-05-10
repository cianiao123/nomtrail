/**
 * Supabase Database Adapter — same interface as lib/db/store.ts.
 * Drop-in replacement: just change import from './store' to './supabase'.
 */

import { createServerSupabase } from "@/lib/supabase/server";
import type { ItineraryVersion } from "@/types/agent";

// Map our collection names to Supabase table names
const TABLE_MAP: Record<string, string> = {
  trips: "trips",
  itinerary_versions: "itinerary_versions",
  agent_sessions: "agent_sessions",
  agent_action_logs: "agent_action_logs",
};

function deserializeItem<T>(collection: string, item: Record<string, unknown>): T {
  if (collection === "itinerary_versions") {
    return {
      id: item.id,
      versionId: item.version_id ?? item.id,
      tripId: item.trip_id,
      versionNumber: item.version_number ?? 0,
      days: item.days_snapshot ?? [],
      changeDescription: item.change_description ?? "",
      parentVersionId: item.parent_version_id ?? undefined,
      isCurrent: item.is_current ?? true,
      createdAt: item.created_at,
      critiqueResult: item.critique_result ?? undefined,
    } as T;
  }

  return item as T;
}

function serializeItem<T extends { id?: string }>(
  collection: string,
  item: T
): Record<string, unknown> {
  if (collection === "itinerary_versions") {
    const version = item as T & ItineraryVersion;
    return {
      id: version.id,
      trip_id: version.tripId,
      version_number: version.versionNumber,
      days_snapshot: version.days,
      change_description: version.changeDescription,
      parent_version_id: version.parentVersionId ?? null,
      is_current: version.isCurrent,
      critique_result: version.critiqueResult ?? null,
      created_at: version.createdAt,
    };
  }

  return item as Record<string, unknown>;
}

export const db = {
  async getAll<T>(collection: string): Promise<T[]> {
    const table = TABLE_MAP[collection] || collection;
    const supabase = await createServerSupabase();
    // Supabase returns 1000 max by default — paginate if needed
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .limit(1000);

    if (error) {
      console.error(`[DB] getAll ${collection}:`, error.message);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((item) =>
      deserializeItem<T>(collection, item)
    );
  },

  async getById<T>(collection: string, id: string): Promise<T | null> {
    const table = TABLE_MAP[collection] || collection;
    const supabase = await createServerSupabase();

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      // Also try thread_id for agent_sessions
      if (table === "agent_sessions") {
        const { data: d2 } = await supabase
          .from(table)
          .select("*")
          .eq("thread_id", id)
          .maybeSingle();
        return (d2 as T) ?? null;
      }
      if (error) console.error(`[DB] getById ${collection}/${id}:`, error.message);
      return null;
    }
    return deserializeItem<T>(collection, data as Record<string, unknown>);
  },

  async put<T extends { id?: string }>(
    collection: string,
    item: T
  ): Promise<T> {
    const table = TABLE_MAP[collection] || collection;
    const supabase = await createServerSupabase();
    const payload = serializeItem(collection, item);

    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error(`[DB] put ${collection}:`, error.message);
      throw error;
    }
    return data
      ? deserializeItem<T>(collection, data as Record<string, unknown>)
      : item;
  },

  async delete(collection: string, id: string): Promise<boolean> {
    const table = TABLE_MAP[collection] || collection;
    const supabase = await createServerSupabase();

    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      console.error(`[DB] delete ${collection}/${id}:`, error.message);
      return false;
    }
    return true;
  },

  async query<T>(
    collection: string,
    predicate: (item: T) => boolean
  ): Promise<T[]> {
    // Load all and filter — for complex predicates that can't be expressed in SQL
    // For P1, add direct Supabase filter support
    const all = await this.getAll<T>(collection);
    return all.filter(predicate);
  },
};
