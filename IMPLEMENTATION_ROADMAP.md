# 🛣️ Implementation Roadmap - From 7.3 → 9.5/10

## Sprint 1: Error Handling (Week 1-2)
**Goal**: +1.0 points → 8.3/10  
**Effort**: 12 hours

### 1.1 Add Error Boundaries (3h)
```typescript
// src/components/error-boundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

export class ErrorBoundary extends Component<Props, { hasError: boolean; error: null | Error }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught:', error, errorInfo);
    // Send to monitoring service
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback?.(this.state.error!) || (
          <div className="flex flex-col items-center justify-center min-h-[200px]">
            <h2 className="text-lg font-semibold text-red-600">เกิดข้อผิดพลาด</h2>
            <p className="text-sm text-gray-600">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-2 px-4 py-2 bg-primary text-white rounded"
            >
              ลองใหม่
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

**Apply to**: 10 critical pages (dashboard, invoices, payments, rooms, tenants, billing, contracts, documents, chat, settings)

### 1.2 Show API Errors (2h)
```typescript
// src/hooks/useApiError.ts
export function useApiError() {
  const toast = useToast();

  const handleError = (error: Error | AppError) => {
    const message = error instanceof AppError 
      ? error.message 
      : error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
    
    toast.error(message, { duration: 5000 });
    console.error('[API Error]', error);
  };

  return { handleError };
}
```

Update all fetch calls:
```typescript
// Before
const safe = async (url: string) => {
  try {
    const r = await fetch(url);
    return r.ok ? r.json() : null;
  } catch { return null; }
};

// After
const { handleError } = useApiError();
try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
} catch (error) {
  handleError(error as Error);
  return null;
}
```

### 1.3 Add Loading States (2h)
Ensure all async operations show loading indicator:
```typescript
if (loading) {
  return <SkeletonCard className="h-32" />;
}
```

### 1.4 Create Error Details Component (2h)
```typescript
// src/components/error-details.tsx
export function ErrorDetails({ error, retry }: { error?: string; retry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 text-red-600" size={20} />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900">เกิดข้อผิดพลาด</h3>
          {error && <p className="text-sm text-red-800 mt-1">{error}</p>}
          {retry && (
            <button onClick={retry} className="mt-2 text-sm text-red-600 hover:underline">
              ลองใหม่
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 1.5 Testing
```bash
npm test -- error-boundary.test.tsx
npm test -- useApiError.test.ts
```

---

## Sprint 2: API Consistency (Week 2-3)
**Goal**: +0.8 points → 9.1/10  
**Effort**: 10 hours

### 2.1 Create Standard Response Type (1h)
```typescript
// src/lib/api-response.ts
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

export const formatSuccess = <T,>(data: T, message?: string, meta?: any): ApiResponse<T> => ({
  success: true,
  data,
  message,
  meta,
});

export const formatError = (code: string, message: string, statusCode: number = 400, details?: any): ApiResponse => ({
  success: false,
  error: { code, message, statusCode, details },
});
```

### 2.2 Update All Routes (6h)
Replace in every route:
```typescript
// Before
return NextResponse.json({
  success: true,
  data: { data: payments, total, page, pageSize }
});

// After
return NextResponse.json(
  formatSuccess(payments, undefined, { page, pageSize, total })
);
```

Create script to help:
```bash
# find-api-response-patterns.sh
grep -r "NextResponse.json({" src/app/api/ | wc -l
# Apply sed replacements to standardize
```

### 2.3 Update API Error Handlers (2h)
```typescript
// src/lib/utils/errors.ts
export const asyncHandler = (fn: Function) => async (req: NextRequest) => {
  try {
    return await fn(req);
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(
      error instanceof Error ? error.message : 'Unknown error',
      'INTERNAL_ERROR',
      500
    );
    return NextResponse.json(
      formatError(appError.code, appError.message, appError.statusCode),
      { status: appError.statusCode }
    );
  }
};
```

### 2.4 Update Frontend Response Handling (1h)
```typescript
// src/hooks/useFetch.ts
const handleResponse = async (response: Response) => {
  const json = await response.json();
  
  if (!json.success) {
    throw new AppError(
      json.error?.message || 'Unknown error',
      json.error?.code || 'UNKNOWN',
      json.error?.statusCode || 500
    );
  }
  
  return json.data;
};
```

---

## Sprint 3: Color System (Week 3-4)
**Goal**: +0.5 points → 9.6/10  
**Effort**: 8 hours

### 3.1 Create Theme Provider (2h)
```typescript
// src/lib/theme-colors.ts
export const THEME_COLORS = {
  accent: {
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
    // ... more colors
  }
};

export function getAccentColorClasses(accent: 'green' | 'red' | 'yellow' | 'blue') {
  return THEME_COLORS.accent[accent];
}
```

### 3.2 Create Color Component Wrappers (3h)
```typescript
// src/components/ui/themed-card.tsx
export function ThemedCard({
  accent = 'blue',
  children
}: {
  accent?: 'green' | 'red' | 'yellow' | 'blue';
  children: ReactNode;
}) {
  const colors = getAccentColorClasses(accent);
  return (
    <div className={`rounded-xl border ${colors.light} ${colors.darkText}`}>
      {children}
    </div>
  );
}
```

### 3.3 Update Tailwind Config (1h)
```typescript
// tailwind.config.ts
module.exports = {
  theme: {
    colors: {
      // Use CSS variables for theme colors
      'on-surface': 'hsl(var(--on-surface))',
      'color-surface': 'hsl(var(--color-surface))',
      'color-border': 'hsl(var(--color-border))',
      // Add semantic colors
      'accent-green': {
        light: 'hsl(150 28% 92%)',
        dark: 'hsl(150 30% 18%)',
      },
      // ... more
    }
  }
};
```

### 3.4 Refactor Components (2h)
Replace hardcoded colors with:
```typescript
// Before
<div className="bg-[hsl(150,28%,92%)] text-[hsl(150,36%,32%)]">

// After
<ThemedCard accent="green">
  {/* content */}
</ThemedCard>
```

---

## Sprint 4: State Management (Week 4-5)
**Goal**: +0.3 points → 9.9/10  
**Effort**: 8 hours

### 4.1 Create Custom Hooks (5h)

**useFormState Hook:**
```typescript
// src/hooks/useFormState.ts
export function useFormState<T extends Record<string, any>>(
  initialValues: T,
  onSubmit: (values: T) => Promise<void>
) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      // Handle error
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    setValues,
    setErrors
  };
}
```

**useTableState Hook:**
```typescript
export function useTableState<T>() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useUrlState('q', '');

  const params = {
    page, pageSize, sortBy, sortOrder, q: search
  };

  return {
    page, setPage,
    pageSize, setPageSize,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    search, setSearch,
    params,
    reset: () => {
      setPage(1);
      setSearch('');
    }
  };
}
```

### 4.2 Refactor Pages (3h)
Replace:
```typescript
// Before (rooms/page.tsx - 11 states)
const [accounts, setAccounts] = useState([]);
const [rules, setRules] = useState([]);
const [floors, setFloors] = useState([]);
const [search, setSearch] = useUrlState('q', '');
const [statusFilter, setStatusFilter] = useState('');
// ... 6 more states

// After
const tableState = useTableState();
const formState = useFormState(initialRoom, handleCreateRoom);
```

---

## Sprint 5: Documentation (Week 5-6)
**Goal**: +0.2 points → 10/10  
**Effort**: 10 hours

### 5.1 Setup Swagger (4h)
```typescript
// src/lib/swagger.ts
import { createSwaggerSpec } from 'next-swagger-doc';

export const swaggerSpec = createSwaggerSpec({
  apiFolder: 'src/app/api',
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Apartment ERP API',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
  },
});
```

Create `/api/swagger.json` endpoint.

### 5.2 Document All Endpoints (4h)
```typescript
/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: List invoices
 *     parameters:
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *       - name: status
 *         in: query
 *         schema: { enum: ['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE'] }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
```

### 5.3 Create README (2h)
- API overview
- Authentication
- Error handling
- Example requests/responses

---

## Testing Roadmap (Parallel)
**Timeline**: Sprint 1-5  
**Goal**: From 3% → 50% coverage

### Phase 1: Unit Tests (Sprint 1-2)
```bash
npm run test -- --coverage
# Target: 30% coverage
```

```typescript
// tests/hooks/useFormState.test.ts
describe('useFormState', () => {
  it('should handle field changes', () => {
    const { result } = renderHook(() => useFormState({ name: '' }, async () => {}));
    act(() => result.current.handleChange('name', 'test'));
    expect(result.current.values.name).toBe('test');
  });
});
```

### Phase 2: Component Tests (Sprint 2-3)
```typescript
// tests/components/KpiCard.test.tsx
describe('KpiCard', () => {
  it('should render with correct value', () => {
    render(<KpiCard label="ห้องว่าง" value={5} icon={Home} accent="green" />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
```

### Phase 3: E2E Tests (Sprint 4-5)
```bash
npm run e2e
```

---

## Metric Tracking

### Weekly Metrics
```markdown
| Week | Coverage | Error Rate | Performance | Score |
|------|----------|-----------|-------------|-------|
| W1   | 5%       | 8%        | 2.5s        | 7.3   |
| W2   | 15%      | 2%        | 2.4s        | 8.3   |
| W3   | 25%      | 1.5%      | 2.2s        | 9.1   |
| W4   | 35%      | 1%        | 2.0s        | 9.6   |
| W5   | 45%      | 0.5%      | 1.9s        | 9.9   |
| W6   | 50%      | 0.3%      | 1.8s        | 10.0  |
```

### Success Criteria
- ✅ Error rate < 0.5%
- ✅ Page load < 2.0s
- ✅ Code coverage > 50%
- ✅ All P0 bugs fixed
- ✅ API documentation complete

---

## Resource Allocation

**Team Composition** (6-person team):
- Frontend Lead: 2 people (Sprints 1, 3, 4)
- Backend Lead: 2 people (Sprint 2, infrastructure)
- QA: 1 person (testing, metrics)
- DevOps: 1 person (monitoring, CI/CD)

**Time Breakdown**:
- Planning & Design: 3h
- Implementation: 35h
- Testing: 12h
- Deployment & monitoring: 5h
- **Total: 55 hours** (1.5 weeks for 2-person team)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Breaking changes in API | High | High | Feature flag for old format, gradual rollout |
| Unforeseen errors | Medium | Medium | Add comprehensive error logging first |
| Performance regression | Low | High | Load test after changes |
| Developer resistance to changes | Medium | Low | Training session on new patterns |

---

## Success Metrics

After completing roadmap:
- Score: 7.3 → 10.0 ✅
- Error rate: 8% → 0.3% ✅
- Code coverage: 3% → 50% ✅
- Page load: 2.5s → 1.8s ✅
- Developer satisfaction: 4/10 → 8/10 ✅
- Onboarding time: 2 weeks → 3 days ✅

---

## Post-Roadmap Maintenance

After reaching 10.0/10:
- Monthly code quality audits
- Quarterly refactoring sessions
- Continuous monitoring of metrics
- Regular security audits
- Performance benchmarking

---

**Estimated Timeline**: 6 weeks for full team, 3-4 weeks if focused
**Start Date**: Week of 2026-05-17  
**Target Completion**: 2026-06-28

