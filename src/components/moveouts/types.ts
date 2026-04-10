// Shared types for move-outs components

export type MoveOutStatus =
  | 'PENDING'
  | 'INSPECTION_DONE'
  | 'DEPOSIT_CALCULATED'
  | 'CONFIRMED'
  | 'REFUNDED'
  | 'CANCELLED';

export interface MoveOutItemRecord {
  id: string;
  moveOutId: string;
  category: string;
  item: string;
  condition: 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
  cost: number;
  notes: string | null;
}

export interface MoveOutRecord {
  id: string;
  contractId: string;
  moveOutDate: string;
  depositAmount: number;
  totalDeduction: number;
  finalRefund: number;
  status: MoveOutStatus;
  notes: string | null;
  lineNoticeSentAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  refundAt: string | null;
  refundBy: string | null;
  createdAt: string;
  updatedAt: string;
  contract?: {
    id: string;
    roomNo: string;
    monthlyRent: number;
    deposit: number | null;
    status: string;
    primaryTenant?: {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      phone: string;
      lineUserId: string | null;
    };
  };
  items: MoveOutItemRecord[];
}

export interface MoveOutListResponse {
  data: MoveOutRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ContractOption {
  id: string;
  roomNo: string;
  tenantName: string;
  deposit: number;
  status: string;
}

export type PanelMode = 'none' | 'new' | 'detail';

export const EMPTY_NEW_FORM = {
  contractId: '',
  moveOutDate: '',
  notes: '',
};

export const EMPTY_DEDUCTION_FORM = {
  cleaningFee: '0',
  damageRepairCost: '0',
  otherDeductions: '0',
};
