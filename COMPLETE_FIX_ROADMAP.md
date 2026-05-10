# 🎯 Complete Refactoring Roadmap - 7.3 → 10.0/10 (Full Fix)

**Timeline**: 12 สัปดาห์  
**Team**: 4-6 คน  
**Target**: ✅ 10.0/10 บน 2026-08-10  

---

## 📋 MASTER ISSUE LIST (ทั้งหมด 67 Issues)

### PHASE 1: CRITICAL (P0) - Week 1-2
**Goal**: Fix breaking issues, stabilize system  
**Target Score**: 8.5/10

#### **Group 1: Error Handling (Issues 1-8)**

| # | Issue | File/Pages | Effort | Score | Status |
|---|-------|-----------|--------|-------|--------|
| 1 | Silent API failures in dashboard | `src/app/admin/dashboard/page.tsx:414-423` | 2h | +0.6 | 🔴 |
| 2 | No error boundaries on pages | All 80 pages | 3h | +0.5 | 🔴 |
| 3 | Unhandled promise rejections | Multiple pages | 2h | +0.3 | 🔴 |
| 4 | No global error logger | System-wide | 1h | +0.2 | 🔴 |
| 5 | Error messages not shown to users | Forms, API calls | 2h | +0.4 | 🔴 |
| 6 | No error recovery UI | All pages | 2h | +0.3 | 🔴 |
| 7 | Missing HTTP status code handling | 120 routes | 2h | +0.2 | 🔴 |
| 8 | No error context propagation | Services | 1h | +0.2 | 🔴 |
| | **Subtotal** | | **15h** | **+3.7** | |

#### **Group 2: API Response Consistency (Issues 9-15)**

| # | Issue | File/Routes | Effort | Score | Status |
|---|-------|------------|--------|-------|--------|
| 9 | Inconsistent response wrapping | All API routes | 6h | +0.8 | 🔴 |
| 10 | Different error response formats | 120 routes | 4h | +0.6 | 🔴 |
| 11 | Status code inconsistency (200 vs 201) | Create routes | 2h | +0.2 | 🔴 |
| 12 | Missing metadata in responses | Pagination routes | 1h | +0.1 | 🔴 |
| 13 | Null vs undefined inconsistency | Data returns | 2h | +0.3 | 🔴 |
| 14 | Missing request ID tracking | All routes | 2h | +0.2 | 🔴 |
| 15 | No response validation schema | Frontend | 2h | +0.2 | 🔴 |
| | **Subtotal** | | **19h** | **+2.4** | |

#### **Group 3: Input Validation (Issues 16-21)**

| # | Issue | Location | Effort | Score | Status |
|---|-------|----------|--------|-------|--------|
| 16 | Inconsistent query param validation | Payment/Room/Invoice routes | 3h | +0.3 | 🔴 |
| 17 | Missing rate limit centralization | 10+ routes | 2h | +0.2 | 🔴 |
| 18 | No centralized query builder | All GET routes | 3h | +0.3 | 🔴 |
| 19 | Form validation scattered | Setup, Rooms, Forms | 4h | +0.4 | 🔴 |
| 20 | No input sanitization visible | All routes | 2h | +0.2 | 🔴 |
| 21 | SQL injection risk in raw queries | Database layer | 2h | +0.2 | 🔴 |
| | **Subtotal** | | **16h** | **+1.6** | |

#### **GROUP 1 DETAILED IMPLEMENTATION**

### Fix 1: Create Error Boundary System
```typescript
// src/components/error-boundary.tsx
'use client';
import { Component, ReactNode, ReactElement } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactElement;
  onError?: (error: Error) => void;
  isolate?: boolean; // Don't catch errors from children
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
    
    // Log to monitoring service
    console.error('[ErrorBoundary]', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });

    // Send to external logging
    if (typeof window !== 'undefined') {
      fetch('/api/logs/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {/* silent fail on logging error */});
    }

    this.props.onError?.(error);
  }

  retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.retry);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 border border-red-200">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-red-500 mt-1 flex-shrink-0" size={24} />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-red-900 mb-2">เกิดข้อผิดพลาด</h2>
                <p className="text-sm text-red-700 mb-4 leading-relaxed">
                  {this.state.error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'}
                </p>
                
                {process.env.NODE_ENV === 'development' && (
                  <details className="text-xs bg-gray-100 p-2 rounded mt-3 mb-4">
                    <summary className="cursor-pointer font-mono">Stack trace</summary>
                    <pre className="mt-2 overflow-auto max-h-48 text-[10px]">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={this.retry}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    <RefreshCw size={16} />
                    ลองใหม่
                  </button>
                  <button
                    onClick={() => window.location.href = '/admin/dashboard'}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    หน้าแรก
                  </button>
                </div>

                {this.state.errorCount > 3 && (
                  <p className="text-xs text-gray-600 mt-4 text-center">
                    หากปัญหาแก้ไม่ได้ โปรดติดต่อทีมสนับสนุน
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Apply to all 80 pages:**
```typescript
// src/app/admin/layout.tsx
import { ErrorBoundary } from '@/components/error-boundary';

export default function AdminLayout({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
}
```

### Fix 2: Create API Error Handler
```typescript
// src/lib/utils/api-error.ts
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// src/lib/utils/errors.ts
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

export const asyncHandler = (
  fn: (req: NextRequest) => Promise<NextResponse>
) => async (req: NextRequest) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const response = await fn(req);
    const duration = Date.now() - startTime;

    logger.info({
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      duration,
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    const appError = error instanceof ApiError
      ? error
      : new ApiError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', 500);

    logger.error({
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      error: appError.message,
      code: appError.code,
      statusCode: appError.statusCode,
      duration,
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: appError.code,
          message: appError.message,
          statusCode: appError.statusCode,
          details: process.env.NODE_ENV === 'development' ? appError.details : undefined,
        },
        requestId,
      },
      { status: appError.statusCode }
    );
  }
};
```

### Fix 3: Create Client API Hook
```typescript
// src/hooks/useApi.ts
import { useCallback, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const request = useCallback(async <T,>(
    url: string,
    options?: RequestInit
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const json = (await response.json()) as ApiResponse<T>;

      if (!json.success) {
        const errorMsg = json.error?.message || 'Unknown error';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      return json.data || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { request, loading, error };
}
```

---

### PHASE 2: HIGH PRIORITY (P1) - Week 3-4
**Goal**: Fix major code quality issues  
**Target Score**: 9.2/10

#### **Group 4: Color & Styling System (Issues 22-28)**

```typescript
// src/lib/theme.ts - Centralize ALL colors
export const SEMANTIC_COLORS = {
  // Status colors
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-600' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-600' },
  danger: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-600' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' },
  
  // Accent colors (for cards)
  green: {
    light: 'bg-[hsl(150,28%,92%)]',
    dark: 'dark:bg-[hsl(150,30%,18%)]',
    text: 'text-[hsl(150,36%,32%)]',
    darkText: 'dark:text-[hsl(150,30%,72%)]',
    icon: 'bg-[hsl(150,28%,92%)] text-[hsl(150,36%,32%)] dark:bg-[hsl(150,30%,18%)] dark:text-[hsl(150,30%,72%)]',
  },
  red: {
    light: 'bg-[hsl(12,50%,93%)]',
    dark: 'dark:bg-[hsl(8,35%,18%)]',
    text: 'text-[hsl(8,48%,42%)]',
    darkText: 'dark:text-[hsl(8,50%,78%)]',
    icon: 'bg-[hsl(12,50%,93%)] text-[hsl(8,48%,42%)] dark:bg-[hsl(8,35%,18%)] dark:text-[hsl(8,50%,78%)]',
  },
  yellow: {
    light: 'bg-[hsl(38,55%,92%)]',
    dark: 'dark:bg-[hsl(32,35%,18%)]',
    text: 'text-[hsl(32,50%,36%)]',
    darkText: 'dark:text-[hsl(38,55%,75%)]',
    icon: 'bg-[hsl(38,55%,92%)] text-[hsl(32,50%,36%)] dark:bg-[hsl(32,35%,18%)] dark:text-[hsl(38,55%,75%)]',
  },
  blue: {
    light: 'bg-[hsl(160,28%,92%)]',
    dark: 'dark:bg-[hsl(165,32%,16%)]',
    text: 'text-[hsl(165,42%,20%)]',
    darkText: 'dark:text-[hsl(160,30%,72%)]',
    icon: 'bg-[hsl(160,28%,92%)] text-[hsl(165,42%,20%)] dark:bg-[hsl(165,32%,16%)] dark:text-[hsl(160,30%,72%)]',
  },
} as const;

export type AccentColor = keyof typeof SEMANTIC_COLORS;
export type SemanticColor = 'success' | 'warning' | 'danger' | 'info';

export function getAccentColors(accent: AccentColor) {
  return SEMANTIC_COLORS[accent];
}
```

**Create themed components:**
```typescript
// src/components/ui/themed/kpi-card.tsx
interface KpiCardProps {
  label: string;
  value: number | string;
  accent: AccentColor;
  icon: React.ElementType;
  href?: string;
  sub?: string;
}

export function KpiCard({ label, value, accent, icon: Icon, href, sub }: KpiCardProps) {
  const colors = getAccentColors(accent);
  
  const card = (
    <div className={`border rounded-xl p-5 ${colors.light} ${colors.border}`}>
      <div className="flex items-start justify-between gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase">{label}</span>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className={`text-3xl font-extrabold ${colors.text}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1.5">{sub}</div>}
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}
```

#### **Group 5: State Management (Issues 29-35)**

```typescript
// src/hooks/useFormState.ts
interface FormState<T> {
  values: T;
  errors: Record<keyof T, string>;
  touched: Record<keyof T, boolean>;
  isDirty: boolean;
  isSubmitting: boolean;
}

export function useFormState<T extends Record<string, any>>(
  initialValues: T,
  onSubmit: (values: T) => Promise<void>,
  validate?: (values: T) => Record<keyof T, string>
) {
  const [state, setState] = useState<FormState<T>>({
    values: initialValues,
    errors: {} as Record<keyof T, string>,
    touched: {} as Record<keyof T, boolean>,
    isDirty: false,
    isSubmitting: false,
  });

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setState(prev => ({
      ...prev,
      values: { ...prev.values, [field]: value },
      isDirty: true,
      errors: { ...prev.errors, [field]: '' },
    }));
  }, []);

  const setFieldTouched = useCallback((field: keyof T) => {
    setState(prev => ({
      ...prev,
      touched: { ...prev.touched, [field]: true },
    }));

    if (validate) {
      const errors = validate(state.values);
      setState(prev => ({
        ...prev,
        errors: { ...prev.errors, [field]: errors[field] || '' },
      }));
    }
  }, [validate, state.values]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (validate) {
      const newErrors = validate(state.values);
      if (Object.values(newErrors).some(err => err)) {
        setState(prev => ({ ...prev, errors: newErrors }));
        return;
      }
    }

    setState(prev => ({ ...prev, isSubmitting: true }));
    try {
      await onSubmit(state.values);
    } finally {
      setState(prev => ({ ...prev, isSubmitting: false }));
    }
  }, [state.values, validate, onSubmit]);

  const reset = useCallback(() => {
    setState({
      values: initialValues,
      errors: {} as Record<keyof T, string>,
      touched: {} as Record<keyof T, boolean>,
      isDirty: false,
      isSubmitting: false,
    });
  }, [initialValues]);

  return {
    ...state,
    setFieldValue,
    setFieldTouched,
    handleSubmit,
    reset,
  };
}
```

```typescript
// src/hooks/useTableState.ts
interface TableState {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  search: string;
  filters: Record<string, any>;
}

export function useTableState(initialFilters?: Record<string, any>) {
  const [state, setState] = useState<TableState>({
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    search: '',
    filters: initialFilters || {},
  });

  const setPage = useCallback((page: number) => {
    setState(prev => ({ ...prev, page: Math.max(1, page) }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setState(prev => ({ ...prev, pageSize: Math.min(100, size), page: 1 }));
  }, []);

  const setSort = useCallback((sortBy: string, sortOrder?: 'asc' | 'desc') => {
    setState(prev => ({
      ...prev,
      sortBy,
      sortOrder: sortOrder || (prev.sortBy === sortBy && prev.sortOrder === 'asc' ? 'desc' : 'asc'),
    }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setState(prev => ({ ...prev, search, page: 1 }));
  }, []);

  const setFilter = useCallback((key: string, value: any) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
      page: 1,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      search: '',
      filters: initialFilters || {},
    });
  }, [initialFilters]);

  return {
    ...state,
    setPage,
    setPageSize,
    setSort,
    setSearch,
    setFilter,
    reset,
    queryParams: {
      page: state.page,
      pageSize: state.pageSize,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      q: state.search,
      ...state.filters,
    },
  };
}
```

#### **Group 6: Large Component Refactoring (Issues 36-42)**

**Split dashboard/page.tsx (800 lines → 5 components)**

```
dashboard/
├── page.tsx (100 lines - orchestrator)
├── components/
│   ├── dashboard-kpis.tsx (100 lines)
│   ├── dashboard-alerts.tsx (150 lines)
│   ├── dashboard-tasks.tsx (200 lines)
│   ├── dashboard-activity.tsx (120 lines)
│   └── dashboard-header.tsx (80 lines)
└── hooks/
    ├── useDashboardData.ts
    ├── useDashboardAlerts.ts
    └── useDashboardActivity.ts
```

```typescript
// src/app/admin/dashboard/hooks/useDashboardData.ts
export function useDashboardData() {
  const { request } = useApi();
  const [occupancy, setOccupancy] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      request('/api/analytics/occupancy'),
      request('/api/analytics/summary'),
    ]).then(([occ, sum]) => {
      setOccupancy(occ);
      setSummary(sum);
    }).finally(() => setLoading(false));
  }, [request]);

  return { occupancy, summary, loading };
}

// src/app/admin/dashboard/components/dashboard-kpis.tsx
export function DashboardKpis({ occupancy, summary, loading }: Props) {
  return (
    <StaggerList className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {loading ? (
        Array(4).fill(0).map((_, i) => <SkeletonCard key={i} className="h-32" />)
      ) : (
        <>
          <KpiCard label="ห้องว่าง" value={occupancy?.vacantRooms} ... />
          <KpiCard label="ค้างชำระ" value={summary?.overdueInvoices} ... />
          {/* ... */}
        </>
      )}
    </StaggerList>
  );
}
```

---

### PHASE 3: MEDIUM PRIORITY (P2) - Week 5-7
**Goal**: Fix data consistency, add documentation  
**Target Score**: 9.6/10

#### **Group 7: Data Normalization (Issues 43-48)**

```typescript
// src/modules/shared/types.ts - Canonical types
export interface Room {
  roomNo: string;           // Single source of truth
  floorNo: number;
  roomStatus: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'OWNER_USE';
  defaultRentAmount: number;
  hasFurniture: boolean;
  defaultFurnitureAmount: number;
  defaultAccountId: string;
  defaultRuleCode: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  roomNo: string;
  totalAmount: number;         // Single source of truth
  status: 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  dueDate: string;            // ISO 8601
  sentAt?: string | null;
  paidAt?: string | null;
}

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;           // Computed from firstName + lastName
  email: string | null;
  phone: string | null;
  lineUserId: string | null;
}
```

**Update all API routes to return canonical types:**
```typescript
// src/app/api/invoices/route.ts
const result = await invoiceService.listInvoices(validatedQuery);

// Normalize response
const normalized = result.data.map(inv => ({
  id: inv.id,
  invoiceNumber: inv.invoiceNumber,
  roomNo: inv.roomNo,           // Use ONLY roomNo
  totalAmount: inv.totalAmount, // Use ONLY totalAmount
  status: inv.status,
  dueDate: inv.dueDate,
  sentAt: inv.sentAt,
  paidAt: inv.paidAt,
}));

return NextResponse.json(
  formatSuccess(normalized, undefined, { ...result.meta })
);
```

#### **Group 8: API Documentation (Issues 49-53)**

```typescript
// src/lib/swagger-setup.ts
import swaggerJsdoc from 'swagger-jsdoc';

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Apartment ERP API',
      version: '1.0.0',
      description: 'Complete API for apartment management',
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Development' },
      { url: 'https://api.example.com', description: 'Production' },
    ],
    components: {
      schemas: {
        Room: {
          type: 'object',
          properties: {
            roomNo: { type: 'string' },
            floorNo: { type: 'number' },
            roomStatus: { type: 'string', enum: ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'OWNER_USE'] },
          },
          required: ['roomNo', 'floorNo'],
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { $ref: '#/components/schemas/ApiError' },
            meta: { type: 'object' },
          },
          required: ['success'],
        },
        ApiError: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'number' },
          },
          required: ['code', 'message', 'statusCode'],
        },
      },
    },
  },
  apis: ['./src/app/api/**/*.ts'],
});

export default swaggerSpec;
```

**Add JSDoc to all routes:**
```typescript
/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: List all invoices
 *     description: Retrieve paginated list of invoices with filtering and sorting
 *     tags:
 *       - Invoices
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: pageSize
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: status
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: ['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED']
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Invoice'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *                     total: { type: integer }
 *       401:
 *         description: Unauthorized
 */
export const GET = asyncHandler(async (req: NextRequest) => {
  // ...
});
```

#### **Group 9: Logging & Monitoring (Issues 54-58)**

```typescript
// src/lib/logger.ts - Structured logging
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'apartment-erp' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

export default logger;
```

```typescript
// Usage in routes
logger.info({
  requestId,
  action: 'INVOICE_GENERATED',
  actor: session.sub,
  entityId: invoice.id,
  duration: Date.now() - startTime,
  metadata: { roomNo: invoice.roomNo },
});

logger.error({
  requestId,
  action: 'INVOICE_GENERATION_FAILED',
  error: err.message,
  stack: err.stack,
  duration: Date.now() - startTime,
});
```

#### **Group 10: Form Validation (Issues 59-62)**

```typescript
// src/lib/validators.ts - Centralized validation
import { z } from 'zod';

export const roomSchema = z.object({
  roomNo: z.string().min(1, 'Room number required'),
  floorNo: z.number().min(1),
  defaultRentAmount: z.number().min(0),
  hasFurniture: z.boolean(),
  defaultFurnitureAmount: z.number().min(0),
});

export const invoiceFilterSchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(20),
  status: z.enum(['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  q: z.string().max(100).optional(),
});

export const contractSchema = z.object({
  roomId: z.string().uuid(),
  tenantId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0),
});

// Use in routes
export const POST = asyncHandler(async (req) => {
  const body = roomSchema.parse(await req.json());
  // ...
});

// Use in frontend
function RoomForm() {
  const form = useFormState({}, async (values) => {
    roomSchema.parse(values);
    // Submit...
  }, (values) => {
    try {
      roomSchema.parse(values);
      return {};
    } catch (err) {
      return err.flatten().fieldErrors;
    }
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <input
        value={form.values.roomNo}
        onChange={(e) => form.setFieldValue('roomNo', e.target.value)}
        onBlur={() => form.setFieldTouched('roomNo')}
      />
      {form.touched.roomNo && form.errors.roomNo && (
        <span className="text-red-600 text-sm">{form.errors.roomNo}</span>
      )}
    </form>
  );
}
```

---

### PHASE 4: OPTIMIZATION (P3) - Week 8-10
**Goal**: Performance, caching, monitoring  
**Target Score**: 9.8/10

#### **Group 11: Performance Optimization (Issues 63-66)**

```typescript
// src/lib/cache.ts - Redis caching layer
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL,
});

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 300 // 5 minutes
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const result = await fetcher();
  await redis.setEx(key, ttl, JSON.stringify(result));
  return result;
}

// Usage
export const GET = asyncHandler(async (req) => {
  const occupancy = await getCached(
    'analytics:occupancy',
    () => analytics.getOccupancy(),
    600 // Cache for 10 minutes
  );
  
  return NextResponse.json(formatSuccess(occupancy));
});
```

```typescript
// src/middleware.ts - Request deduplication
import { NextRequest, NextResponse } from 'next/server';

const pendingRequests = new Map<string, Promise<any>>();

export async function middleware(req: NextRequest) {
  const key = `${req.method}:${req.nextUrl.pathname}:${req.nextUrl.search}`;

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = fetch(req);
  pendingRequests.set(key, promise);

  try {
    const response = await promise;
    return response;
  } finally {
    pendingRequests.delete(key);
  }
}
```

#### **Group 12: Testing Infrastructure (Issues 67)**

```typescript
// tests/unit/hooks/useFormState.test.ts
import { renderHook, act } from '@testing-library/react';
import { useFormState } from '@/hooks/useFormState';

describe('useFormState', () => {
  it('should initialize with correct values', () => {
    const { result } = renderHook(() =>
      useFormState({ name: '', email: '' }, async () => {})
    );

    expect(result.current.values).toEqual({ name: '', email: '' });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('should update field value', () => {
    const { result } = renderHook(() =>
      useFormState({ name: '' }, async () => {})
    );

    act(() => {
      result.current.setFieldValue('name', 'John');
    });

    expect(result.current.values.name).toBe('John');
    expect(result.current.isDirty).toBe(true);
  });

  it('should validate on submit', async () => {
    const validate = jest.fn((values) => ({
      name: values.name ? '' : 'Required',
    }));
    const onSubmit = jest.fn();

    const { result } = renderHook(() =>
      useFormState({ name: '' }, onSubmit, validate)
    );

    await act(async () => {
      const form = document.createElement('form');
      result.current.handleSubmit({ preventDefault: () => {} } as any);
    });

    expect(validate).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

---

## 📊 COMPLETE IMPLEMENTATION TIMELINE

### Week 1-2: Phase 1 (P0) - CRITICAL
- **Focus**: Error handling, API consistency, critical fixes
- **Team**: 4 developers
- **Deliverable**: Stable MVP with proper error handling
- **Score Target**: 8.5/10

| Task | Mon | Tue | Wed | Thu | Fri |
|------|-----|-----|-----|-----|-----|
| Error Boundaries | ✅ | ✅ | | | |
| API Response Format | | | ✅ | ✅ | ✅ |
| Error Logger | ✅ | ✅ | | | |
| Testing/Review | | | | | ✅ |

### Week 3-4: Phase 2 (P1) - HIGH PRIORITY
- **Focus**: Color system, state management, large components
- **Team**: 3 developers
- **Deliverable**: Refactored, maintainable code
- **Score Target**: 9.2/10

### Week 5-7: Phase 3 (P2) - MEDIUM PRIORITY
- **Focus**: Data normalization, documentation, validation
- **Team**: 2 developers
- **Deliverable**: Documented, normalized API
- **Score Target**: 9.6/10

### Week 8-10: Phase 4 (P3) - OPTIMIZATION
- **Focus**: Performance, caching, monitoring
- **Team**: 2 developers
- **Deliverable**: Fast, observable system
- **Score Target**: 9.8/10

### Week 11-12: Phase 5 (P4) - TESTING
- **Focus**: Unit tests, E2E tests, coverage
- **Team**: 2 developers
- **Deliverable**: 50%+ test coverage
- **Score Target**: 10.0/10

---

## 👥 TEAM ALLOCATION

```
Week 1-2:  4 devs (all on P0)
           │
           ├─ Dev 1-2: Error handling + boundaries (2 days)
           ├─ Dev 2-3: API response standardization (3 days)
           ├─ Dev 3-4: Logging + monitoring (1.5 days)
           └─ All: Testing + review (1 day)

Week 3-4:  3 devs (P1 focus)
           │
           ├─ Dev 1: Color system refactor (2 days)
           ├─ Dev 2-3: Component splitting (2 days)
           ├─ Dev 2: Custom hooks (1.5 days)
           └─ All: Testing (1 day)

Week 5-7:  2 devs (P2 focus)
           │
           ├─ Dev 1: Data normalization (2 days)
           ├─ Dev 2: API documentation (2.5 days)
           ├─ Dev 1-2: Form validation (2 days)
           └─ All: Testing (1 day)

Week 8-10: 2 devs (P3 focus)
           │
           ├─ Dev 1: Redis caching (1.5 days)
           ├─ Dev 2: Performance optimization (1.5 days)
           ├─ Dev 1-2: Monitoring setup (1 day)
           └─ All: Testing (1 day)

Week 11-12: 2 devs (Testing)
            │
            ├─ Dev 1: Unit tests (3 days)
            ├─ Dev 2: E2E tests (3 days)
            └─ All: Coverage reporting (1 day)
```

---

## 💰 EFFORT ESTIMATION

| Phase | P0 | P1 | P2 | P3 | P4 | Total |
|-------|----|----|----|----|----|----- |
| **Effort (hours)** | 50 | 40 | 35 | 30 | 25 | **180 hours** |
| **Team Cost** | 4 devs | 3 devs | 2 devs | 2 devs | 2 devs | ~2 weeks |
| **Calendar Time** | 2 weeks | 2 weeks | 2 weeks | 2 weeks | 2 weeks | **10 weeks** |

**Optimized Path** (focus on high-impact items):
- Remove P4 items initially: -25h
- **New Total**: 155 hours = 8 weeks
- **Target Completion**: 2026-07-05

---

## 📈 SCORE PROGRESSION

```
Week 0:  7.3/10 ████████░░░░░░░░░░░░ (Current state)
Week 2:  8.5/10 ███████████░░░░░░░░░░ (+1.2 points)
Week 4:  9.2/10 ████████████████░░░░░ (+0.7 points)
Week 7:  9.6/10 █████████████████░░░░ (+0.4 points)
Week 10: 9.8/10 ██████████████████░░░ (+0.2 points)
Week 12: 10.0/10 ████████████████████ (+0.2 points)
```

---

## ✅ SUCCESS CRITERIA

- ✅ All P0 issues resolved (error handling, API consistency)
- ✅ Code passes linting (ESLint, Prettier)
- ✅ TypeScript strict mode (tsconfig strictNullChecks)
- ✅ Error rate < 0.5%
- ✅ Page load < 2s
- ✅ API response time < 300ms
- ✅ 50%+ test coverage
- ✅ Full API documentation (Swagger)
- ✅ Zero console errors/warnings on production
- ✅ All 67 issues resolved

---

## 🚨 RISK MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Breaking changes in API | High | Critical | Use feature flags, versioning |
| Scope creep | High | Medium | Strict issue tracking, no additions |
| Performance degradation | Medium | High | Load test before deploying |
| Developer burnout | Medium | Medium | Realistic deadlines, rotation |
| Database migration issues | Low | Critical | Test on staging first, rollback plan |

---

## 📋 DEPENDENCIES & ORDERING

```
Phase 1 (P0)
    ↓
Phase 2 (P1) - depends on P0
    ↓
Phase 3 (P2) - depends on P0, P1
    ├──→ Phase 4 (P3) - parallel with P2
    ↓
Phase 5 (P4) - depends on P1, P2, P3
```

---

## 🎯 DEFINITION OF DONE

For each issue:
- [ ] Code written and reviewed
- [ ] Unit tests (80%+ coverage for new code)
- [ ] Integration tests pass
- [ ] Linting passes (ESLint, Prettier)
- [ ] TypeScript strict checks pass
- [ ] Performance benchmarks acceptable
- [ ] Documentation updated
- [ ] Merged to main branch

---

## 🔍 QUALITY GATES

**Before merging:**
```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run type-check    # TypeScript
npm run test          # Unit tests
npm run test:e2e      # E2E tests
npm run build         # Next.js build
```

---

**Prepared**: 2026-05-10  
**Target Completion**: 2026-07-05 (optimized) or 2026-08-10 (full pace)  
**Estimated ROI**: 180 hours effort → 10-point improvement in code quality

