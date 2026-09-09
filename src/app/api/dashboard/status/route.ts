import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({
    financeConfigured: !!process.env.FINNHUB_API_KEY,
    authEnabled: !!process.env.VANTAGE_AUTH_PASSWORD,
  });
}
