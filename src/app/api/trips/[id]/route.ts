import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ActivityType } from "@/types/trip";

type DayRow = {
  id: string;
  trip_id: string;
  day_index: number;
  date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  day_id: string;
  order: number;
  type: string;
  poi_id?: string | null;
  poi_name?: string | null;
  poi_address?: string | null;
  poi_lat?: number | null;
  poi_lng?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  estimated_cost?: number | null;
  notes?: string | null;
  source_reason?: string | null;
  opening_hours?: string | null;
  recommended_duration?: number | null;
  travel_minutes_from_prev?: number | null;
  booking_required?: boolean | null;
  weather_fit?: string | null;
  ticket_reference?: string | null;
  is_generated?: boolean | null;
  created_at: string;
  updated_at: string;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

function mapTrip(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    destination: row.destination,
    destinationCoord: { lat: row.destination_lat ?? 0, lng: row.destination_lng ?? 0 },
    startDate: row.start_date,
    endDate: row.end_date,
    travelers: { adults: row.adults ?? 1, children: row.children ?? 0 },
    budget: { currency: row.currency ?? "CNY", min: row.budget_min ?? 0, max: row.budget_max ?? 10000 },
    preferences: row.preferences ?? [],
    status: row.status ?? "draft",
    isPublic: row.is_public ?? false,
    days: row.days ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    // Fetch trip
    const { data: tripRow, error: tripError } = await supabase
      .from("trips")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (tripError || !tripRow) {
      return NextResponse.json({ success: false, error: "行程不存在" }, { status: 404 });
    }

    // Fetch days for this trip (ordered by day_index)
    const { data: dayRows, error: daysError } = await supabase
      .from("days")
      .select("*")
      .eq("trip_id", id)
      .order("day_index", { ascending: true });

    if (daysError) {
      console.error("[trips/[id]] days fetch error:", daysError);
    }

    // Fetch activities for all days of this trip
    let activityRows: ActivityRow[] = [];
    if (dayRows?.length) {
      const dayIds = (dayRows as DayRow[]).map((d) => d.id);
      const { data: acts, error: actsError } = await supabase
        .from("activities")
        .select("*")
        .in("day_id", dayIds)
        .order("order", { ascending: true });

      if (actsError) {
        console.error("[trips/[id]] activities fetch error:", actsError);
      } else {
        activityRows = acts ?? [];
      }
    }

    // Map days with their activities
    const days = ((dayRows ?? []) as DayRow[]).map((dayRow) => ({
      id: dayRow.id,
      tripId: dayRow.trip_id,
      dayIndex: dayRow.day_index,
      date: dayRow.date,
      notes: dayRow.notes || "",
      activities: activityRows
        .filter((a) => a.day_id === dayRow.id)
        .map((a) => ({
          id: a.id,
          dayId: a.day_id,
          order: a.order,
          type: a.type as ActivityType,
          poi: a.poi_name ? {
            amapId: a.poi_id || "",
            name: a.poi_name,
            address: a.poi_address || "",
            coordinate: { lat: a.poi_lat ?? 0, lng: a.poi_lng ?? 0 },
            category: a.type || "other",
            photos: [],
            openingHours: a.opening_hours || undefined,
          } : (a.poi_lat && a.poi_lng ? {
            amapId: a.poi_id || "",
            name: a.poi_name || "",
            address: "",
            coordinate: { lat: a.poi_lat, lng: a.poi_lng },
            category: a.type || "other",
            photos: [],
            openingHours: a.opening_hours || undefined,
          } : null),
          customName: a.poi_name || "",
          startTime: a.start_time || "",
          endTime: a.end_time || "",
          durationMinutes: a.duration_minutes ?? 60,
          estimatedCost: a.estimated_cost ?? 0,
          notes: a.notes || "",
          sourceReason: a.source_reason || "",
          openingHours: a.opening_hours || "",
          recommendedDuration: a.recommended_duration ?? a.duration_minutes ?? 60,
          travelMinutesFromPrev: a.travel_minutes_from_prev ?? undefined,
          bookingRequired: a.booking_required ?? false,
          weatherFit: a.weather_fit || "any",
          ticketReference: a.ticket_reference || "",
          isGenerated: a.is_generated ?? false,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
        })),
      createdAt: dayRow.created_at,
      updatedAt: dayRow.updated_at,
    }));

    const trip = {
      ...mapTrip(tripRow),
      days,
    };

    return NextResponse.json({ success: true, data: trip });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = getSupabase();
    const { error } = await supabase.from("trips").update({
      title: body.title,
      destination: body.destination,
      destination_lat: body.destinationCoord?.lat,
      destination_lng: body.destinationCoord?.lng,
      start_date: body.startDate,
      end_date: body.endDate,
      adults: body.travelers?.adults,
      children: body.travelers?.children,
      budget_min: body.budget?.min,
      budget_max: body.budget?.max,
      preferences: body.preferences,
      status: body.status,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true, data: body });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
