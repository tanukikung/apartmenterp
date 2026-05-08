/**
 * Integration test: Monthly Data Import with Tiered Billing Rules
 *
 * Verifies that monthly data import correctly computes STEP tiered pricing
 * via the billing-calculator (the same calculator used by billing-engine).
 */

import { test, expect, describe } from 'vitest';
import { vi } from 'vitest';

// Mock prisma before imports
vi.mock('@/lib/db/client', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

// We'll use the billing-calculator directly since the integration test
// would need full DB setup. This test verifies the integration between
// monthly-data-import service and billing-calculator.

describe('Monthly Data Import — STEP Tiered Billing Integration', () => {
  // This test validates the data flow that monthly-data-import uses:
  // MonthlyDataRow → buildBillingRuleData + buildCalcRow → computeRoomBilling

  describe('tiered pricing edge cases (verified via billing-calculator directly)', () => {
    test('tier2Capacity = s2Upto - s1Upto (not s2Upto absolute)', async () => {
      // Import { computeRoomBilling } from billing-calculator
      const { computeRoomBilling } = await import('@/modules/billing/billing-calculator');

      // Scenario: s1Upto=100, s2Upto=105 (tier-2 capacity = 5 units only)
      // Usage = 150 units → 50 units overflow into tier-3
      const row = {
        rentAmount: 10000,
        waterMode: 'STEP' as const,
        waterPrev: 0,
        waterCurr: 150,
        waterUnitsManual: null,
        waterServiceFeeManual: null,
        electricMode: 'DISABLED' as const,
        electricPrev: null,
        electricCurr: null,
        electricUnitsManual: null,
        electricServiceFeeManual: null,
        furnitureFee: 0,
        otherFee: 0,
      };

      const rule = {
        waterEnabled: true,
        waterUnitPrice: 10,
        waterMinCharge: 0,
        waterServiceFeeMode: 'NONE' as const,
        waterServiceFeeAmount: 0,
        waterS1Upto: 100,
        waterS1Rate: 8,    // 0-100 @ 8 = 800
        waterS2Upto: 105, // tier-2 capacity = 5 units (105-100)
        waterS2Rate: 12,  // 5 units @ 12 = 60
        waterS3Rate: 20,   // remaining 45 units @ 20 = 900
        electricEnabled: false,
        electricUnitPrice: 0,
        electricMinCharge: 0,
        electricServiceFeeMode: 'NONE' as const,
        electricServiceFeeAmount: 0,
        electricS1Upto: null,
        electricS1Rate: null,
        electricS2Upto: null,
        electricS2Rate: null,
        electricS3Rate: null,
      };

      const result = computeRoomBilling(row, rule);

      // Bug case: old code would use s2Upto=105 as tier2Units directly
      // giving 50 * 12 = 600 instead of correct 5 * 12 = 60
      expect(result.waterUnits).toBe(150);
      expect(result.waterUsageCharge).toBe(1760); // 800 + 60 + 900
      expect(result.totalDue).toBe(10000 + 1760); // rent + water
    });

    test('monthly data import with tiered rule produces correct waterTotal', async () => {
      const { computeRoomBilling } = await import('@/modules/billing/billing-calculator');

      // Monthly data row simulation: room 101, usage = 200 kwh
      const row = {
        rentAmount: 8000,
        waterMode: 'DISABLED' as const,
        waterPrev: null,
        waterCurr: null,
        waterUnitsManual: null,
        waterServiceFeeManual: null,
        electricMode: 'STEP' as const,
        electricPrev: 0,
        electricCurr: 200,
        electricUnitsManual: null,
        electricServiceFeeManual: null,
        furnitureFee: 0,
        otherFee: 0,
      };

      // Tiered electric rule: 0-150 @ 3.5, 150-300 @ 4.5, 300+ @ 6.0
      const rule = {
        waterEnabled: false,
        waterUnitPrice: 0,
        waterMinCharge: 0,
        waterServiceFeeMode: 'NONE' as const,
        waterServiceFeeAmount: 0,
        waterS1Upto: null,
        waterS1Rate: null,
        waterS2Upto: null,
        waterS2Rate: null,
        waterS3Rate: null,
        electricEnabled: true,
        electricUnitPrice: 10, // fallback, not used in STEP mode
        electricMinCharge: 0,
        electricServiceFeeMode: 'NONE' as const,
        electricServiceFeeAmount: 0,
        electricS1Upto: 150,
        electricS1Rate: 3.5,   // 0-150 @ 3.5 = 525
        electricS2Upto: 300,
        electricS2Rate: 4.5,   // 50 units @ 4.5 = 225
        electricS3Rate: 6.0,  // 0 units above 300 = 0
      };

      const result = computeRoomBilling(row, rule);

      // Tier1: 150×3.5=525, Tier2: 50×4.5=225, Tier3: 0 → 750
      expect(result.electricUsageCharge).toBe(750);
      expect(result.electricTotal).toBe(750);
      expect(result.totalDue).toBe(8000 + 750); // rent + electric
    });
  });
});
