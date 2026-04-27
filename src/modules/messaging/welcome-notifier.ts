import { EventTypes, getEventBus, logger } from '@/lib';
import { sendLineMessage } from '@/lib/line/client';

const bus = getEventBus();

type RegistrationApprovedPayload = {
  tenantId: string;
  lineUserId: string;
  roomNo: string;
  tenantName: string;
  messageType: 'welcome';
};

async function handleRegistrationApproved(payload: RegistrationApprovedPayload) {
  const { lineUserId, roomNo, tenantName } = payload;

  if (!lineUserId) {
    logger.warn({ type: 'welcome_notification_skipped_no_line', tenantId: payload.tenantId });
    return;
  }

  const message =
    `สวัสดีค่ะ ${tenantName} 😊\n` +
    `\n` +
    `ยินดีต้อนรับเข้าสู่ Apartment!\n` +
    `\n` +
    `ห้องของคุณ: ${roomNo}\n` +
    `\n` +
    `หากมีข้อสงสัยหรือต้องการแจ้งปัญหา สามารถติดต่อมาที่แชทนี้ได้เลยค่ะ\n` +
    `\n` +
    `ทีมงาน Apartment ERP`;
  await sendLineMessage(lineUserId, message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
bus.subscribe(EventTypes.REGISTRATION_APPROVED, async (evt: any) => {
  try {
    await handleRegistrationApproved(evt.payload as RegistrationApprovedPayload);
  } catch (err) {
    logger.error({ type: 'welcome_notification_error', error: (err as Error).message });
  }
});
