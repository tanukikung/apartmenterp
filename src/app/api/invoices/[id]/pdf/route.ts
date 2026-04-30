import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { documentTemplateHtmlToText, substituteInvoiceTemplateFields } from '@/lib/templates/document-template';
import { requireOperatorOrSignedInvoiceAccess } from '@/lib/invoices/access';
import { buildInvoiceHtml } from '@/modules/invoices/pdf-html';
import { htmlToPdfBuffer } from '@/lib/puppeteer';

// ── GET /api/invoices/[id]/pdf ─────────────────────────────────────────────
// Intentionally public — tenant-facing PDF links delivered via LINE do not
// require an admin session.  Invoice IDs are non-guessable UUIDs; the admin
// JSON detail endpoint (/api/invoices/[id]) is separately auth-gated.
//
// Generates a PDF for the invoice.  Looks up the most-recently-updated INVOICE
// DocumentTemplate and injects its body as a Notes / Terms section.
// Template lineage is exposed via response headers and structured logs so the
// exact template version applied is traceable without storing the full PDF.

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const { id } = params;
    requireOperatorOrSignedInvoiceAccess(req, id, 'pdf');

    logger.info({ type: 'pdf_render_start', invoiceId: id });

    const { invoiceService } = getServiceContainer();

    // Fetch preview + building profile + document template in parallel
    const [preview, configs, template] = await Promise.all([
      invoiceService.getInvoicePreview(id),
      prisma.config.findMany({
        where: {
          key: {
            in: [
              'building.name', 'building.address', 'building.phone', 'building.taxId',
              'app.name',
            ],
          },
        },
      }),
      prisma.documentTemplate.findFirst({
        where: { type: 'INVOICE', status: 'ACTIVE', activeVersionId: { not: null } },
        include: { activeVersion: true },
      }),
    ]);

    // Guard: cancelled invoices cannot have their PDF regenerated — return 410 Gone
    // to prevent tenant confusion and unnecessary Puppeteer resource usage.
    if (preview.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'This invoice has been cancelled and cannot generate a PDF' },
        { status: 410 }
      );
    }

    // Fetch the room's default bank account (sequential — needs preview.roomNo first)
    const roomAccount = await prisma.room.findUnique({
      where: { roomNo: preview.roomNo },
      select: { defaultAccountId: true },
    }).then(r => r?.defaultAccountId
      ? prisma.bankAccount.findUnique({ where: { id: r.defaultAccountId } })
      : prisma.bankAccount.findFirst({ where: { active: true } }),
    );

    const cfgStr = (key: string) => {
      const row = configs.find(c => c.key === key);
      return row ? String(row.value ?? '').trim() : '';
    };

    const building = {
      // building.name takes priority; fall back to app.name if not set
      name:    cfgStr('building.name') || cfgStr('app.name') || null,
      address: cfgStr('building.address') || null,
      phone:   cfgStr('building.phone')   || null,
      taxId:   cfgStr('building.taxId')   || null,
    };

    if (template) {
      logger.info({
        type: 'pdf_template_selected',
        invoiceId: id,
        templateId: template.id,
        templateName: template.name,
        templateUpdatedAt: template.updatedAt,
      });
    } else {
      logger.info({ type: 'pdf_template_none', invoiceId: id });
    }

    let pdfBytes: Uint8Array;
    try {
      const notes = (() => {
        if (!template?.activeVersion?.body && !template?.body) return undefined;
        const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const periodLabel = `${THAI_MONTHS[preview.month] ?? ''} ${preview.year + 543}`;
        const dt = new Date(preview.dueDate);
        const dueDateLabel = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()+543}`;
        const totalFormatted = `฿${preview.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        const substituted = substituteInvoiceTemplateFields(template.activeVersion?.body ?? template.body, {
          roomNo: preview.roomNo,
          floorNo: preview.floorNo,
          tenantName: preview.tenantName,
          tenantPhone: preview.tenantPhone,
          periodLabel,
          dueDateLabel,
          totalFormatted,
          items: preview.items,
        });
        return documentTemplateHtmlToText(substituted);
      })();

      const { html } = await buildInvoiceHtml(preview, {
        notes,
        building,
        bankAccount: roomAccount ? {
          bankName: roomAccount.bankName || null,
          accountNo: roomAccount.bankAccountNo || null,
          accountName: roomAccount.name || null,
        } : undefined,
        promptpayNumber: roomAccount?.promptpay || undefined,
        paymentPolicy: {
          lateFeeFloor1: 'ห้องชั้น 1 และห้องแอร์: 200 บาท/วัน',
          lateFeeRegular: 'ห้องชั้น 2–8 ทั่วไป: 100 บาท/วัน',
          payByDay: 'ชำระค่าบริการภายในวันที่ 1–7 ของเดือน',
          slipRequired: 'ส่งสลิปยืนยันการโอนเงินผ่าน LINE',
          wrongAmountFine: 'ชำระไม่ครบ จะปรับ 100 บาท/ครั้ง',
          cutoffDay8: 'วันที่ 8: ตัดน้ำ-ไฟ และยึดคืนห้อง 08:00 น.',
        },
        leaseRules: [
          '1. ผู้เช่าต้องชำระค่าบริการประจำเดือนภายในวันที่ 1–7 โดยโอนเงินตรงตามยอดในใบแจ้งหนี้ และส่งสลิปยืนยันทาง LINE ภายในกำหนด',
          '2. หากไม่ชำระค่าบริการภายในวันที่ 7 ถือว่าท่านสละสิทธิ์การเช่า ทางอพาร์ทเม้นท์จะระงับการใช้น้ำ-ไฟ และเรียกห้องพักคืนภายในวันที่ 8 เวลา 08:00 น.',
          '3. ผู้เช่าที่ประสงค์ขอเลื่อนชำระ (โอนได้ถึงวันที่ 15) ต้องชำระค่าปรับเพิ่ม ดังนี้ — ห้องชั้น 1 และห้องแอร์ 200 บาท/วัน, ห้องชั้น 2–8 จำนวน 100 บาท/วัน (นับตั้งแต่วันที่ 8 จนถึงวันที่ชำระครบ)',
          '4. ผู้เช่าที่โอนเงินแล้วแต่ไม่ส่งสลิปยืนยันทาง LINE ภายในกำหนด ต้องชำระค่าปรับ 100 บาทต่อครั้ง',
          '5. กรณีโอนเงินผิดจำนวน (ไม่ตรงตามยอดในใบแจ้งหนี้) ต้องชำระค่าปรับ 100 บาท และโอนส่วนที่ขาดเพิ่มให้ครบภายในวันที่ 7 มิฉะนั้นจะถูกปรับตามข้อ 3',
          '6. การโอนเงินผิดบัญชีถือเป็นความรับผิดชอบของผู้เช่าเอง อพาร์ทเม้นท์ไม่รับผิดชอบใดๆ ทั้งสิ้น',
        ],
      });

      const invoiceNumber = preview.invoiceNumber || `INV-${preview.year}${String(preview.month).padStart(2, '0')}-${preview.roomNo}`;
      pdfBytes = await htmlToPdfBuffer(html, {
        title: invoiceNumber,
        pageSize: 'A4',
        orientation: 'portrait',
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
        printBackground: true,
        scale: 1,
      });
    } catch (err) {
      logger.error({
        type: 'pdf_render_failure',
        invoiceId: id,
        templateId: template?.id ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // re-throw — asyncHandler converts to 500
    }

    logger.info({
      type: 'pdf_render_success',
      invoiceId: id,
      templateId: template?.id ?? null,
      sizeBytes: pdfBytes.length,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="invoice_${id}.pdf"`,
        'cache-control': 'no-store',
        // Expose template lineage in response headers for audit/debug.
        // x-document-template-updated-at lets callers detect template edits
        // made after this PDF was first sent.
        ...(template ? {
          'x-document-template-id': template.id,
          'x-document-template-updated-at': template.updatedAt.toISOString(),
        } : {}),
      },
    });
  }
);
