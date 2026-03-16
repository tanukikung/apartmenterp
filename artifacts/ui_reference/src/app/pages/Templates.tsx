import { useState } from "react";
import { motion } from "motion/react";
import { Save, Eye, Plus, Trash2, FileText, Mail } from "lucide-react";

const placeholders = [
  { key: "{tenant_name}", label: "ชื่อผู้เช่า" },
  { key: "{room_number}", label: "หมายเลขห้อง" },
  { key: "{rent_amount}", label: "ค่าเช่า" },
  { key: "{due_date}", label: "วันครบกำหนด" },
  { key: "{invoice_id}", label: "เลขที่ใบแจ้งหนี้" },
  { key: "{billing_month}", label: "เดือนที่เรียกเก็บ" },
  { key: "{total_amount}", label: "ยอดรวม" },
  { key: "{payment_date}", label: "วันที่ชำระ" },
  { key: "{contract_start}", label: "วันเริ่มสัญญา" },
  { key: "{contract_end}", label: "วันสิ้นสุดสัญญา" },
];

const templates = [
  {
    id: 1,
    name: "Invoice Template",
    type: "invoice",
    description: "ใบแจ้งหนี้รายเดือน",
    lastModified: "2026-03-10",
  },
  {
    id: 2,
    name: "Payment Receipt",
    type: "receipt",
    description: "ใบเสร็จรับเงิน",
    lastModified: "2026-03-08",
  },
  {
    id: 3,
    name: "Payment Reminder",
    type: "email",
    description: "อีเมลแจ้งเตือนชำระเงิน",
    lastModified: "2026-03-05",
  },
  {
    id: 4,
    name: "Contract Agreement",
    type: "contract",
    description: "สัญญาเช่าห้อง",
    lastModified: "2026-02-20",
  },
];

export function Templates() {
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [content, setContent] = useState(`
<div style="padding: 40px; font-family: 'Sarabun', sans-serif;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="font-size: 24px; margin-bottom: 10px;">ใบแจ้งหนี้ค่าเช่า</h1>
    <p style="color: #666;">เลขที่: {invoice_id}</p>
  </div>
  
  <div style="margin-bottom: 30px;">
    <p><strong>ถึง:</strong> {tenant_name}</p>
    <p><strong>หมายเลขห้อง:</strong> {room_number}</p>
    <p><strong>เดือนที่เรียกเก็บ:</strong> {billing_month}</p>
  </div>
  
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
    <thead>
      <tr style="background: #f5f5f5;">
        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">รายการ</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 12px; border: 1px solid #ddd;">ค่าเช่าห้อง</td>
        <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">{rent_amount} บาท</td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">รวมทั้งสิ้น</td>
        <td style="padding: 12px; text-align: right; border: 1px solid #ddd; font-weight: bold;">{total_amount} บาท</td>
      </tr>
    </tbody>
  </table>
  
  <div style="margin-top: 30px;">
    <p><strong>กำหนดชำระ:</strong> {due_date}</p>
    <p style="color: #666; margin-top: 20px;">กรุณาชำระเงินภายในวันที่กำหนด ขอบคุณค่ะ</p>
  </div>
</div>
  `.trim());

  const [showPreview, setShowPreview] = useState(false);

  const insertPlaceholder = (placeholder: string) => {
    const textarea = document.getElementById("template-editor") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + placeholder + content.substring(end);
      setContent(newContent);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    }
  };

  const getPreviewContent = () => {
    return content
      .replace(/{tenant_name}/g, "田中太郎")
      .replace(/{room_number}/g, "301")
      .replace(/{rent_amount}/g, "70,000")
      .replace(/{due_date}/g, "2026-04-10")
      .replace(/{invoice_id}/g, "INV-2026-04-001")
      .replace(/{billing_month}/g, "เมษายน 2026")
      .replace(/{total_amount}/g, "70,000")
      .replace(/{payment_date}/g, "2026-04-01")
      .replace(/{contract_start}/g, "2023-05-01")
      .replace(/{contract_end}/g, "2025-04-30");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6"
    >
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Templates</h1>
          <p className="text-sm text-neutral-600">จัดการเทมเพลตเอกสารและอีเมล</p>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            {showPreview ? "แก้ไข" : "ดูตัวอย่าง"}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            บันทึก
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Template List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-3 bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50 flex justify-between items-center">
            <h2 className="font-semibold text-neutral-900">เทมเพลต</h2>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              className="text-blue-600 hover:bg-blue-50 p-1 rounded"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
          </div>
          <div className="divide-y divide-neutral-200">
            {templates.map((template, index) => (
              <motion.button
                key={template.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                whileHover={{ backgroundColor: "#f5f5f5" }}
                onClick={() => setSelectedTemplate(template)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  selectedTemplate.id === template.id ? "bg-blue-50 border-l-4 border-l-blue-600" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-neutral-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-neutral-900">{template.name}</div>
                    <div className="text-xs text-neutral-600">{template.description}</div>
                    <div className="text-xs text-neutral-500 mt-1">
                      แก้ไขล่าสุด: {template.lastModified}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Middle: Editor or Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-6 bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">{selectedTemplate.name}</h2>
          </div>
          {!showPreview ? (
            <div className="p-4">
              <textarea
                id="template-editor"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[600px] p-4 border border-neutral-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="พิมพ์เนื้อหาเทมเพลตที่นี่..."
              />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 overflow-auto h-[668px]"
            >
              <div className="border border-neutral-200 bg-white">
                <div dangerouslySetInnerHTML={{ __html: getPreviewContent() }} />
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Right: Placeholders */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-3 bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">Placeholders</h2>
            <p className="text-xs text-neutral-600 mt-1">คลิกเพื่อแทรกในเทมเพลต</p>
          </div>
          <div className="p-4 space-y-2">
            {placeholders.map((placeholder, index) => (
              <motion.button
                key={placeholder.key}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.03 }}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => insertPlaceholder(placeholder.key)}
                className="w-full px-3 py-2 bg-neutral-50 hover:bg-blue-50 border border-neutral-200 hover:border-blue-300 text-left rounded transition-all"
              >
                <div className="text-sm font-mono text-blue-600">{placeholder.key}</div>
                <div className="text-xs text-neutral-600">{placeholder.label}</div>
              </motion.button>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-neutral-300">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">การใช้งาน</h3>
            <div className="text-xs text-neutral-600 space-y-2">
              <p>• Placeholders จะถูกแทนที่ด้วยข้อมูลจริงเมื่อสร้างเอกสาร</p>
              <p>• รองรับ HTML สำหรับจัดรูปแบบ</p>
              <p>• กด "ดูตัวอย่าง" เพื่อดูผลลัพธ์</p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
