'use client';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Component, type ReactNode, ReactElement } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactElement;
  onReset?: () => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Enhanced Error Boundary with:
 * - Structured error logging
 * - Error recovery UI
 * - Server-side error tracking
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorCount: 0 };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorCount: 0 };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));

    // Structured logging
    console.error(JSON.stringify({
      type: 'react_error_boundary',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      componentName: this.props.componentName,
      timestamp: new Date().toISOString(),
    }));

    // Send to server for centralized logging
    this.logErrorToServer(error, info);

    // Report to Sentry if available
    void import('@sentry/nextjs')
      .then(({ captureException }) =>
        captureException(error, {
          extra: { componentStack: info.componentStack },
          tags: { component: this.props.componentName || 'unknown' },
        })
      )
      .catch((e) => {
        console.warn('[ErrorBoundary] Sentry unavailable:', e);
      });
  }

  private logErrorToServer = async (error: Error, errorInfo: React.ErrorInfo) => {
    try {
      await fetch('/api/logs/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          componentName: this.props.componentName,
          timestamp: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }),
      });
    } catch (err) {
      console.error('[ErrorBoundary] Failed to log error:', err);
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-200 overflow-hidden">
            {/* Header bar */}
            <div className="h-1 w-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500" />

            {/* Content */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-8 w-8 text-red-500 flex-shrink-0 mt-1" />

                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-red-900 mb-1">เกิดข้อผิดพลาด</h2>
                  <p className="text-sm text-red-700 mb-4 leading-relaxed">
                    {this.state.error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'}
                  </p>

                  {/* Development stack trace */}
                  {isDevelopment && (
                    <details className="mt-4 mb-4">
                      <summary className="text-xs font-mono cursor-pointer text-gray-600 hover:text-gray-900 p-2 bg-gray-100 rounded">
                        ▼ Stack trace (Development only)
                      </summary>
                      <pre className="mt-2 overflow-auto max-h-48 text-[10px] bg-gray-900 text-green-400 p-2 rounded font-mono">
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}

                  {/* Recurring error warning */}
                  {this.state.errorCount > 2 && (
                    <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded">
                      <p className="text-xs text-orange-700 font-medium">⚠️ ปัญหาเกิดขึ้นหลายครั้ง</p>
                      <p className="text-xs text-orange-600 mt-1">
                        โปรดรีเฟรชหน้าหรือติดต่อทีมสนับสนุน
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={this.handleReset}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 active:scale-95 transition-all font-semibold text-sm"
                    >
                      <RefreshCw size={16} />
                      ลองใหม่
                    </button>
                    <button
                      onClick={() => (window.location.href = '/admin/dashboard')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 active:scale-95 transition-all font-semibold text-sm"
                    >
                      <Home size={16} />
                      หน้าแรก
                    </button>
                  </div>

                  <p className="text-xs text-gray-600 mt-4 text-center">
                    Error ID: {Math.random().toString(36).substr(2, 9)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
