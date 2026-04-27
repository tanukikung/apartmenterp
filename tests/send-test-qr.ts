/**
 * Upload QR image to LINE CDN then send flex message with QR imageId
 */
import { bootstrapMessagingRuntime } from '../src/modules/messaging/bootstrap';
import { sendInvoiceMessage } from '../src/modules/messaging/lineTemplates';
import { buildPromptPayQrDataUrl } from '../src/modules/invoices/emv-qr';
import { uploadContentToLine } from '../src/lib/line/client';
import { prisma } from '../src/lib/db/client';

const LINE_USER_ID = 'U2bc1b2cb10ae97cff81ef0b494ee9962';

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         UPLOAD QR + SEND FLEX TEST              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // STEP 1: Generate QR
  console.log('📋 STEP 1: Generate PromptPay QR...');
  const qrDataUrl = await buildPromptPayQrDataUrl('0962979152', 5500);
  const base64 = qrDataUrl.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');
  console.log(`✓ QR generated: ${buffer.length} bytes\n`);

  // STEP 2: Upload to LINE CDN
  console.log('📋 STEP 2: Upload to LINE CDN...');
  const imageId = await uploadContentToLine(buffer, 'image/png');
  console.log(`✓ imageId: ${imageId}\n`);

  // STEP 3: Bootstrap
  console.log('📋 STEP 3: Bootstrap messaging runtime...');
  await bootstrapMessagingRuntime({ allowInTest: true });
  console.log('✓ Done\n');

  // STEP 4: Send flex message with imageId
  console.log('📋 STEP 4: Send flex with QR image...');
  const result = await sendInvoiceMessage(LINE_USER_ID, {
    roomNumber: 'TEST',
    amount: '฿5,500.00',
    dueDate: '30 เม.ย. 2569',
    invoiceNumber: 'TEST1234',
    bankAccountNo: '9662979152',
    bankName: 'PromptPay',
    bankAccountName: 'อพาร์ตเมนต์',
    qrImageId: imageId,
  });
  console.log('✓ Result:', JSON.stringify(result));
  console.log('\n✅ Done!');

  await prisma.$disconnect();
}

main().catch(console.error);
