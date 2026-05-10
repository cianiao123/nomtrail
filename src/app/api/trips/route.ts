import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "local-user";
    const supabase = await createServerSupabase();

    // Fetch trips
    const { data: tripRows, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!tripRows?.length) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch days for all these trips
    const tripIds = tripRows.map((t: any) => t.id);
    const { data: allDays } = await supabase
      .from("days")
      .select("*")
      .in("trip_id", tripIds)
      .order("day_index", { ascending: true });

    // Map Supabase columns back to frontend Trip shape
    const trips = tripRows.map((t: Record<string, unknown>) => ({
      id: t.id,
      userId: t.user_id,
      title: t.title,
      destination: t.destination,
      destinationCoord: { lat: t.destination_lat, lng: t.destination_lng },
      startDate: t.start_date,
      endDate: t.end_date,
      travelers: { adults: t.adults, children: t.children },
      budget: { currency: t.currency, min: t.budget_min, max: t.budget_max },
      preferences: t.preferences,
      status: t.status,
      isPublic: t.is_public,
      days: (allDays ?? [])
        .filter((d: any) => d.trip_id === t.id)
        .map((d: any) => ({
          id: d.id,
          tripId: d.trip_id,
          dayIndex: d.day_index,
          date: d.date,
          notes: d.notes || "",
          activities: [],
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        })),
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({ success: true, data: trips });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id || crypto.randomUUID();
    const supabase = await createServerSupabase();

    const { error } = await supabase.from("trips").insert({
      id,
      user_id: body.userId || "local-user",
      title: body.title || "未命名行程",
      destination: body.destination || "",
      destination_lat: body.destinationCoord?.lat ?? null,
      destination_lng: body.destinationCoord?.lng ?? null,
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      adults: body.travelers?.adults ?? 1,
      children: body.travelers?.children ?? 0,
      currency: body.budget?.currency ?? "CNY",
      budget_min: body.budget?.min ?? 0,
      budget_max: body.budget?.max ?? 10000,
      preferences: body.preferences ?? [],
      status: body.status ?? "draft",
      is_public: body.isPublic ?? false,
      created_at: body.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) throw new Error(JSON.stringify(error));

    if (Array.isArray(body.days) && body.days.length > 0) {
      const dayRows = body.days.map((day: Record<string, unknown>, index: number) => ({
        id: day.id || crypto.randomUUID(),
        trip_id: id,
        day_index: typeof day.dayIndex === "number" ? day.dayIndex : index,
        date: day.date ?? body.startDate ?? null,
        notes: day.notes ?? "",
        created_at: day.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: daysError } = await supabase.from("days").insert(dayRows);
      if (daysError) throw new Error(JSON.stringify(daysError));

      const activityRows = body.days.flatMap((day: Record<string, any>) =>
        Array.isArray(day.activities)
          ? day.activities.map((activity: Record<string, any>, index: number) => ({
              id: activity.id || crypto.randomUUID(),
              day_id: day.id,
              order: activity.order ?? (index + 1) * 1000,
              type: activity.type || "attraction",
              poi_name: activity.customName || activity.poi?.name || "",
              poi_address: activity.poi?.address || "",
              poi_lat: activity.poi?.coordinate?.lat ?? null,
              poi_lng: activity.poi?.coordinate?.lng ?? null,
              start_time: activity.startTime || "",
              end_time: activity.endTime || "",
              duration_minutes: activity.durationMinutes ?? 60,
              estimated_cost: activity.estimatedCost ?? 0,
              notes: activity.notes || "",
              source_reason: activity.sourceReason || "",
              opening_hours: activity.openingHours || "",
              recommended_duration: activity.recommendedDuration ?? activity.durationMinutes ?? 60,
              travel_minutes_from_prev: activity.travelMinutesFromPrev ?? null,
              booking_required: activity.bookingRequired ?? false,
              weather_fit: activity.weatherFit || "any",
              ticket_reference: activity.ticketReference || "",
              is_generated: activity.isGenerated ?? false,
              created_at: activity.createdAt || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }))
          : []
      );

      if (activityRows.length > 0) {
        const { error: activitiesError } = await supabase.from("activities").insert(activityRows);
        if (activitiesError) {
          const fallbackRows = activityRows.map((activity: Record<string, any>) => ({
            id: activity.id,
            day_id: activity.day_id,
            order: activity.order,
            type: activity.type,
            poi_name: activity.poi_name,
            start_time: activity.start_time,
            end_time: activity.end_time,
            duration_minutes: activity.duration_minutes,
            estimated_cost: activity.estimated_cost,
            notes: activity.notes,
            is_generated: activity.is_generated,
          }));
          const { error: fallbackError } = await supabase.from("activities").insert(fallbackRows);
          if (fallbackError) throw new Error(JSON.stringify(fallbackError));
        }
      }
    }

    return NextResponse.json({ success: true, data: { ...body, id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("[trips POST]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
