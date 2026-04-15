import { NextResponse } from 'next/server';

// Liveness probe: returns 200 if the Next.js process is running. Does NOT
// hit the database — kubelet/docker use this to decide whether to restart
// the pod, so we want it fast and dependency-free. A DB outage should not
// cause pod churn.
export const GET = () => NextResponse.json({ status: 'alive' }, { status: 200 });
