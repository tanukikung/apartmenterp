import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getLineClient, isLineConfigured } from '@/lib/line';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * LINE Rich Menu sizes for different contexts.
 * width × height must be 2500×843 or smaller per LINE spec.
 */
const RICH_MENU_SIZE = { width: 2500, height: 843 };

/**
 * A simple tap-area covering the full menu.
 * label+chatText are metadata only — not shown on the UI.
 */
function _fullAreaAction(areaIndex: number): object {
  return {
    bounds: { x: 0, y: 0, width: 2500, height: 843 },
    action: {
      type: 'postback',
      label: `menu${areaIndex}`,
      data: `action=menu&area=${areaIndex}`,
    },
  };
}

/**
 * Build the "ดูยอดค้าง" rich menu JSON.
 *
 * Layout (2500w × 843h, 2 rows × 2 cols):
 *   [   ดูยอดค้าง   ] [  ยืนยันชำระเงิน  ]
 *   [  ดูใบแจ้งหนี้   ] [   ส่งใบเสร็จ     ]
 *
 * Each cell is 1250 × 421 (half height for 2 rows).
 */
function buildBalanceRichMenuBody(): object {
  return {
    size: RICH_MENU_SIZE,
    selected: false,
    name: 'เมนูหลัก - ยอดค้าง',
    chatBarText: 'เมนูหลัก',
    areas: [
      // Top-left: ดูยอดค้าง
      {
        bounds: { x: 0, y: 0, width: 1250, height: 421 },
        action: {
          type: 'message',
          label: 'ดูยอดค้าง',
          text: 'ยอดค้าง',
        },
      },
      // Top-right: ยืนยันชำระเงิน
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 421 },
        action: {
          type: 'postback',
          label: 'ยืนยันชำระเงิน',
          data: 'action=confirm_payment_inquiry',
        },
      },
      // Bottom-left: ดูใบแจ้งหนี้ → triggers balance inquiry then user selects invoice
      {
        bounds: { x: 0, y: 421, width: 1250, height: 422 },
        action: {
          type: 'postback',
          label: 'ดูใบแจ้งหนี้',
          data: 'action=view_invoice_menu',
        },
      },
      // Bottom-right: ส่งใบเสร็จ → triggers balance inquiry then user selects receipt
      {
        bounds: { x: 1250, y: 421, width: 1250, height: 422 },
        action: {
          type: 'postback',
          label: 'ส่งใบเสร็จ',
          data: 'action=send_receipt_menu',
        },
      },
    ],
  };
}

async function createOrUpdateRichMenu(
  client: ReturnType<typeof getLineClient>,
  body: object
): Promise<string> {
  // List existing menus to find one with the same name (idempotent)
  const existing = await client.getRichMenuList();
  const match = (existing as Array<{ richMenuId: string; name: string }>).find(
    (m) => m.name === (body as { name: string }).name
  );
  if (match) {
    // Delete existing menu - we can't update it directly
    await client.deleteRichMenu(match.richMenuId);
  }
  // Create new menu
  const menuId = await client.createRichMenu(body as never);
  return menuId;
}

/**
 * POST /api/line/rich-menu
 * Creates or updates the LINE rich menu for balance inquiry.
 * Requires ADMIN role.
 */
export const POST = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'OWNER']);

    if (!isLineConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'LINE_NOT_CONFIGURED', message: 'LINE is not configured' },
        } as ApiResponse<unknown>,
        { status: 503 }
      );
    }

    const client = getLineClient();
    const menuBody = buildBalanceRichMenuBody();
    const menuId = await createOrUpdateRichMenu(client, menuBody);

    // Optionally link to all users (default rich menu)
    try {
      await client.setDefaultRichMenu(menuId);
    } catch (err) {
      logger.warn({ type: 'rich_menu_set_default_failed', menuId, error: (err as Error).message });
    }

    logger.info({ type: 'rich_menu_created', menuId });

    return NextResponse.json({
      success: true,
      data: { menuId, name: (menuBody as { name: string }).name },
    } as ApiResponse<{ menuId: string; name: string }>);
  }
);

/**
 * DELETE /api/line/rich-menu
 * Deletes the balance inquiry rich menu.
 * Requires ADMIN role.
 */
export const DELETE = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'OWNER']);

    if (!isLineConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'LINE_NOT_CONFIGURED', message: 'LINE is not configured' },
        } as ApiResponse<unknown>,
        { status: 503 }
      );
    }

    const client = getLineClient();
    const existing = await client.getRichMenuList();
    for (const menu of existing as Array<{ richMenuId: string; name: string }>) {
      if (menu.name === 'เมนูหลัก - ยอดค้าง') {
        await client.deleteRichMenu(menu.richMenuId);
        logger.info({ type: 'rich_menu_deleted', menuId: menu.richMenuId });
        break;
      }
    }

    return NextResponse.json({ success: true, data: {} } as ApiResponse<unknown>);
  }
);
