import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../utils/logger';

export interface TimingData {
  method: string;
  pathname: string;
  status: number;
  duration: number;
  timestamp: number;
}

export function withTiming(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const start = performance.now();
    const url = new URL(req.url);
    
    try {
      const response = await handler(req);
      const duration = performance.now() - start;
      
      const timingData: TimingData = {
        method: req.method,
        pathname: url.pathname,
        status: response.status,
        duration,
        timestamp: Date.now(),
      };
      
      // Log slow requests (>500ms)
      if (duration > 500) {
        logger.warn({
          type: 'slow_request',
          ...timingData,
        });
      }
      
      // Add timing header to response
      const headers = new Headers(response.headers);
      headers.set('X-Response-Time', `${duration.toFixed(2)}ms`);
      
      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      const duration = performance.now() - start;
      
      logger.error({
        type: 'request_error',
        method: req.method,
        pathname: url.pathname,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  };
}

export function createTimingReport(): TimingData[] {
  // This would typically store timing data in memory or a cache
  // For now, we'll return empty array and implement storage later
  return [];
}