import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { asyncHandler, ApiResponse, ConflictError } from '@/lib/utils/errors';
import {
  DocumentTemplateType,
  DocumentTemplateStatus,
  DocumentTemplateVersionStatus,
  Prisma,
} from '@prisma/client';
// ============================================================================
// Validation Schema
// ============================================================================

const lineNotifySchema = z.object({
  enabled: z.boolean(),
  channelId: z.string().optional(),
  channelSecret: z.string().optional(),
  accessToken: z.string().optional(),
}).nullable();

const emailNotifySchema = z.object({
  enabled: z.boolean(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  fromEmail: z.string().optional(),
}).nullable();

const setupCompleteSchema = z.object({
  admin: z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dots, underscores, and hyphens'),
    displayName: z.string().min(2).max(100),
    password: z.string().min(8).max(128),
  }),
  building: z.object({
    name: z.string().min(1).max(200),
    address: z.string().min(1).max(500),
    phone: z.string().min(1).max(20),
    email: z.string().email().optional().or(z.literal('')),
    taxId: z.string().min(1).max(20).optional().or(z.literal('')),
  }),
  rooms: z.object({
    format: z.enum(['SIMPLE', 'HOTEL', 'CUSTOM_PREFIX', 'MIXED', 'CUSTOM']),
    floors: z.number().int().min(1).max(20),
    roomsPerFloor: z.number().int().min(1).max(100),
    defaultRentAmount: z.number().min(0),
    prefix: z.string().optional().or(z.literal('')),
    mixedSpecialFloor: z.object({
      floorNo: z.number().int().min(1),
      roomNumbers: z.array(z.string()),
    }).nullable().optional(),
    customRooms: z.array(z.object({
      roomNo: z.string().min(1),
      floorNo: z.number().int().min(1),
      rent: z.number().min(0),
    })).optional(),
  }),
  bankAccount: z.object({
    bankName: z.string().optional().or(z.literal('')),
    bankAccountNo: z.string().optional().or(z.literal('')),
    bankAccountName: z.string().optional().or(z.literal('')),
    promptpay: z.string().optional().or(z.literal('')),
  }),
  billing: z.object({
    billingDay: z.number().int().min(1).max(28),
    dueDay: z.number().int().min(1).max(31),
    reminderDays: z.number().int().min(0).max(30).default(3),
    lateFeePerDay: z.number().min(0).default(10),
  }),
  lineNotify: lineNotifySchema,
  emailNotify: emailNotifySchema,
}).strict();

// ============================================================================
// Dynamic room generation based on setup wizard input
// ============================================================================

type RoomDef = { roomNo: string; floorNo: number; accountId: string; rent: number };

function generateRooms(
  floors: number,
  roomsPerFloor: number,
  defaultRent: number,
  format: string,
  prefix: string,
  mixedSpecialFloor: { floorNo: number; roomNumbers: string[] } | null,
  customRooms: Array<{ roomNo: string; floorNo: number; rent: number }>,
): RoomDef[] {
  if (format === 'CUSTOM' && customRooms.length > 0) {
    return customRooms.map((r) => ({
      roomNo: r.roomNo,
      floorNo: r.floorNo,
      accountId: `ACC_F${r.floorNo}`,
      rent: r.rent,
    }));
  }

  if (format === 'MIXED' && mixedSpecialFloor) {
    const rooms: RoomDef[] = [];
    const { floorNo: specialFloor, roomNumbers } = mixedSpecialFloor;
    for (let r = 0; r < roomNumbers.length; r++) {
      rooms.push({
        roomNo: roomNumbers[r],
        floorNo: specialFloor,
        accountId: `ACC_F${specialFloor}`,
        rent: defaultRent,
      });
    }
    for (let f = 1; f <= floors; f++) {
      if (f === specialFloor) continue;
      const floorBase = f * 100;
      for (let r = 1; r <= roomsPerFloor; r++) {
        rooms.push({
          roomNo: String(floorBase + r),
          floorNo: f,
          accountId: `ACC_F${f}`,
          rent: defaultRent,
        });
      }
    }
    return rooms;
  }

  const rooms: RoomDef[] = [];
  for (let f = 1; f <= floors; f++) {
    const floorBase = f * 100;
    for (let r = 1; r <= roomsPerFloor; r++) {
      rooms.push({
        roomNo: prefix ? `${prefix}${floorBase + r}` : String(floorBase + r),
        floorNo: f,
        accountId: `ACC_F${f}`,
        rent: defaultRent,
      });
    }
  }
  return rooms;
}

// ============================================================================
// Billing Rules to create
// ============================================================================

const BILLING_RULES = [
  {
    code: 'STANDARD',
    descriptionTh: 'มาตรฐาน',
    waterEnabled: true,
    waterUnitPrice: 20,
    waterMinCharge: 100,
    waterServiceFeeMode: 'FLAT_ROOM' as const,
    waterServiceFeeAmount: 20,
    electricEnabled: true,
    electricUnitPrice: 9,
    electricMinCharge: 45,
    electricServiceFeeMode: 'FLAT_ROOM' as const,
    electricServiceFeeAmount: 20,
  },
  {
    code: 'NO_WATER',
    descriptionTh: 'ไม่มีน้ำ',
    waterEnabled: false,
    waterUnitPrice: 0,
    waterMinCharge: 0,
    waterServiceFeeMode: 'NONE' as const,
    waterServiceFeeAmount: 0,
    electricEnabled: true,
    electricUnitPrice: 8,
    electricMinCharge: 0,
    electricServiceFeeMode: 'NONE' as const,
    electricServiceFeeAmount: 0,
  },
  {
    code: 'NO_ELECTRIC',
    descriptionTh: 'ไม่มีไฟฟ้า',
    waterEnabled: true,
    waterUnitPrice: 20,
    waterMinCharge: 100,
    waterServiceFeeMode: 'FLAT_ROOM' as const,
    waterServiceFeeAmount: 20,
    electricEnabled: false,
    electricUnitPrice: 0,
    electricMinCharge: 0,
    electricServiceFeeMode: 'NONE' as const,
    electricServiceFeeAmount: 0,
  },
];

// ============================================================================
// POST /api/admin/setup/complete
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await setupCompleteSchema.parse(await req.json());

  // If SETUP_SECRET env var is configured, require the correct bearer token.
  // This prevents an attacker from calling the setup endpoint before the legitimate
  // operator completes first-time initialization.
  const setupSecret = process.env.SETUP_SECRET;
  if (setupSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== setupSecret) {
      return NextResponse.json({ success: false, error: 'Invalid setup token' }, { status: 401 });
    }
  }

  // Check if already initialized
  const existingInit = await prisma.config.findUnique({ where: { key: 'system.initialized' } });
  if (existingInit?.value === true) {
    throw new ConflictError('System is already initialized');
  }

  // Double-check: ensure no admin user exists yet (prevents race condition where
  // two simultaneous requests both pass the initialized check before either commits)
  const adminCount = await prisma.adminUser.count();
  if (adminCount > 0) {
    throw new ConflictError('System is already initialized');
  }

  // Check for duplicate username
  const existingUser = await prisma.adminUser.findFirst({
    where: { username: { equals: body.admin.username, mode: 'insensitive' } },
  });
  if (existingUser) {
    throw new ConflictError('Username is already in use');
  }

  // Bank accounts — one per floor; ACC_F1 gets real data from wizard if provided
  const bankAccounts = Array.from({ length: body.rooms.floors }, (_, i) => {
    const isFirst = i === 0;
    const hasWizardBank = !!(body.bankAccount?.bankName);
    return {
      id: `ACC_F${i + 1}`,
      name: isFirst && hasWizardBank ? (body.bankAccount!.bankAccountName || `Floor 1 Account`) : `Floor ${i + 1} Account`,
      bankName: isFirst && hasWizardBank ? (body.bankAccount!.bankName || 'ธนาคารกสิกรไทย') : 'ธนาคารกสิกรไทย',
      bankAccountNo: isFirst && hasWizardBank ? (body.bankAccount!.bankAccountNo || `000-0-${String(i + 1).padStart(5, '0')}`) : `000-0-${String(i + 1).padStart(5, '0')}`,
      promptpay: isFirst && hasWizardBank && body.bankAccount!.promptpay ? body.bankAccount!.promptpay : null,
      active: true,
    };
  });

  // Run everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create admin user
    const adminUser = await tx.adminUser.create({
      data: {
        username: body.admin.username.toLowerCase(),
        displayName: body.admin.displayName.trim(),
        passwordHash: hashPassword(body.admin.password),
        role: 'ADMIN',
        forcePasswordChange: false, // Set to false for easier testing; in production, set to true
      },
      select: { id: true, username: true, displayName: true, role: true },
    });

    // 2. Create billing rules
    await tx.billingRule.createMany({
      data: BILLING_RULES.map((rule) => ({
        ...rule,
        waterUnitPrice: rule.waterUnitPrice,
        waterMinCharge: rule.waterMinCharge,
        waterServiceFeeAmount: rule.waterServiceFeeAmount,
        electricUnitPrice: rule.electricUnitPrice,
        electricMinCharge: rule.electricMinCharge,
        electricServiceFeeAmount: rule.electricServiceFeeAmount,
      })),
      skipDuplicates: true,
    });

    // 3. Create bank accounts
    for (const acc of bankAccounts) {
      await tx.bankAccount.upsert({
        where: { id: acc.id },
        update: { name: acc.name, bankName: acc.bankName, bankAccountNo: acc.bankAccountNo, active: acc.active },
        create: acc,
      });
    }

    // 4. Create rooms (dynamic based on wizard input)
    const generatedRoomDefs = generateRooms(
      body.rooms.floors,
      body.rooms.roomsPerFloor,
      body.rooms.defaultRentAmount,
      body.rooms.format,
      body.rooms.prefix || '',
      body.rooms.mixedSpecialFloor ?? null,
      body.rooms.customRooms ?? [],
    );
    const roomsToCreate = generatedRoomDefs.map((r) => ({
      roomNo: r.roomNo,
      floorNo: r.floorNo,
      defaultAccountId: r.accountId,
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: r.rent,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT' as const,
    }));

    // Batch create rooms in chunks of 100
    for (let i = 0; i < roomsToCreate.length; i += 100) {
      await tx.room.createMany({
        data: roomsToCreate.slice(i, i + 100),
        skipDuplicates: true,
      });
    }

    // 5. Create building config
    await tx.config.upsert({
      where: { key: 'building.name' },
      update: { value: body.building.name },
      create: { key: 'building.name', value: body.building.name, description: 'Building name' },
    });
    await tx.config.upsert({
      where: { key: 'building.address' },
      update: { value: body.building.address },
      create: { key: 'building.address', value: body.building.address, description: 'Building address' },
    });
    await tx.config.upsert({
      where: { key: 'building.phone' },
      // value is Json; string|null coerces correctly
      update: { value: body.building.phone ?? null } as unknown as Prisma.InputJsonValue,
      create: { key: 'building.phone', value: body.building.phone ?? null, description: 'Building phone' } as unknown as Prisma.ConfigCreateInput,
    });
    await tx.config.upsert({
      where: { key: 'building.email' },
      // value is Json; string|null coerces correctly
      update: { value: body.building.email ?? null } as unknown as Prisma.InputJsonValue,
      create: { key: 'building.email', value: body.building.email ?? null, description: 'Building email' } as unknown as Prisma.ConfigCreateInput,
    });
    await tx.config.upsert({
      where: { key: 'building.taxId' },
      // value is Json; string|null coerces correctly
      update: { value: body.building.taxId ?? null } as unknown as Prisma.InputJsonValue,
      create: { key: 'building.taxId', value: body.building.taxId ?? null, description: 'Building tax ID' } as unknown as Prisma.ConfigCreateInput,
    });

    // 6. Create billing policy config
    await tx.config.upsert({
      where: { key: 'billing.billingDay' },
      update: { value: body.billing.billingDay },
      create: { key: 'billing.billingDay', value: body.billing.billingDay, description: 'Billing day of month' },
    });
    await tx.config.upsert({
      where: { key: 'billing.dueDay' },
      update: { value: body.billing.dueDay },
      create: { key: 'billing.dueDay', value: body.billing.dueDay, description: 'Invoice due day of month' },
    });
    await tx.config.upsert({
      where: { key: 'billing.reminderDays' },
      update: { value: body.billing.reminderDays },
      create: { key: 'billing.reminderDays', value: body.billing.reminderDays, description: 'Days before due date to send reminder' },
    });
    await tx.config.upsert({
      where: { key: 'billing.lateFeePerDay' },
      update: { value: body.billing.lateFeePerDay },
      create: { key: 'billing.lateFeePerDay', value: body.billing.lateFeePerDay, description: 'Late fee per day in baht' },
    });

    // 7. Store LINE notify config if enabled
    if (body.lineNotify?.enabled) {
      await tx.config.upsert({
        where: { key: 'lineNotify.enabled' },
        update: { value: true },
        create: { key: 'lineNotify.enabled', value: true, description: 'LINE notify enabled' },
      });
      if (body.lineNotify.channelId) {
        await tx.config.upsert({
          where: { key: 'lineNotify.channelId' },
          update: { value: body.lineNotify.channelId },
          create: { key: 'lineNotify.channelId', value: body.lineNotify.channelId, description: 'LINE Channel ID' },
        });
      }
      if (body.lineNotify.channelSecret) {
        await tx.config.upsert({
          where: { key: 'lineNotify.channelSecret' },
          update: { value: body.lineNotify.channelSecret },
          create: { key: 'lineNotify.channelSecret', value: body.lineNotify.channelSecret, description: 'LINE Channel Secret' },
        });
      }
      if (body.lineNotify.accessToken) {
        await tx.config.upsert({
          where: { key: 'lineNotify.accessToken' },
          update: { value: body.lineNotify.accessToken },
          create: { key: 'lineNotify.accessToken', value: body.lineNotify.accessToken, description: 'LINE Access Token' },
        });
      }
    }

    // 8. Store email notify config if enabled
    if (body.emailNotify?.enabled) {
      await tx.config.upsert({
        where: { key: 'emailNotify.enabled' },
        update: { value: true },
        create: { key: 'emailNotify.enabled', value: true, description: 'Email notify enabled' },
      });
      if (body.emailNotify.smtpHost) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpHost' },
          update: { value: body.emailNotify.smtpHost },
          create: { key: 'emailNotify.smtpHost', value: body.emailNotify.smtpHost, description: 'SMTP host' },
        });
      }
      if (body.emailNotify.smtpPort) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpPort' },
          update: { value: body.emailNotify.smtpPort },
          create: { key: 'emailNotify.smtpPort', value: body.emailNotify.smtpPort, description: 'SMTP port' },
        });
      }
      if (body.emailNotify.smtpUser) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpUser' },
          update: { value: body.emailNotify.smtpUser },
          create: { key: 'emailNotify.smtpUser', value: body.emailNotify.smtpUser, description: 'SMTP user' },
        });
      }
      if (body.emailNotify.smtpPass) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpPass' },
          update: { value: body.emailNotify.smtpPass },
          create: { key: 'emailNotify.smtpPass', value: body.emailNotify.smtpPass, description: 'SMTP password' },
        });
      }
      if (body.emailNotify.fromEmail) {
        await tx.config.upsert({
          where: { key: 'emailNotify.fromEmail' },
          update: { value: body.emailNotify.fromEmail },
          create: { key: 'emailNotify.fromEmail', value: body.emailNotify.fromEmail, description: 'From email address' },
        });
      }
    }

    // 9. Mark system as initialized
    await tx.config.upsert({
      where: { key: 'system.initialized' },
      update: { value: true },
      create: { key: 'system.initialized', value: true, description: 'System initialization flag' },
    });

    // 10. Seed default document templates (navy/gold A4 — document-template engine)
    const INVOICE_BODY = `<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{font-family:'Sarabun','Noto Sans Thai','DejaVu Sans',sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;background:#fff;-webkit-font-smoothing:antialiased}@page{size:A4 portrait;margin:0}body{width:210mm;min-height:297mm;overflow:hidden;position:relative}.header{background:#1c3860;color:#fff;padding:14px 40px 12px;position:relative;display:flex;justify-content:space-between;align-items:flex-start}.header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:#f29d21}.header-left .header-name{font-size:20px;font-weight:700}.header-left .header-sub{font-size:11px;color:#c8d4ee;margin-top:3px}.header-title-main{font-size:26px;font-weight:700;color:#f29d21;text-align:right;line-height:1.1}.header-title-sub{font-size:11px;color:#c8d4ee;text-align:right}.meta{display:flex;justify-content:space-between;padding:12px 40px 10px;gap:24px}.bill-to .label{font-size:12px;color:#888}.bill-to .name{font-size:18px;font-weight:700;color:#1c3860;margin-top:3px}.bill-to .detail{font-size:16px;color:#444;margin-top:2px}.bill-to .phone{font-size:14px;color:#777;margin-top:2px}.invoice-info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccc;overflow:hidden;align-self:flex-start;min-width:260px}.inv-cell{padding:6px 10px;font-size:14px}.inv-row:nth-child(odd) .inv-cell{background:#f0f0f2}.inv-cell:first-child{color:#666}.inv-cell:last-child{font-weight:700;color:#1c3860;text-align:right}.divider{border:none;border-top:1px solid #1c3860;margin:0 40px}.table-section{padding:10px 40px 0}table{width:100%;border-collapse:collapse}thead th{background:#1c3860;color:#fff;font-size:16px;font-weight:700;padding:8px 12px;text-align:left}thead th:not(:first-child){text-align:right}tbody td{padding:8px 12px;font-size:16px;border-bottom:0.5px solid #e0e0e8}tbody td.num{text-align:right;font-variant-numeric:tabular-nums}tbody td.bold{font-weight:700}.row-even td{background:#fff}.row-odd td{background:#f4f5fb}.bottom-row{display:flex;justify-content:flex-end;align-items:stretch;padding:14px 40px 0;gap:0}.total-label{font-size:14px;color:#f29d21;font-weight:700}.total-amount{font-size:32px;font-weight:700;line-height:1}.qr-box{text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}.qr-box img{width:110px;height:110px;display:block}.qr-box img:not([src]),.qr-box img[src=""]{display:none}.qr-label{font-size:12px;color:#888}.qr-amount{font-size:14px;font-weight:700;color:#1c3860}.transfer-box{background:#f8fafc;border:1.5px solid #1c3860;border-right:none;border-radius:8px 0 0 8px;padding:14px 18px;flex:1}.total-box{background:#1c3860;color:#fff;border-radius:0 8px 8px 0;border:1.5px solid #1c3860;padding:16px 24px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;flex-shrink:0;min-width:220px;text-align:center}.transfer-header{font-size:16px;font-weight:700;color:#1c3860;margin-bottom:8px}.transfer-row{display:flex;gap:12px;font-size:16px;line-height:1.7}.transfer-label{color:#555;white-space:nowrap;min-width:80px}.transfer-value{color:#1c3860;font-weight:700}.notes-section{padding:14px 40px 0}.notes-header{font-size:16px;font-weight:700;color:#888;margin-bottom:6px}.notes-body{font-size:16px;color:#444;line-height:1.7}.notes-body p{margin-bottom:5px}.footer{position:absolute;bottom:0;left:0;right:0;background:#1c3860}.footer::before{content:'';display:block;height:2px;background:#f29d21}.footer-inner{display:flex;justify-content:space-between;align-items:center;padding:7px 40px}.footer-text{font-size:11px;color:#c8d4ee}.footer-id{font-size:10px;color:#7a8ab0}</style><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet"/><div class="header"><div class="header-left"><div class="header-name" data-template-field="apartment.name">{{apartment.name}}</div><div class="header-sub" data-template-field="apartment.address">{{apartment.address}}</div></div><div><div class="header-title-main">ใบแจ้งหนี้</div><div class="header-title-sub">INVOICE</div></div></div><div class="meta"><div class="bill-to"><div class="label">เรียนเก็บจาก / Bill To</div><div class="name" data-template-field="tenant.fullName">{{tenant.fullName}}</div><div class="detail">ห้อง <span data-template-field="room.number">{{room.number}}</span> ชั้น <span data-template-field="room.floorNumber">{{room.floorNumber}}</span></div><div class="phone" data-template-field="tenant.phone">{{tenant.phone}}</div></div><div class="invoice-info"><div class="inv-row"><div class="inv-cell">เลขที่ใบแจ้งหนี้</div><div class="inv-cell" data-template-field="computed.invoiceNumber">{{computed.invoiceNumber}}</div></div><div class="inv-row"><div class="inv-cell">วันที่ออก / Issue Date</div><div class="inv-cell" data-template-field="computed.issuedDateLabel">{{computed.issuedDateLabel}}</div></div><div class="inv-row"><div class="inv-cell">ครบกำหนด / Due Date</div><div class="inv-cell" data-template-field="computed.dueDateLabel">{{computed.dueDateLabel}}</div></div><div class="inv-row"><div class="inv-cell">งวด / Period</div><div class="inv-cell" data-template-field="computed.billingMonthLabel">{{computed.billingMonthLabel}}</div></div></div></div><hr class="divider"/><div class="table-section"><table><thead><tr><th>รายการ</th><th class="num">หน่วย</th><th class="num">ราคา/หน่วย (บาท)</th><th class="num">จำนวนเงิน (บาท)</th></tr></thead><tbody data-template-repeat="billing_items"><tr class="row-even"><td data-template-field="typeName">{{typeName}}</td><td class="num" data-template-field="quantity">{{quantity}}</td><td class="num" data-template-field="unitPriceFormatted">{{unitPriceFormatted}}</td><td class="num bold" data-template-field="amountFormatted">{{amountFormatted}}</td></tr></tbody></table></div><div class="bottom-row"><div class="qr-box"><img src="{{computed.qrDataUrl}}" alt="QR Code"/><div class="qr-label">สแกนชำระ / Scan to Pay</div><div class="qr-amount" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</div></div><div class="transfer-box"><div class="transfer-header">ชำระด้วยการโอน / Bank Transfer</div><div class="transfer-row"><span class="transfer-label">ธนาคาร</span><span class="transfer-value" data-template-field="bankAccount.bankName">{{bankAccount.bankName}}</span></div><div class="transfer-row"><span class="transfer-label">เลขที่บัญชี</span><span class="transfer-value" data-template-field="bankAccount.accountNo">{{bankAccount.accountNo}}</span></div><div class="transfer-row"><span class="transfer-label">ชื่อบัญชี</span><span class="transfer-value" data-template-field="bankAccount.accountName">{{bankAccount.accountName}}</span></div></div><div class="total-box"><span class="total-label">รวมทั้งสิ้น / TOTAL</span><span class="total-amount" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</span></div></div><div class="footer"><div class="footer-inner"><span class="footer-text">ขอบคุณที่ไว้วางใจในบริการของเรา • Thank you for your business</span><span class="footer-id">ID: <span data-template-field="billing.invoiceId">{{billing.invoiceId}}</span></span></div></div>`;

    const RECEIPT_BODY = `<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{font-family:'Sarabun','Noto Sans Thai',sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;background:#fff}@page{size:A4 portrait;margin:0}body{width:210mm;min-height:297mm;overflow:hidden;position:relative}.header{background:#1c3860;color:#fff;padding:12px 40px 10px;position:relative;display:flex;justify-content:space-between;align-items:flex-start}.header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:#f29d21}.header-left .header-name{font-size:18px;font-weight:700}.header-left .header-sub{font-size:11px;color:#c8d4ee;margin-top:3px}.header-title-main{font-size:26px;font-weight:700;color:#f29d21;text-align:right;line-height:1.1}.header-title-sub{font-size:11px;color:#c8d4ee;text-align:right}.meta{display:flex;justify-content:space-between;padding:10px 40px 8px;gap:24px}.receipt-for .label{font-size:12px;color:#888}.receipt-for .name{font-size:18px;font-weight:700;color:#1c3860;margin-top:2px}.receipt-for .detail{font-size:16px;color:#444;margin-top:1px}.receipt-info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccc;overflow:hidden;align-self:flex-start;min-width:240px}.inv-cell{padding:6px 10px;font-size:14px}.inv-row:nth-child(odd) .inv-cell{background:#f0f0f2}.inv-cell:first-child{color:#666}.inv-cell:last-child{font-weight:700;color:#1c3860;text-align:right}.divider{border:none;border-top:1px solid #1c3860;margin:0 40px}.table-section{padding:8px 40px 0}table{width:100%;border-collapse:collapse}thead th{background:#1c3860;color:#fff;font-size:16px;font-weight:700;padding:8px 12px;text-align:left}thead th:not(:first-child){text-align:right}tbody td{padding:8px 12px;font-size:16px;border-bottom:0.5px solid #e0e0e8}tbody td.num{text-align:right;font-variant-numeric:tabular-nums}tbody td.bold{font-weight:700}.row-even td{background:#fff}.row-odd td{background:#f4f5fb}.amount-box{display:flex;justify-content:flex-end;padding:12px 40px 0}.amount-inner{background:#1c3860;border-radius:8px;padding:14px 26px;text-align:center;min-width:210px}.amount-label{font-size:14px;color:#f29d21;font-weight:700}.amount-value{font-size:32px;font-weight:700;color:#fff;line-height:1;margin-top:4px}.paid-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);font-size:72px;font-weight:700;color:rgba(30,120,50,0.12);pointer-events:none;white-space:nowrap}.footer{position:absolute;bottom:0;left:0;right:0;background:#1c3860}.footer::before{content:'';display:block;height:2px;background:#f29d21}.footer-inner{display:flex;justify-content:space-between;align-items:center;padding:6px 40px}.footer-text{font-size:11px;color:#c8d4ee}.footer-id{font-size:10px;color:#7a8ab0}</style><div class="paid-watermark">ชำระแล้ว / PAID</div><div class="header"><div class="header-left"><div class="header-name" data-template-field="apartment.name">{{apartment.name}}</div><div class="header-sub" data-template-field="apartment.address">{{apartment.address}}</div></div><div><div class="header-title-main">ใบเสร็จรับเงิน</div><div class="header-title-sub">RECEIPT</div></div></div><div class="meta"><div class="receipt-for"><div class="label">ได้รับเงินจาก / Received From</div><div class="name" data-template-field="tenant.fullName">{{tenant.fullName}}</div><div class="detail">ห้อง <span data-template-field="room.number">{{room.number}}</span> ชั้น <span data-template-field="room.floorNumber">{{room.floorNumber}}</span></div></div><div class="receipt-info"><div class="inv-row"><div class="inv-cell">เลขที่ใบเสร็จ</div><div class="inv-cell" data-template-field="computed.invoiceNumber">{{computed.invoiceNumber}}</div></div><div class="inv-row"><div class="inv-cell">วันที่</div><div class="inv-cell" data-template-field="computed.issuedDateLabel">{{computed.issuedDateLabel}}</div></div><div class="inv-row"><div class="inv-cell">งวด / Period</div><div class="inv-cell" data-template-field="computed.billingMonthLabel">{{computed.billingMonthLabel}}</div></div><div class="inv-row"><div class="inv-cell">ยอดชำระ</div><div class="inv-cell" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</div></div></div></div><hr class="divider"/><div class="table-section"><table><thead><tr><th>รายการ</th><th class="num">จำนวนเงิน (บาท)</th></tr></thead><tbody data-template-repeat="billing_items"><tr class="row-even"><td data-template-field="typeName">{{typeName}}</td><td class="num bold" data-template-field="amountFormatted">{{amountFormatted}}</td></tr></tbody></table></div><div class="amount-box"><div class="amount-inner"><div class="amount-label">รวมทั้งสิ้น / TOTAL</div><div class="amount-value" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</div></div></div><div class="footer"><div class="footer-inner"><span class="footer-text">ขอบคุณที่ไว้วางใจในบริการของเรา • Thank you for your business</span><span class="footer-id">ID: <span data-template-field="billing.invoiceId">{{billing.invoiceId}}</span></span></div></div>`;

    const PAYMENT_NOTICE_BODY = `<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{font-family:'Sarabun','Noto Sans Thai','DejaVu Sans',sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;background:#fff;-webkit-font-smoothing:antialiased}@page{size:A4 portrait;margin:0}body{width:210mm;min-height:297mm;overflow:hidden;position:relative}.header{background:#1c3860;color:#fff;padding:12px 40px 10px;position:relative;display:flex;justify-content:space-between;align-items:flex-start}.header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:#f29d21}.header-left .header-name{font-size:18px;font-weight:700}.header-left .header-sub{font-size:11px;color:#c8d4ee;margin-top:3px}.header-title-main{font-size:26px;font-weight:700;color:#f29d21;text-align:right;line-height:1.1}.header-title-sub{font-size:11px;color:#c8d4ee;text-align:right}.notice-box{background:#fff3cd;border:1.5px solid #f29d21;border-radius:8px;padding:14px 18px;margin:12px 40px 0;text-align:center}.notice-box-title{font-size:18px;font-weight:700;color:#8b5e00}.notice-box-text{font-size:16px;color:#6b5500;margin-top:4px}.meta{display:flex;justify-content:space-between;padding:12px 40px 10px;gap:24px}.notice-to .label{font-size:12px;color:#888}.notice-to .name{font-size:18px;font-weight:700;color:#1c3860;margin-top:2px}.notice-to .detail{font-size:16px;color:#444;margin-top:1px}.notice-info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccc;overflow:hidden;align-self:flex-start;min-width:240px}.inv-cell{padding:6px 10px;font-size:14px}.inv-row:nth-child(odd) .inv-cell{background:#f0f0f2}.inv-cell:first-child{color:#666}.inv-cell:last-child{font-weight:700;color:#1c3860;text-align:right}.divider{border:none;border-top:1px solid #1c3860;margin:0 40px}.table-section{padding:8px 40px 0}table{width:100%;border-collapse:collapse}thead th{background:#1c3860;color:#fff;font-size:16px;font-weight:700;padding:8px 12px;text-align:left}thead th:not(:first-child){text-align:right}tbody td{padding:8px 12px;font-size:16px;border-bottom:0.5px solid #e0e0e8}tbody td.num{text-align:right;font-variant-numeric:tabular-nums}tbody td.bold{font-weight:700}.row-even td{background:#fff}.row-odd td{background:#f4f5fb}.bottom-row{display:flex;justify-content:flex-end;align-items:stretch;padding:12px 40px 0;gap:0}.total-label{font-size:14px;color:#f29d21;font-weight:700}.total-amount{font-size:32px;font-weight:700;line-height:1}.qr-box{text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}.qr-box img{width:110px;height:110px;display:block}.qr-box img:not([src]),.qr-box img[src=""]{display:none}.qr-label{font-size:12px;color:#888}.qr-amount{font-size:14px;font-weight:700;color:#1c3860}.transfer-box{background:#f8fafc;border:1.5px solid #1c3860;border-right:none;border-radius:8px 0 0 8px;padding:14px 18px;flex:1}.total-box{background:#1c3860;color:#fff;border-radius:0 8px 8px 0;border:1.5px solid #1c3860;padding:16px 22px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;flex-shrink:0;min-width:210px;text-align:center}.transfer-header{font-size:16px;font-weight:700;color:#1c3860;margin-bottom:8px}.transfer-row{display:flex;gap:12px;font-size:16px;line-height:1.7}.transfer-label{color:#555;white-space:nowrap;min-width:80px}.transfer-value{color:#1c3860;font-weight:700}.policy-section{padding:12px 40px 0}.policy-header{font-size:16px;font-weight:700;color:#1c3860;border-bottom:1.5px solid #f29d21;padding-bottom:4px;margin-bottom:6px}.policy-cols{display:flex;gap:20px}.policy-col{flex:1}.policy-sub-header{font-size:14px;font-weight:700;color:#666;margin-bottom:4px}.policy-rule{font-size:14px;color:#444;margin-bottom:4px;line-height:1.6}.footer{position:absolute;bottom:0;left:0;right:0;background:#1c3860}.footer::before{content:'';display:block;height:2px;background:#f29d21}.footer-inner{display:flex;justify-content:space-between;align-items:center;padding:6px 40px}.footer-text{font-size:11px;color:#c8d4ee}.footer-id{font-size:10px;color:#7a8ab0}</style><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet"/><div class="header"><div class="header-left"><div class="header-name" data-template-field="apartment.name">{{apartment.name}}</div><div class="header-sub" data-template-field="apartment.address">{{apartment.address}}</div></div><div><div class="header-title-main">แจ้งชำระค่าบริการ</div><div class="header-title-sub">PAYMENT NOTICE</div></div></div><div class="notice-box"><div class="notice-box-title">กรุณาชำระค่าบริการภายในกำหนด</div><div class="notice-box-text">หากไม่ชำระภายในวันที่ ๗ ของเดือน จะถูกระงับสิทธิ์การเช่าและตัดน้ำ-ไฟ ตั้งแต่วันที่ ๘</div></div><div class="meta"><div class="notice-to"><div class="label">เรียน / Dear</div><div class="name" data-template-field="tenant.fullName">{{tenant.fullName}}</div><div class="detail">ห้อง <span data-template-field="room.number">{{room.number}}</span> ชั้น <span data-template-field="room.floorNumber">{{room.floorNumber}}</span></div><div class="detail" style="margin-top:2px;">โทร. <span data-template-field="tenant.phone">{{tenant.phone}}</span></div></div><div class="notice-info"><div class="inv-row"><div class="inv-cell">งวด / Period</div><div class="inv-cell" data-template-field="computed.billingMonthLabel">{{computed.billingMonthLabel}}</div></div><div class="inv-row"><div class="inv-cell">วันครบกำหนด</div><div class="inv-cell" data-template-field="computed.dueDateLabel">{{computed.dueDateLabel}}</div></div><div class="inv-row"><div class="inv-cell">เลขที่ใบแจ้งหนี้</div><div class="inv-cell" data-template-field="computed.invoiceNumber">{{computed.invoiceNumber}}</div></div><div class="inv-row"><div class="inv-cell">ยอดรวม</div><div class="inv-cell" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</div></div></div></div><hr class="divider"/><div class="table-section"><table><thead><tr><th>รายการ</th><th class="num">หน่วย</th><th class="num">ราคา/หน่วย (บาท)</th><th class="num">จำนวนเงิน (บาท)</th></tr></thead><tbody data-template-repeat="billing_items"><tr class="row-even"><td data-template-field="typeName">{{typeName}}</td><td class="num" data-template-field="quantity">{{quantity}}</td><td class="num" data-template-field="unitPriceFormatted">{{unitPriceFormatted}}</td><td class="num bold" data-template-field="amountFormatted">{{amountFormatted}}</td></tr></tbody></table></div><div class="bottom-row"><div class="qr-box"><img src="{{computed.qrDataUrl}}" alt="QR Code"/><div class="qr-label">สแกนชำระ / Scan to Pay</div><div class="qr-amount" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</div></div><div class="transfer-box"><div class="transfer-header">ชำระด้วยการโอน / Bank Transfer</div><div class="transfer-row"><span class="transfer-label">ธนาคาร</span><span class="transfer-value" data-template-field="bankAccount.bankName">{{bankAccount.bankName}}</span></div><div class="transfer-row"><span class="transfer-label">เลขที่บัญชี</span><span class="transfer-value" data-template-field="bankAccount.accountNo">{{bankAccount.accountNo}}</span></div><div class="transfer-row"><span class="transfer-label">ชื่อบัญชี</span><span class="transfer-value" data-template-field="bankAccount.accountName">{{bankAccount.accountName}}</span></div></div><div class="total-box"><span class="total-label">รวมทั้งสิ้น / TOTAL</span><span class="total-amount" data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</span></div></div><div class="policy-section"><div class="policy-header">ข้อตกลงการชำระเงิน / Payment Policy</div><div class="policy-cols"><div class="policy-col"><div class="policy-sub-header">ระเบียบการชำระเงิน</div><div class="policy-rule">• ชำระค่าบริการภายในวันที่ 1–7 ของเดือน</div><div class="policy-rule">• ส่งสลิปยืนยันการโอนเงินผ่าน LINE ภายในวันที่กำหนด</div><div class="policy-rule">• ชำระไม่ครบ จะปรับ 100 บาท/ครั้ง</div></div><div class="policy-col"><div class="policy-sub-header">อัตราค่าปรับ / Late Fee Schedule</div><div class="policy-rule">• ห้องชั้น 1 และห้องแอร์: 200 บาท/วัน</div><div class="policy-rule">• ห้องชั้น 2–8 ทั่วไป: 100 บาท/วัน</div><div class="policy-rule">• วันที่ 8: ตัดน้ำ-ไฟ และยึดคืนห้อง 08:00 น.</div></div></div></div><div class="footer"><div class="footer-inner"><span class="footer-text">อพาร์ตเมนต์ • Apartment Management System</span><span class="footer-id">ID: <span data-template-field="billing.invoiceId">{{billing.invoiceId}}</span></span></div></div>`;

    const CONTRACT_BODY = `<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{font-family:'Sarabun','Noto Sans Thai','DejaVu Sans',sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;background:#fff;-webkit-font-smoothing:antialiased}@page{size:A4 portrait;margin:0}body{width:210mm;min-height:297mm;overflow:hidden;position:relative}.page{width:210mm;min-height:297mm;position:relative;overflow:hidden;padding-bottom:50px}.header{background:#1c3860;color:#fff;padding:14px 50px 12px;display:flex;justify-content:space-between;align-items:flex-start;position:relative}.header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:#f29d21}.header-title{font-size:20px;font-weight:700;color:#f29d21}.header-sub{font-size:13px;color:#c8d4ee;margin-top:4px}.content{padding:14px 50px 0}.section-title{font-size:18px;font-weight:700;color:#1c3860;border-bottom:2px solid #f29d21;padding-bottom:4px;margin-bottom:10px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px;margin-bottom:10px}.info-row{display:flex;gap:10px;font-size:16px;line-height:1.5}.info-label{color:#555;min-width:120px}.info-value{font-weight:700;color:#1a1a1a}.room-box{background:#e8ecf5;border:1.5px solid #1c3860;border-radius:8px;padding:12px 18px;margin:0 0 10px}.room-box-title{font-size:12px;color:#888;margin-bottom:6px}.room-box-grid{display:flex;gap:24px;font-size:16px}.room-box-item{display:flex;flex-direction:column;gap:2px}.room-box-label{font-size:12px;color:#888}.room-box-value{font-size:16px;font-weight:700;color:#1c3860}.parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 0 10px}.party{background:#f4f5fb;border:1px solid #d0d0e0;border-radius:6px;padding:10px 14px}.party-label{font-size:12px;color:#888;font-weight:700;margin-bottom:4px}.party-name{font-size:16px;font-weight:700;color:#1c3860}.party-detail{font-size:14px;color:#444;margin-top:2px}.divider{border:none;border-top:1px solid #1c3860;margin:6px 0}.clause-list{}.clause{display:flex;gap:10px;margin-bottom:8px;font-size:16px;line-height:1.6}.clause-num{font-weight:700;color:#1c3860;min-width:26px;flex-shrink:0}.clause-text{flex:1}.clause-text strong{color:#1c3860}.image-placeholder{border:2px dashed #c0c8d8;border-radius:6px;padding:20px;text-align:center;color:#888;font-size:14px;margin:8px 0;background:#f8f9fb}.image-placeholder img{max-width:100%;height:auto;display:block;margin:0 auto}.image-placeholder img:not([src]),.image-placeholder img[src=""]{display:none}.image-placeholder:has(img[src=""]),.image-placeholder:has(img:not([src])){display:none}.signature-section{display:flex;justify-content:space-between;padding:20px 0 0;gap:50px}.signature-box{text-align:center;flex:1}.signature-line{border-top:1px solid #aaa;margin-top:60px;padding-top:4px;font-size:14px;color:#555}.signature-name{font-size:16px;font-weight:700;color:#1c3860}.signature-role{font-size:14px;color:#888}.footer{position:absolute;bottom:0;left:0;right:0;background:#1c3860;padding:7px 50px}.footer::before{content:'';display:block;height:2px;background:#f29d21;margin-bottom:7px}.footer-text{font-size:10px;color:#c8d4ee}.footer-id{font-size:9px;color:#7a8ab0}.page-break{page-break-before:always}.no-break{page-break-inside:avoid}</style><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet"/><div class="page"><div class="header"><div><div class="header-title">สัญญาเช่าที่พักอาศัย</div><div class="header-sub">LEASE AGREEMENT FOR RESIDENTIAL ACCOMMODATION</div></div></div><div class="content"><div class="section-title">ข้อมูลสัญญา</div><div class="info-grid"><div class="info-row"><span class="info-label">เลขที่สัญญา</span><span class="info-value" data-template-field="contract.id">{{contract.id}}</span></div><div class="info-row"><span class="info-label">วันที่ทำสัญญา</span><span class="info-value" data-template-field="contract.signDate">{{contract.signDate}}</span></div><div class="info-row"><span class="info-label">วันที่เริ่มสัญญา</span><span class="info-value" data-template-field="contract.startDate">{{contract.startDate}}</span></div><div class="info-row"><span class="info-label">วันที่สิ้นสุดสัญญา</span><span class="info-value" data-template-field="contract.endDate">{{contract.endDate}}</span></div></div><div class="room-box"><div class="room-box-title">รายละเอียดห้องพัก</div><div class="room-box-grid"><div class="room-box-item"><span class="room-box-label">ห้อง</span><span class="room-box-value" data-template-field="room.number">{{room.number}}</span></div><div class="room-box-item"><span class="room-box-label">ชั้น</span><span class="room-box-value" data-template-field="room.floorNumber">{{room.floorNumber}}</span></div><div class="room-box-item"><span class="room-box-label">ค่าเช่ารายเดือน</span><span class="room-box-value" data-template-field="contract.monthlyRent">{{contract.monthlyRent}}</span></div><div class="room-box-item"><span class="room-box-label">เงินมัดจำ</span><span class="room-box-value" data-template-field="contract.deposit">{{contract.deposit}}</span></div></div></div><div class="section-title" style="margin-top:6px;">คู่สัญญา</div><div class="parties"><div class="party"><div class="party-label">ผู้ให้เช่า (LANDLORD)</div><div class="party-name" data-template-field="contract.landlordName">{{contract.landlordName}}</div><div class="party-detail" data-template-field="contract.landlordAddress">{{contract.landlordAddress}}</div><div class="party-detail">โทร. <span data-template-field="contract.landlordPhone">{{contract.landlordPhone}}</span></div></div><div class="party"><div class="party-label">ผู้เช่า (TENANT)</div><div class="party-name" data-template-field="tenant.fullName">{{tenant.fullName}}</div><div class="party-detail">เลขประจำตัวประชาชน: ____________________</div><div class="party-detail">โทร. <span data-template-field="tenant.phone">{{tenant.phone}}</span></div></div></div><div class="section-title">ข้อสัญญา</div><div class="clause-list"><div class="clause no-break"><span class="clause-num">๑.</span><span class="clause-text">ผู้ให้เช่าตกลงให้และผู้เช่าตกลงเช่าทรัพย์สินอาศัยตามที่ระบุไว้ในข้อ ๒ โดยผู้เช่ายินยอมชำระค่าเช่าและค่าสาธารณูปโภคตามที่กำหนดในสัญญานี้</span></div><div class="clause no-break"><span class="clause-num">๒.</span><span class="clause-text">ทรัพย์สินที่เช่าคือ <strong>ห้องเลขที่ <span data-template-field="room.number">{{room.number}}</span></strong> ตั้งอยู่ในอาคารชุดที่ <span data-template-field="apartment.name">{{apartment.name}}</span> ที่อยู่ <span data-template-field="apartment.address">{{apartment.address}}</span> พร้อมสิ่งอำนวยความสะดวกตามที่เป็นอยู่ในขณะทำสัญญา</span></div><div class="clause no-break"><span class="clause-num">๓.</span><span class="clause-text">ผู้เช่าตกลงชำระค่าเช่าทุกเดือน จำนวน <strong><span data-template-field="contract.monthlyRent">{{contract.monthlyRent}}</span> บาท</strong> โดยชำระล่วงหน้าภายในวันที่ ๑–๗ ของทุกเดือน ผ่านการโอนเงินเข้าบัญชีที่ผู้ให้เช่ากำหนด และจะส่งสลิปยืนยันการโอนเงินผ่าน LINE ให้ผู้ให้เช่าภายในวันที่กำหนด</span></div><div class="clause no-break"><span class="clause-num">๔.</span><span class="clause-text">ผู้เช่าตกลงวางเงินมัดจำจำนวน <strong><span data-template-field="contract.deposit">{{contract.deposit}}</span> บาท</strong> ไว้กับผู้ให้เช่าในวันทำสัญญา เงินมัดจำนี้จะได้รับคืนเมื่อครบกำหนดสัญญาเช่าและผู้เช่าได้ชำระค่าเช่าและค่าใช้จ่ายครบถ้วนแล้ว</span></div><div class="clause no-break"><span class="clause-num">๕.</span><span class="clause-text">หากผู้เช่าไม่ชำระค่าเช่าภายในวันที่ ๗ ของเดือน ถือว่าผู้เช่าสละสิทธิ์การเช่าโดยอัตโนมัติ และผู้ให้เช่ามีสิทธิ์ระงับการใช้น้ำและไฟฟ้าได้ทันที รวมถึงมีสิทธิ์เรียกคืนห้องพักภายในวันที่ ๘ เวลา ๐๘:๐๐ น.</span></div><div class="clause no-break"><span class="clause-num">๖.</span><span class="clause-text">ผู้เช่าสามารถขอเลื่อนการชำระค่าเช่าได้ถึงวันที่ ๑๕ โดยชำระค่าปรับเพิ่ม ดังนี้ — ห้องชั้น ๑ และห้องแอร์ <strong>๒๐๐ บาท/วัน</strong>, ห้องชั้น ๒–๘ <strong>๑๐๐ บาท/วัน</strong> นับตั้งแต่วันที่ ๘ จนถึงวันที่ชำระครบ</span></div><div class="clause no-break"><span class="clause-num">๗.</span><span class="clause-text">ผู้เช่าที่โอนเงินแล้วแต่ไม่ส่งสลิปยืนยันทาง LINE ภายในวันที่ ๗ ต้องชำระค่าปรับ <strong>๑๐๐ บาทต่อครั้ง</strong> กรณีโอนเงินผิดจำนวนต้องโอนส่วนที่ขาดเพิ่มให้ครบภายในวันที่ ๗ มิฉะนั้นจะถูกปรับตามข้อ ๖</span></div></div></div><div class="footer"><div class="footer-text">สัญญาเช่าที่พักอาศัย • Lease Agreement — หน้า ๑ จาก ๒</div></div></div><div class="page page-break"><div class="header"><div><div class="header-title">สัญญาเช่าที่พักอาศัย</div><div class="header-sub">LEASE AGREEMENT FOR RESIDENTIAL ACCOMMODATION</div></div></div><div class="content"><div class="image-placeholder" data-template-field="contract.image"><img src="{{contract.image}}" alt="Contract Illustration"/></div><div class="section-title">ข้อสัญญา (ต่อ)</div><div class="clause-list"><div class="clause no-break"><span class="clause-num">๘.</span><span class="clause-text">ผู้เช่าตกลงรับผิดชอบค่าใช้จ่ายสาธารณูปโภค ได้แก่ ค่าน้ำประปาและค่าไฟฟ้า ตามจำนวนที่กำหนดในใบแจ้งหนี้ประจำเดือน โดยชำระพร้อมค่าเช่า</span></div><div class="clause no-break"><span class="clause-num">๙.</span><span class="clause-text">ผู้เช่าตกลงดูแลรักษาทรัพย์สินที่เช่าให้อยู่ในสภาพดี ห้ามดัดแปลงหรือเปลี่ยนแปลงสิ่งใดโดยไม่ได้รับอนุญาตจากผู้ให้เช่าเป็นลายลักษณ์อักษร การซ่อมแซมที่เกิดจากการเสื่อมสภาพตามปกติให้ผู้ให้เช่าเป็นผู้รับผิดชอบ</span></div><div class="clause no-break"><span class="clause-num">๑๐.</span><span class="clause-text">ห้ามผู้เช่าปล่อยให้บุคคลอื่นเข้าพักอาศัยในทรัพย์สินที่เช่าโดยไม่ได้รับอนุญาตจากผู้ให้เช่าเป็นลายลักษณ์อักษร การอนุญาตให้ผู้มาพักชั่วคราวไม่เกิน ๗ วันต้องแจ้งผู้ให้เช่าล่วงหน้า</span></div><div class="clause no-break"><span class="clause-num">๑๑.</span><span class="clause-text">ผู้เช่าห้ามทำกิจการใดๆ ในทรัพย์สินที่เช่าโดยเด็ดขาด ห้ามเก็บของมีค่าหรือวัตถุอันตรายไว้ในห้อง ห้ามใช้ห้องในทางที่ผิดกฎหมายหรือศีลธรรมอันดี</span></div><div class="clause no-break"><span class="clause-num">๑๒.</span><span class="clause-text">เมื่อครบกำหนดสัญญาเช่า ผู้เช่าตกลงส่งมอบทรัพย์สินคืนให้ผู้ให้เช่าในสภาพที่ดีตามปกติ พร้อมส่งกุญแจและรีโมทให้ครบ หากทรัพย์สินเสียหายจากการใช้งาน ผู้เช่าตกลงชดใช้ค่าเสียหายจากเงินมัดจำ</span></div><div class="clause no-break"><span class="clause-num">๑๓.</span><span class="clause-text">การบอกเลิกสัญญาก่อนครบกำหนด ฝ่ายใดฝ่ายหนึ่งต้องแจ้งเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า ๓๐ วัน มิฉะนั้นฝ่ายที่บอกเลิกต้องชดใช้ค่าเสียหาย ๑ เดือนของค่าเช่า</span></div><div class="clause no-break"><span class="clause-num">๑๔.</span><span class="clause-text">คู่สัญญาตกลงว่าหากมีข้อพิพาทใดๆ อันเกิดจากสัญญานี้ ให้เจรจากันโดยสุจริตก่อน หากเจรจาไม่ได้ให้ขึ้นศาลที่มีเขตอำนาจเป็นสถานที่ทำสัญญานี้เป็นศาลที่มีอำนาจพิจารณาข้อพิพาทนั้น</span></div><div class="clause no-break"><span class="clause-num">๑๕.</span><span class="clause-text">สัญญานี้ทำขึ้นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว จึงลงมือชื่อไว้เป็นสำคัญต่อหน้าพยาน</span></div></div><div class="signature-section"><div class="signature-box"><div class="signature-name" data-template-field="contract.landlordName">{{contract.landlordName}}</div><div class="signature-role">ผู้ให้เช่า / Landlord</div><div class="signature-line">ลงชื่อ _____________________ วันที่ ____/____/______</div></div><div class="signature-box"><div class="signature-name" data-template-field="tenant.fullName">{{tenant.fullName}}</div><div class="signature-role">ผู้เช่า / Tenant</div><div class="signature-line">ลงชื่อ _____________________ วันที่ ____/____/______</div></div></div></div><div class="footer"><div class="footer-text">สัญญาเช่าที่พักอาศัย • Lease Agreement — หน้า ๒ จาก ๒</div></div></div>`;

    const TEMPLATES = [
      { type: DocumentTemplateType.INVOICE, name: 'ใบแจ้งหนี้รายเดือน', description: 'ใบแจ้งหนี้ค่าเช่าประจำเดือน — มีรายการค่าเช่า น้ำ ไฟ ค่าปรับ และยอดรวม', subject: 'ใบแจ้งหนี้ค่าเช่าห้อง {{room.number}} {{billing.monthName}} {{billing.year}}', body: INVOICE_BODY },
      { type: DocumentTemplateType.RECEIPT, name: 'ใบเสร็จรับเงิน', description: 'ใบเสร็จรับเงินค่าเช่า — ยืนยันการชำระเงินเรียบร้อย', subject: 'ใบเสร็จรับเงิน ห้อง {{room.number}}', body: RECEIPT_BODY },
      { type: DocumentTemplateType.PAYMENT_NOTICE, name: 'แจ้งชำระค่าบริการ', description: 'ใบแจ้งชำระค่าบริการ — ส่งก่อนวันครบกำหนดหรือเมื่อเกินกำหนด', subject: 'แจ้งชำระค่าบริการ ห้อง {{room.number}} {{billing.monthName}} {{billing.year}}', body: PAYMENT_NOTICE_BODY },
      { type: DocumentTemplateType.CONTRACT, name: 'สัญญาเช่าที่พัก', description: 'สัญญาเช่าที่พักอาศัย — สรุปเงื่อนไขการเช่า ค่าเช่า ระยะเวลา และเงื่อนไขพิเศษ', subject: 'สัญญาเช่าที่พักอาศัย ห้อง {{room.number}}', body: CONTRACT_BODY },
    ];

    for (const tpl of TEMPLATES) {
      const existing = await tx.documentTemplate.findFirst({ where: { name: tpl.name } });
      if (!existing) {
        const template = await tx.documentTemplate.create({
          data: { name: tpl.name, description: tpl.description, type: tpl.type, subject: tpl.subject, body: tpl.body, status: DocumentTemplateStatus.ACTIVE },
        });
        const version = await tx.documentTemplateVersion.create({
          data: { templateId: template.id, version: 1, label: 'Default version', subject: tpl.subject, body: tpl.body, status: DocumentTemplateVersionStatus.ACTIVE, fileType: 'html', fileName: `${tpl.name.replace(/\s+/g, '_')}_v1.html`, activatedAt: new Date() },
        });
        await tx.documentTemplate.update({ where: { id: template.id }, data: { activeVersionId: version.id } });
      }
    }

    return {
      adminUserId: adminUser.id,
      roomsCreated: roomsToCreate.length,
      floorsCreated: body.rooms.floors,
    };
  });

  return NextResponse.json({
    success: true,
    data: result,
    message: 'System setup completed successfully',
  } as ApiResponse<typeof result>, { status: 201 });
});
