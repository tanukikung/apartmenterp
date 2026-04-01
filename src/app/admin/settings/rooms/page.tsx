import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function SettingsRoomsPage() {
  return (
    <UnavailableFeaturePage
      title="ตั้งค่าห้องพัก"
      subtitle="การติดตั้งนี้ไม่มี API สำหรับตั้งค่าค่าเริ่มต้นของห้อง"
      backHref="/admin/settings"
      backLabel="ตั้งค่า"
      message="การตั้งค่าห้องพักถูกปิดใช้งานโดยตั้งใจ"
      detail="ค่าความจุห้องเริ่มต้น การอนุมัติคืนห้อง และค่าล็อกการซ่อมบำรุงไม่ได้ถูกบันทึกไว้ในระบบแบ็กเอนด์ปัจจุบัน แบบฟอร์มบันทึกที่ทำให้เข้าใจผิดได้ถูกลบออกแล้ว"
      relatedLinks={[
        { href: '/admin/rooms', label: 'ห้องพัก' },
        { href: '/admin/settings', label: 'การตั้งค่าที่เชื่อมต่อ' },
      ]}
    />
  );
}
