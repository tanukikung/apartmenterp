import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runContractExpiryCheck } from '@/modules/jobs/job-runner';
import { prisma } from '@/lib';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    prisma: {
      contract: {
        findMany: vi.fn(),
      },
      adminUser: {
        findMany: vi.fn(),
      },
      notification: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
    sendLineMessage: vi.fn().mockResolvedValue({}),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  };
});

describe('runContractExpiryCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates notifications for contracts expiring within thresholds', async () => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const mockContracts = [
      {
        id: 'contract-1',
        roomNo: '101',
        status: 'ACTIVE',
        endDate: in30Days,
        primaryTenant: {
          id: 'tenant-1',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
          lineUserId: 'U123456',
        },
        room: { roomNo: '101' },
      },
      {
        id: 'contract-2',
        roomNo: '202',
        status: 'ACTIVE',
        endDate: in60Days,
        primaryTenant: {
          id: 'tenant-2',
          firstName: 'สมหญิง',
          lastName: 'รักเงิน',
          lineUserId: null,
        },
        room: { roomNo: '202' },
      },
    ];

    const mockAdmins = [
      { id: 'admin-1', displayName: 'Admin User', isActive: true },
    ];

    // Return contracts for all three threshold checks
    vi.mocked(prisma.contract.findMany)
      .mockResolvedValueOnce([mockContracts[0]] as any) // 30-day
      .mockResolvedValueOnce([mockContracts[1]] as any) // 60-day
      .mockResolvedValueOnce([] as any); // 90-day

    vi.mocked(prisma.adminUser.findMany).mockResolvedValue(mockAdmins as any);
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.notification.create).mockResolvedValue({
      id: 'notif-1',
      type: 'NOTICE',
      roomNo: '101',
      status: 'PENDING',
    } as any);

    const result = await runContractExpiryCheck();

    expect(result.count).toBe(2);
    expect(result.message).toContain('2 contract(s) notified');

    // Verify notifications were created
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate notifications within 24h', async () => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const mockContracts = [{
      id: 'contract-1',
      roomNo: '101',
      status: 'ACTIVE',
      endDate: in30Days,
      primaryTenant: {
        id: 'tenant-1',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        lineUserId: 'U123456',
      },
      room: { roomNo: '101' },
    }];

    const mockAdmins = [{ id: 'admin-1', displayName: 'Admin', isActive: true }];

    vi.mocked(prisma.contract.findMany).mockResolvedValueOnce([mockContracts[0]] as any);
    vi.mocked(prisma.contract.findMany).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.contract.findMany).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue(mockAdmins as any);

    // Existing notification found — should skip
    vi.mocked(prisma.notification.findFirst).mockResolvedValueOnce({ id: 'existing-notif' } as any);

    const result = await runContractExpiryCheck();

    expect(result.count).toBe(1);
    // Should NOT create a new notification since one already exists
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('handles contracts with no lineUserId gracefully', async () => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const mockContract = {
      id: 'contract-1',
      roomNo: '101',
      status: 'ACTIVE',
      endDate: in30Days,
      primaryTenant: {
        id: 'tenant-1',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        lineUserId: null, // No LINE
      },
      room: { roomNo: '101' },
    };

    vi.mocked(prisma.contract.findMany).mockResolvedValueOnce([mockContract] as any);
    vi.mocked(prisma.contract.findMany).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.contract.findMany).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([{ id: 'admin-1', isActive: true }] as any);
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: 'notif-1' } as any);

    const result = await runContractExpiryCheck();

    expect(result.count).toBe(1);
    // LINE send should not throw even with null lineUserId
    // The job catches errors and skips silently
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('returns zero when no contracts are expiring', async () => {
    vi.mocked(prisma.contract.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([] as any);

    const result = await runContractExpiryCheck();

    expect(result.count).toBe(0);
    expect(result.message).toBe('0 contract(s) notified for expiry');
  });
});