import { db } from "@/lib/db/store";
import type { Trip } from "@/types/trip";

export function saveLocalTrip(trip: Trip): Trip {
  return db.put("trips", trip);
}

export function loadLocalTrip(id: string): Trip | null {
  return db.getById<Trip>("trips", id);
}

export function listLocalTrips(userId?: string): Trip[] {
  return db
    .query<Trip>("trips", (trip) => !userId || trip.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function deleteLocalTrip(id: string): boolean {
  return db.delete("trips", id);
}
