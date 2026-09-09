import { NextRequest, NextResponse } from "next/server";
import { company, lookup, news, quotes } from "@/lib/dashboard/finance";
import { dashboardSettings } from "@/lib/dashboard/settings";
export const dynamic = "force-dynamic";
export async function GET(r: NextRequest) {
  try {
    const p = r.nextUrl.searchParams,
      action = p.get("action") || "quotes";
    if (action === "company")
      return NextResponse.json(await company(p.get("symbol") || ""));
    if (action === "news")
      return NextResponse.json(await news(p.get("symbol") || undefined));
    if (action === "search")
      return NextResponse.json(await lookup(p.get("q") || ""));
    if (action !== "quotes") throw new Error("Unknown finance action.");
    return NextResponse.json(await quotes(dashboardSettings().symbols));
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Finance unavailable",
      },
      {
        status: 400,
      },
    );
  }
}
