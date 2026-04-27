/**
 * User Journey Groups
 * Organized by business goal — for non-technical users
 */

export interface JourneyGroup {
  id: string;
  emoji: string;
  title: string;
  description: string;
  flowIds: string[];
}

export const JOURNEY_GROUPS: JourneyGroup[] = [
  {
    id: 'billing-cycle',
    emoji: '💰',
    title: 'วงจรบิลประจำเดือน',
    description: 'นำเข้าข้อมูลมิเตอร์ → คำนวณค่าบริการ → วางบิล → ส่งให้ผู้เช่า → ติดตาม',
    flowIds: ['billing-monthly', 'reminders-overdue', 'line-messaging', 'system-jobs'],
  },
  {
    id: 'payment-receipt',
    emoji: '💳',
    title: 'รับชำระค่าเช่า',
    description: 'ผู้เช่าชำระเงิน → อัพโหลดสมุด → ระบบจับคู่กับ invoice → ยืนยัน',
    flowIds: ['payment-matching'],
  },
  {
    id: 'tenant-lifecycle',
    emoji: '👥',
    title: 'วงจรผู้เช่า',
    description: 'ลงทะเบียน → มอบห้อง → อยู่อาศัย → ย้ายออก → คืนเงินประกัน',
    flowIds: ['tenant-registration', 'moveout'],
  },
  {
    id: 'maintenance-flow',
    emoji: '🔧',
    title: 'แจ้งซ่อม',
    description: 'ผู้เช่าแจ้งซ่อมทาง LINE → admin รับเรื่อง → assign → ปิดงาน',
    flowIds: ['maintenance'],
  },
  {
    id: 'documents-flow',
    emoji: '📄',
    title: 'เอกสาร & เทมเพลต',
    description: 'สร้างเทมเพลต → generate PDF → ส่ง LINE หรือพิมพ์',
    flowIds: ['document-gen'],
  },
  {
    id: 'line-integration',
    emoji: '📱',
    title: 'LINE Integration',
    description: 'รับข้อความจากผู้เช่า → ตอบอัตโนมัติ → rich menu',
    flowIds: ['line-webhook', 'line-rich-menu', 'line-chat-reply'],
  },
  {
    id: 'system-ops',
    emoji: '⚙️',
    title: 'การดูแลระบบ',
    description: 'monitoring, health, backup, cron jobs, setup wizard',
    flowIds: ['system-jobs', 'health-check', 'setup-wizard', 'sse-notifications'],
  },
  {
    id: 'auth',
    emoji: '🔐',
    title: 'การเข้าสู่ระบบ',
    description: 'login, session, middleware, protected routes',
    flowIds: ['auth'],
  },
  {
    id: 'contracts',
    emoji: '📝',
    title: 'สัญญาเช่า',
    description: 'สร้างสัญญา → ต่ออายุ → ยกเลิก',
    flowIds: ['contract-renewal'],
  },
  {
    id: 'messaging',
    emoji: '📢',
    title: 'สื่อสารกับผู้เช่า',
    description: 'ส่งข้อความถึงทุกห้องพร้อมกัน / ตอบแชทเฉพาะคน',
    flowIds: ['broadcast', 'line-chat-reply'],
  },
];