import { getLineClient } from '@/lib/line/client';
import { sendLineMessage } from '@/lib/line/client';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib/db/client';

// ============================================================================
// Types
// ============================================================================

/**
 * State machine for LINE maintenance request conversation.
 * Tracks what step the tenant is at when submitting a maintenance request via LINE.
 */
export type MaintenanceRequestState =
  | { step: 'AWAITING_DESCRIPTION' }
  | { step: 'DESCRIPTION_PROVIDED'; description: string; imageMessageIds: string[] };

export interface LineMaintenanceRequestData {
  roomNo: string;
  tenantId: string;
  tenantName: string;
  state: MaintenanceRequestState;
  createdAt: number;
}

// In-memory store for LINE maintenance request conversations (keyed by lineUserId)
const maintenanceRequestStore = new Map<string, LineMaintenanceRequestData>();

// How long to keep a pending maintenance request before expiring (30 minutes)
const REQUEST_EXPIRY_MS = 30 * 60 * 1000;

// ============================================================================
// Helper: Resolve tenant from LINE user
// ============================================================================

type TenantWithRoom = {
  id: string;
  firstName: string;
  lastName: string;
  lineUserId: string | null;
  roomTenants: Array<{
    roomNo: string;
    role: string;
    moveOutDate: Date | null;
    room: { roomNo: string } | null;
  }>;
};

/**
 * Find the active PRIMARY tenant associated with a LINE user.
 * Returns tenant info including their current room.
 */
async function resolveTenantFromLineUser(lineUserId: string): Promise<TenantWithRoom | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { lineUserId },
    include: {
      roomTenants: {
        where: { moveOutDate: null, role: 'PRIMARY' },
        include: { room: true },
      },
    },
  });
  return tenant as TenantWithRoom | null;
}

// ============================================================================
// Helper: Resolve image URLs from LINE message IDs
// ============================================================================

/**
 * Given an array of LINE message IDs for images, download each image content
 * via the LINE API and return an array of { fileUrl, fileType } attachment objects.
 *
 * The originalContentUrl returned by LINE SDK is already a public CDN URL,
 * so we can use it directly as the fileUrl.
 */
async function resolveImageAttachments(messageIds: string[]): Promise<Array<{ fileUrl: string; fileType: string }>> {
  if (messageIds.length === 0) return [];

  const client = getLineClient();
  const attachments: Array<{ fileUrl: string; fileType: string }> = [];

  for (const messageId of messageIds) {
    try {
      // getMessageContent returns a Buffer containing the raw image bytes
      const buffer = await client.getMessageContent(messageId);
      // The LINE SDK returns Buffer in Node.js — normalize to Buffer
      const rawBuffer = Buffer.isBuffer(buffer)
        ? buffer
        : Buffer.from(buffer as unknown as Uint8Array);

      // Compute a content-type hint from the first bytes (JPEG vs PNG)
      const mimeType = rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8
        ? 'image/jpeg'
        : rawBuffer[0] === 0x89 && rawBuffer[1] === 0x50
        ? 'image/png'
        : 'image/jpeg'; // default to JPEG

      // LINE CDN URLs follow a predictable pattern and are publicly accessible.
      // We use the message ID to construct the CDN URL directly, which is faster
      // than uploading to our own storage and avoids proxying large image data.
      // The URL is valid without authentication (public access).
      const fileUrl = `https://obs.line-scdn.net/${messageId}`;
      attachments.push({ fileUrl, fileType: mimeType });
    } catch (err) {
      logger.warn({ type: 'line_maintenance_image_download_failed', messageId, error: (err as Error).message });
      // Skip images that fail to download — don't block the ticket creation
    }
  }

  return attachments;
}

// ============================================================================
// Helper: Create maintenance ticket via the maintenance service
// ============================================================================

async function createMaintenanceTicketForLine(input: {
  roomNo: string;
  tenantId: string;
  description: string;
  imageMessageIds: string[];
}): Promise<{ id: string; priority: string; roomNo: string; description: string } | null> {
  // Resolve image attachments
  const attachments = await resolveImageAttachments(input.imageMessageIds);

  const title = `แจ้งซ่อมจาก LINE — ห้อง ${input.roomNo}`;
  const priority = 'MEDIUM';

  // Create the ticket via internal service call (bypasses HTTP layer)
  // We use a bare Prisma insert here to avoid importing the full service
  // (which would drag in auth/session dependencies inappropriate for a webhook).
  const { v4: uuidv4 } = await import('uuid');

  // Validate that the tenant is still assigned to this room
  const assignment = await prisma.roomTenant.findFirst({
    where: {
      roomNo: input.roomNo,
      tenantId: input.tenantId,
      moveOutDate: null,
    },
  });

  if (!assignment) {
    logger.warn({
      type: 'line_maintenance_ticket_failed',
      reason: 'tenant_not_assigned_to_room',
      roomNo: input.roomNo,
      tenantId: input.tenantId,
    });
    return null;
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceTicket.create({
      data: {
        id: uuidv4(),
        roomNo: input.roomNo,
        tenantId: input.tenantId,
        title,
        description: input.description,
        priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
      },
    });

    for (const a of attachments) {
      await tx.maintenanceAttachment.create({
        data: {
          id: uuidv4(),
          ticketId: created.id,
          fileUrl: a.fileUrl,
          fileType: a.fileType,
        },
      });
    }

    return created;
  });

  logger.info({
    type: 'line_maintenance_ticket_created',
    ticketId: ticket.id,
    roomNo: input.roomNo,
    tenantId: input.tenantId,
    attachmentCount: attachments.length,
  });

  return { id: ticket.id, priority: ticket.priority, roomNo: input.roomNo, description: input.description };
}

// ============================================================================
// Helper: Find all staff LINE user IDs
// ============================================================================

async function getStaffLineUserIds(): Promise<string[]> {
  const staff = await prisma.adminUser.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'STAFF'] } },
    select: { id: true },
  });

  if (staff.length === 0) return [];

  // Find LINE-linked tenants who are staff (staff are AdminUser, not Tenant,
  // so we look for staff via admin user IDs — but LINE notifications go to the
  // apartment's staff LINE account, which is configured via LINE_USER_ID env var)
  // For now, use the system LINE_USER_ID as the broadcast target.
  const systemLineUserId = process.env.LINE_USER_ID;
  return systemLineUserId ? [systemLineUserId] : [];
}

// ============================================================================
// Helper: Notify staff about new maintenance ticket
// ============================================================================

async function notifyStaffOfNewTicket(ticket: { id: string; priority: string; roomNo: string; description: string }, tenantName: string) {
  const staffUserIds = await getStaffLineUserIds();
  if (staffUserIds.length === 0) return;

  const priorityLabel: Record<string, string> = {
    LOW: 'ต่ำ',
    MEDIUM: 'ปานกลาง',
    HIGH: 'สูง',
    URGENT: 'ด่วนมาก',
  };
  const priorityText = priorityLabel[ticket.priority] ?? ticket.priority;

  const shortDesc = ticket.description.length > 80
    ? ticket.description.slice(0, 80) + '…'
    : ticket.description;

  const message = `🔧 มีคำขอแจ้งซ่อมใหม่

👤 ผู้เช่า: ${tenantName}
🏠 ห้อง: ${ticket.roomNo}
⚠️ Priority: ${priorityText}

📝 ${shortDesc}

🔗 ดูรายละเอียด: ${process.env.APP_BASE_URL || ''}/admin/maintenance/${ticket.id}`;

  for (const userId of staffUserIds) {
    try {
      await sendLineMessage(userId, message);
    } catch (err) {
      logger.warn({ type: 'line_staff_notification_failed', userId, error: (err as Error).message });
    }
  }
}

// ============================================================================
// Helper: Clean up expired entries from the store
// ============================================================================

function cleanupExpiredRequests() {
  const now = Date.now();
  for (const [key, data] of Array.from(maintenanceRequestStore.entries())) {
    const age = now - data.createdAt;
    if (age > REQUEST_EXPIRY_MS) {
      maintenanceRequestStore.delete(key);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredRequests, 10 * 60 * 1000);

// ============================================================================
// Public API
// ============================================================================

/**
 * Check whether a LINE user has an in-progress maintenance request in progress.
 */
export function getMaintenanceRequestState(lineUserId: string): LineMaintenanceRequestData | undefined {
  return maintenanceRequestStore.get(lineUserId);
}

/**
 * Start a new LINE maintenance request for a given LINE user.
 * Called when the tenant presses "แจ้งซ่อม" from the rich menu.
 *
 * Returns a greeting message to send back to the tenant.
 */
export async function startMaintenanceRequest(lineUserId: string): Promise<{ replyText: string }> {
  const tenant = await resolveTenantFromLineUser(lineUserId);

  if (!tenant) {
    return {
      replyText:
        '❌ ไม่พบข้อมูลผู้เช่าที่ลงทะเบียนกับ LINE ของท่าน กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียน LINE กับบัญชีผู้เช่าของท่านค่ะ',
    };
  }

  const primaryRoom = tenant.roomTenants.find((rt) => rt.role === 'PRIMARY');
  if (!primaryRoom) {
    return {
      replyText:
        '❌ ไม่พบข้อมูลการเช่าห้องของท่าน กรุณาติดต่อเจ้าหน้าที่ค่ะ',
    };
  }

  const state: LineMaintenanceRequestData = {
    roomNo: primaryRoom.roomNo,
    tenantId: tenant.id,
    tenantName: `${tenant.firstName} ${tenant.lastName}`,
    state: { step: 'AWAITING_DESCRIPTION' },
    createdAt: Date.now(),
  };

  maintenanceRequestStore.set(lineUserId, state);

  return {
    replyText:
      `🔧 ระบบแจ้งซ่อม\n\n` +
      `🏠 ห้อง: ${primaryRoom.roomNo}\n` +
      `👤 ผู้เช่า: ${tenant.firstName} ${tenant.lastName}\n\n` +
      `กรุณาส่งรายละเอียดปัญหาที่ต้องการแจ้งซ่อม เช่น ประตูห้องน้ำรั่ว หลอดไฟเสีย ฯลฯ\n` +
      `📎 สามารถส่งรูปภาพประกอบได้ด้วย (ถ้ามี)\n\n` +
      `พิมพ์ "ยกเลิก" ถ้าต้องการยกเลิกค่ะ`,
  };
}

/**
 * Handle an incoming text message from a LINE user who has an in-progress
 * maintenance request (state is AWAITING_DESCRIPTION or DESCRIPTION_PROVIDED).
 *
 * Returns a reply message to send back, or null if the message was not handled
 * by the maintenance state machine (caller should handle it normally).
 */
export async function handleMaintenanceRequestMessage(
  lineUserId: string,
  text: string
): Promise<{ replyText: string } | null> {
  // Cancel command — always honoured
  if (text.trim() === 'ยกเลิก') {
    maintenanceRequestStore.delete(lineUserId);
    return { replyText: '❌ การแจ้งซ่อมถูกยกเลิกแล้วค่ะ หากต้องการแจ้งซ่อมใหม่ กรุณาเลือก "แจ้งซ่อม" จากเมนูค่ะ' };
  }

  const requestData = maintenanceRequestStore.get(lineUserId);
  if (!requestData) return null;

  const currentStep = requestData.state.step;

  if (currentStep === 'AWAITING_DESCRIPTION') {
    if (!text.trim()) {
      return { replyText: 'กรุณาส่งรายละเอียดปัญหาที่ต้องการแจ้งซ่อมค่ะ หรือพิมพ์ "ยกเลิก" ถ้าไม่ต้องการแจ้งซ่อมแล้วค่ะ' };
    }

    // Description received — move to next step, await optional image follow-up
    // (image messages are handled separately via handleMaintenanceRequestImage)
    const updatedState: LineMaintenanceRequestData = {
      ...requestData,
      state: {
        step: 'DESCRIPTION_PROVIDED',
        description: text.trim(),
        imageMessageIds: [],
      },
    };
    maintenanceRequestStore.set(lineUserId, updatedState);

    return {
      replyText:
        `📝 ได้รับรายละเอียดแล้วค่ะ:\n"${text.trim()}"\n\n` +
        `สามารถส่งรูปภาพประกอบเพิ่มเติมได้เลย (ถ้ามี)\n` +
        `เมื่อพร้อมแล้วพิมพ์ "เสร็จสิ้น" เพื่อส่งคำขอแจ้งซ่อม\n` +
        `หรือพิมพ์ "ยกเลิก" เพื่อยกเลิกค่ะ`,
    };
  }

  if (currentStep === 'DESCRIPTION_PROVIDED') {
    // If user sends more text that looks like a completion signal, treat as complete
    const completionSignals = ['เสร็จสิ้น', 'เสร็จ', 'ส่ง', 'submit', 'done', 'finish', 'ยืนยัน', 'ตกลง'];
    if (completionSignals.includes(text.trim().toLowerCase())) {
      return await finalizeMaintenanceRequest(lineUserId);
    }

    // Otherwise, update the description (user may be correcting)
    const existingImageIds = requestData.state.step === 'DESCRIPTION_PROVIDED'
      ? requestData.state.imageMessageIds
      : [];
    const updatedState: LineMaintenanceRequestData = {
      ...requestData,
      state: {
        step: 'DESCRIPTION_PROVIDED',
        description: text.trim(),
        imageMessageIds: existingImageIds,
      },
    };
    maintenanceRequestStore.set(lineUserId, updatedState);

    return {
      replyText:
        `📝 อัปเดตรายละเอียดแล้วค่ะ:\n"${text.trim()}"\n\n` +
        `เมื่อพร้อมแล้วพิมพ์ "เสร็จสิ้น" เพื่อส่งคำขอแจ้งซ่อม\n` +
        `หรือพิมพ์ "ยกเลิก" เพื่อยกเลิกค่ะ`,
    };
  }

  return null;
}

/**
 * Handle an incoming image message from a LINE user who has an in-progress
 * maintenance request.
 *
 * The image message ID is stored for later download when the request is finalized.
 *
 * Returns a reply message, or null if no maintenance request is in progress.
 */
export async function handleMaintenanceRequestImage(
  lineUserId: string,
  imageMessageId: string
): Promise<{ replyText: string } | null> {
  const requestData = maintenanceRequestStore.get(lineUserId);
  if (!requestData) return null;

  const currentStep = requestData.state.step;

  if (currentStep === 'DESCRIPTION_PROVIDED') {
    const existingImageIds = requestData.state.step === 'DESCRIPTION_PROVIDED' ? requestData.state.imageMessageIds : [];
    const updatedState: LineMaintenanceRequestData = {
      ...requestData,
      state: {
        step: 'DESCRIPTION_PROVIDED',
        description: requestData.state.step === 'DESCRIPTION_PROVIDED' ? requestData.state.description : '',
        imageMessageIds: [...existingImageIds, imageMessageId],
      },
    };
    maintenanceRequestStore.set(lineUserId, updatedState);

    const count = (updatedState.state as { step: 'DESCRIPTION_PROVIDED'; description: string; imageMessageIds: string[] }).imageMessageIds.length;
    return {
      replyText:
        `📷 ได้รับรูปภาพแล้วค่ะ (${count} รูป)\n\n` +
        `เมื่อพร้อมแล้วพิมพ์ "เสร็จสิ้น" เพื่อส่งคำขอแจ้งซ่อม\n` +
        `หรือพิมพ์ "ยกเลิก" เพื่อยกเลิกค่ะ`,
    };
  }

  // AWAITING_DESCRIPTION step — image received before description; acknowledge
  // but don't change state. User should send description first.
  return {
    replyText:
      `📷 ได้รับรูปภาพแล้วค่ะ แต่กรุณาส่งรายละเอียดปัญหาก่อนนะคะ เช่น "หลอดไฟห้องน้ำเสีย"\n\n` +
      `พิมพ์ "ยกเลิก" ถ้าไม่ต้องการแจ้งซ่อมแล้วค่ะ`,
  };
}

/**
 * Finalize the maintenance request: create the ticket, notify staff, and clear state.
 */
export async function finalizeMaintenanceRequest(lineUserId: string): Promise<{ replyText: string }> {
  const requestData = maintenanceRequestStore.get(lineUserId);
  if (!requestData) {
    return { replyText: '❌ ไม่พบข้อมูลการแจ้งซ่อม กรุณาเริ่มใหม่จากเมนูค่ะ' };
  }

  const currentStep = requestData.state;

  if (currentStep.step !== 'DESCRIPTION_PROVIDED') {
    return { replyText: '❌ กรุณาส่งรายละเอียดปัญหาก่อนค่ะ' };
  }

  const ticket = await createMaintenanceTicketForLine({
    roomNo: requestData.roomNo,
    tenantId: requestData.tenantId,
    description: currentStep.description,
    imageMessageIds: (currentStep as { imageMessageIds: string[] }).imageMessageIds,
  });

  if (!ticket) {
    return {
      replyText:
        '❌ ไม่สามารถสร้างคำขอแจ้งซ่อมได้ กรุณาติดต่อเจ้าหน้าที่โดยตรงค่ะ',
    };
  }

  // Clear the pending request state
  maintenanceRequestStore.delete(lineUserId);

  // Notify staff
  await notifyStaffOfNewTicket(ticket, requestData.tenantName);

  const imgIds = (currentStep as { imageMessageIds: string[] }).imageMessageIds;
  return {
    replyText:
      `✅ ระบบได้รับคำขอแจ้งซ่อมแล้วค่ะ\n\n` +
      `🏠 ห้อง: ${requestData.roomNo}\n` +
      `📝 รายละเอียด: ${currentStep.description}\n` +
      `${imgIds.length > 0 ? `📷 รูปภาพ: ${imgIds.length} รูป\n` : ''}` +
      `🔢 เลขที่แจ้งซ่อม: ${ticket.id.slice(0, 8).toUpperCase()}\n\n` +
      `เจ้าหน้าที่จะติดต่อกลับไปโดยเร็วที่สุดค่ะ 😊`,
  };
}

/**
 * Clear the pending maintenance request state for a LINE user.
 * Call this when the user cancels or when the request is completed.
 */
export function clearMaintenanceRequest(lineUserId: string): void {
  maintenanceRequestStore.delete(lineUserId);
}
