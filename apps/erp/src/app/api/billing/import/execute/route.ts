import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import { parseBillingWorkbookDetailed } from '@/modules/billing/import-parser';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Missing file', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 }
    );
  }

  const yearRaw = form.get('year');
  const monthRaw = form.get('month');
  const buildingId = (form.get('buildingId') as string | null) ?? 'seed-building-main';

  const arrayBuffer = await file.arrayBuffer();
  const { rows: parsed } = parseBillingWorkbookDetailed(new Uint8Array(arrayBuffer));

  // Determine year/month from form or from parsed rows
  const year = yearRaw ? Number(yearRaw) : (parsed[0]?.year ?? new Date().getFullYear());
  const month = monthRaw ? Number(monthRaw) : (parsed[0]?.month ?? (new Date().getMonth() + 1));

  // 1. Ensure BillingCycle exists
  const billingDate = new Date(year, month - 1, 1);
  const dueDate = new Date(year, month - 1, 5);
  const overdueDate = new Date(year, month - 1, 15);

  const cycle = await prisma.billingCycle.upsert({
    where: { buildingId_year_month: { buildingId, year, month } },
    update: {},
    create: {
      buildingId,
      year,
      month,
      billingDate,
      dueDate,
      overdueDate,
      status: 'OPEN',
    },
  });

  // 2. Create import batch
  const batch = await prisma.billingImportBatch.create({
    data: {
      billingCycleId: cycle.id,
      sourceFilename: file.name,
      status: 'UPLOADED',
      totalRows: parsed.length,
    },
  });

  // 3. Stage rows into billing_import_rows
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    const room = await prisma.room.findFirst({ where: { roomNumber: r.roomNumber } });
    const contract = room
      ? await prisma.contract.findFirst({ where: { roomId: room.id, status: 'ACTIVE' } })
      : null;

    const isValid = !!room;
    if (isValid) validCount++; else invalidCount++;

    const amount = r.quantity * r.unitPrice;

    await prisma.billingImportRow.create({
      data: {
        batchId: batch.id,
        rowNo: i + 1,
        roomNumber: r.roomNumber,
        tenantName: r.description ?? null,
        totalAmount: amount,
        validationStatus: isValid ? 'VALID' : 'ERROR',
        validationErrorsJson: isValid ? null : [{ field: 'roomNumber', message: `Room ${r.roomNumber} not found`, code: 'ROOM_NOT_FOUND' }],
        matchedRoomId: room?.id ?? null,
        matchedContractId: contract?.id ?? null,
        parsedJson: JSON.parse(JSON.stringify(r)),
      },
    });
  }

  // Update batch with counts and status
  await prisma.billingImportBatch.update({
    where: { id: batch.id },
    data: { status: 'VALIDATED', validRows: validCount, invalidRows: invalidCount },
  });

  // 4. Commit valid rows to billing_records
  const billingService = getBillingService();
  const result = await billingService.importBillingRowsWithBatch(parsed, batch.id, cycle.id);

  // 5. Mark batch as IMPORTED
  await prisma.billingImportBatch.update({
    where: { id: batch.id },
    data: { status: 'IMPORTED', importedAt: new Date() },
  });

  // Update cycle status
  await prisma.billingCycle.update({
    where: { id: cycle.id },
    data: { status: 'IMPORTED' },
  });

  return NextResponse.json({
    success: true,
    data: { ...result, batchId: batch.id, cycleId: cycle.id },
  } as ApiResponse<typeof result & { batchId: string; cycleId: string }>);
});
