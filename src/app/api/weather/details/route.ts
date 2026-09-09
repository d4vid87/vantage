import { NextRequest, NextResponse } from "next/server";
import { dashboardSettings } from "@/lib/dashboard/settings";
import {
  forecast,
  resolveGeometry,
  hurricanes,
  placeSearch,
  radar,
  weatherAlerts,
  weatherGrid,
} from "@/lib/dashboard/weather";
export const dynamic = "force-dynamic";
export async function GET(r: NextRequest) {
  try {
    const p = r.nextUrl.searchParams,
      action = p.get("action") || "alerts";
    if (action === "radar") return NextResponse.json(await radar());
    if (action === "hurricanes") return NextResponse.json(await hurricanes());
    if (action === "search")
      return NextResponse.json(await placeSearch(p.get("q") || ""));
    if (action === "grid" && (!p.has("lat") || !p.has("lng")))
      throw new Error("A grid center is required.");
    if (action === "grid")
      return NextResponse.json(
        await weatherGrid(Number(p.get("lat")), Number(p.get("lng"))),
      );
    const s = dashboardSettings(),
      place = s.places.find((x) => x.id === p.get("place"));
    if (p.has("place") && !place) throw new Error("Saved place not found.");
    if (action === "forecast") {
      if (!place) throw new Error("Save a place first.");
      return NextResponse.json(await forecast(place, s.units));
    }
    if (action !== "alerts") throw new Error("Unknown weather action");
    const alerts = await weatherAlerts(place);
    if (place && p.get("geometry") === "1" && alerts.data) {
      const resolved = [];
      for (let i = 0; i < alerts.data.length; i += 4)
        resolved.push(
          ...(await Promise.all(
            alerts.data.slice(i, i + 4).map(resolveGeometry),
          )),
        );
      return NextResponse.json({ ...alerts, data: resolved });
    }
    return NextResponse.json(alerts);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Weather unavailable",
      },
      {
        status: 400,
      },
    );
  }
}
