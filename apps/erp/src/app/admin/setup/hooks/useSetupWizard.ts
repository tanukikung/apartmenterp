'use client';

import { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type RoomNumberFormat = 'SIMPLE' | 'HOTEL' | 'CUSTOM_PREFIX' | 'MIXED';

export interface AdminData {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export interface BuildingData {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
}

export interface RoomsData {
  format: RoomNumberFormat;
  floors: number;
  roomsPerFloor: number;
  defaultRentAmount: number;
  prefix: string;
  mixedSpecialFloor: {
    floorNo: number;
    roomNumbers: string[];
  } | null;
}

export interface BillingData {
  billingDay: number;
  dueDay: number;
  reminderDays: number;
  lateFeePerDay: number;
}

export interface LineNotifyData {
  enabled: boolean;
  channelId: string;
  channelSecret: string;
  accessToken: string;
}

export interface EmailNotifyData {
  enabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
}

export interface SetupWizardState {
  currentStep: number;
  admin: AdminData;
  building: BuildingData;
  rooms: RoomsData;
  billing: BillingData;
  lineNotify: LineNotifyData;
  emailNotify: EmailNotifyData;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_ADMIN: AdminData = {
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
};

const DEFAULT_BUILDING: BuildingData = {
  name: '',
  address: '',
  phone: '',
  email: '',
  taxId: '',
};

const DEFAULT_ROOMS: RoomsData = {
  format: 'SIMPLE',
  floors: 8,
  roomsPerFloor: 10,
  defaultRentAmount: 10000,
  prefix: '',
  mixedSpecialFloor: null,
};

const DEFAULT_BILLING: BillingData = {
  billingDay: 1,
  dueDay: 5,
  reminderDays: 3,
  lateFeePerDay: 10,
};

const DEFAULT_LINE_NOTIFY: LineNotifyData = {
  enabled: false,
  channelId: '',
  channelSecret: '',
  accessToken: '',
};

const DEFAULT_EMAIL_NOTIFY: EmailNotifyData = {
  enabled: false,
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  fromEmail: '',
};

// ============================================================================
// Hook
// ============================================================================

export function useSetupWizard() {
  const [state, setState] = useState<SetupWizardState>({
    currentStep: 1,
    admin: DEFAULT_ADMIN,
    building: DEFAULT_BUILDING,
    rooms: DEFAULT_ROOMS,
    billing: DEFAULT_BILLING,
    lineNotify: DEFAULT_LINE_NOTIFY,
    emailNotify: DEFAULT_EMAIL_NOTIFY,
  });

  const updateAdmin = useCallback((data: Partial<AdminData>) => {
    setState((prev) => ({ ...prev, admin: { ...prev.admin, ...data } }));
  }, []);

  const updateBuilding = useCallback((data: Partial<BuildingData>) => {
    setState((prev) => ({ ...prev, building: { ...prev.building, ...data } }));
  }, []);

  const updateRooms = useCallback((data: Partial<RoomsData>) => {
    setState((prev) => ({ ...prev, rooms: { ...prev.rooms, ...data } }));
  }, []);

  const updateBilling = useCallback((data: Partial<BillingData>) => {
    setState((prev) => ({ ...prev, billing: { ...prev.billing, ...data } }));
  }, []);

  const updateLineNotify = useCallback((data: Partial<LineNotifyData>) => {
    setState((prev) => ({ ...prev, lineNotify: { ...prev.lineNotify, ...data } }));
  }, []);

  const updateEmailNotify = useCallback((data: Partial<EmailNotifyData>) => {
    setState((prev) => ({ ...prev, emailNotify: { ...prev.emailNotify, ...data } }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: Math.min(prev.currentStep + 1, 5) }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: Math.max(prev.currentStep - 1, 1) }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, currentStep: Math.max(1, Math.min(step, 5)) }));
  }, []);

  const reset = useCallback(() => {
    setState({
      currentStep: 1,
      admin: DEFAULT_ADMIN,
      building: DEFAULT_BUILDING,
      rooms: DEFAULT_ROOMS,
      billing: DEFAULT_BILLING,
      lineNotify: DEFAULT_LINE_NOTIFY,
      emailNotify: DEFAULT_EMAIL_NOTIFY,
    });
  }, []);

  return {
    state,
    updateAdmin,
    updateBuilding,
    updateRooms,
    updateBilling,
    updateLineNotify,
    updateEmailNotify,
    nextStep,
    prevStep,
    goToStep,
    reset,
  };
}
