import { NextResponse } from 'next/server';
import { generateDailyBrief } from '@/lib/brief';
import { ProviderUnconfiguredError } from '@/lib/ai/provider';

/** VANTAGE — generate a brief now, rather than waiting for the schedule. */
export async function POST() {
  try {
    const { brief, delivered } = await generateDailyBrief();
    return NextResponse.json({ brief, delivered });
  } catch (error) {
    // An unconfigured model is a setup problem, not a server fault.
    if (error instanceof ProviderUnconfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[VANTAGE] manual brief failed:', error);
    return NextResponse.json({ error: 'Brief generation failed' }, { status: 500 });
  }
}
