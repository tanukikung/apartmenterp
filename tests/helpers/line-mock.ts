/**
 * Mock the LINE SDK to prevent real API calls in tests
 * Import this in setup-mocks.ts or individual test files as needed
 */

import { vi } from 'vitest';

export const lineClientMock = {
  replyMessage: vi.fn().mockResolvedValue({}),
  pushMessage: vi.fn().mockResolvedValue({}),
  getProfile: vi.fn().mockResolvedValue({
    displayName: 'Test User',
    userId: 'U123456',
    pictureUrl: null,
    statusMessage: null,
  }),
  getMessageContent: vi.fn().mockResolvedValue({}),
  leaveRoom: vi.fn().mockResolvedValue({}),
  leaveGroup: vi.fn().mockResolvedValue({}),
  getRoomMemberProfile: vi.fn().mockResolvedValue({
    displayName: 'Test User',
    userId: 'U123456',
    pictureUrl: null,
    statusMessage: null,
  }),
  getGroupMemberProfile: vi.fn().mockResolvedValue({
    displayName: 'Test User',
    userId: 'U123456',
    pictureUrl: null,
    statusMessage: null,
  }),
  getAllQueuedMessages: vi.fn().mockResolvedValue([]),
  cancelDefaultRichMenu: vi.fn().mockResolvedValue({}),
  CreateLIFF: vi.fn().mockResolvedValue({}),
  DeleteLIFF: vi.fn().mockResolvedValue({}),
  GetLIFF: vi.fn().mockResolvedValue({}),
  UpdateLIFF: vi.fn().mockResolvedValue({}),
  CreateRichMenu: vi.fn().mockResolvedValue({}),
  DeleteRichMenu: vi.fn().mockResolvedValue({}),
  GetRichMenu: vi.fn().mockResolvedValue({}),
  GetRichMenuAlias: vi.fn().mockResolvedValue({}),
  UpdateRichMenuAlias: vi.fn().mockResolvedValue({}),
  DeleteRichMenuAlias: vi.fn().mockResolvedValue({}),
  CreateRichMenuAlias: vi.fn().mockResolvedValue({}),
  LinkLIFF: vi.fn().mockResolvedValue({}),
  UnlinkLIFF: vi.fn().mockResolvedValue({}),
  IssueLinkToken: vi.fn().mockResolvedValue({}),
  GrantChannelAccessToken: vi.fn().mockResolvedValue({}),
  RevokeChannelAccessToken: vi.fn().mockResolvedValue({}),
};

export const lineSdkDefaultMock = {
  Client: vi.fn().mockImplementation(() => lineClientMock),
};

vi.mock('@line/bot-sdk', () => ({
  default: lineSdkDefaultMock,
}));
