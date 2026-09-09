import { NextResponse } from "next/server";
import {
  dashboardSettings,
  saveDashboardSettings,
} from "@/lib/dashboard/settings";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(dashboardSettings());
}
export async function PUT(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 200_000) throw new Error("Settings are too large.");
    return NextResponse.json(saveDashboardSettings(JSON.parse(text)));
  } catch (e) {
    const error = e instanceof Error ? e.message : "Invalid settings";
    return NextResponse.json(
      {
        error,
      },
      {
        status: error.includes("another device") ? 409 : 400,
      },
    );
  }
}
