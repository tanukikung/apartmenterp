export const rooms = [
  { id: "101", floor: 1, status: "occupied", tenant: "田中太郎", rent: 65000, lastPayment: "2026-03-01" },
  { id: "102", floor: 1, status: "occupied", tenant: "佐藤花子", rent: 65000, lastPayment: "2026-03-01" },
  { id: "103", floor: 1, status: "vacant", tenant: "-", rent: 65000, lastPayment: "-" },
  { id: "201", floor: 2, status: "occupied", tenant: "鈴木次郎", rent: 68000, lastPayment: "2026-03-02" },
  { id: "202", floor: 2, status: "occupied", tenant: "高橋美咲", rent: 68000, lastPayment: "2026-03-01" },
  { id: "203", floor: 2, status: "maintenance", tenant: "-", rent: 68000, lastPayment: "-" },
  { id: "301", floor: 3, status: "occupied", tenant: "伊藤健一", rent: 70000, lastPayment: "2026-03-01" },
  { id: "302", floor: 3, status: "occupied", tenant: "渡辺真理", rent: 70000, lastPayment: "2026-03-03" },
  { id: "303", floor: 3, status: "occupied", tenant: "山本愛", rent: 70000, lastPayment: "2026-02-28" },
  { id: "401", floor: 4, status: "occupied", tenant: "中村一郎", rent: 72000, lastPayment: "2026-03-01" },
  { id: "402", floor: 4, status: "vacant", tenant: "-", rent: 72000, lastPayment: "-" },
  { id: "403", floor: 4, status: "occupied", tenant: "小林由美", rent: 72000, lastPayment: "2026-03-01" },
];

export const tenants = [
  { id: "T001", name: "田中太郎", room: "101", phone: "090-1234-5678", lineStatus: "connected", contractStart: "2024-04-01", contractEnd: "2026-03-31" },
  { id: "T002", name: "佐藤花子", room: "102", phone: "080-2345-6789", lineStatus: "connected", contractStart: "2023-10-01", contractEnd: "2025-09-30" },
  { id: "T003", name: "鈴木次郎", room: "201", phone: "090-3456-7890", lineStatus: "not connected", contractStart: "2025-01-15", contractEnd: "2027-01-14" },
  { id: "T004", name: "高橋美咲", room: "202", phone: "080-4567-8901", lineStatus: "connected", contractStart: "2024-07-01", contractEnd: "2026-06-30" },
  { id: "T005", name: "伊藤健一", room: "301", phone: "090-5678-9012", lineStatus: "connected", contractStart: "2023-05-01", contractEnd: "2025-04-30" },
  { id: "T006", name: "渡辺真理", room: "302", phone: "080-6789-0123", lineStatus: "connected", contractStart: "2024-11-01", contractEnd: "2026-10-31" },
  { id: "T007", name: "山本愛", room: "303", phone: "090-7890-1234", lineStatus: "not connected", contractStart: "2025-02-01", contractEnd: "2027-01-31" },
  { id: "T008", name: "中村一郎", room: "401", phone: "080-8901-2345", lineStatus: "connected", contractStart: "2024-03-15", contractEnd: "2026-03-14" },
  { id: "T009", name: "小林由美", room: "403", phone: "090-9012-3456", lineStatus: "connected", contractStart: "2025-01-01", contractEnd: "2026-12-31" },
];

export const invoices = [
  { id: "INV-2026-03-001", room: "101", tenant: "田中太郎", amount: 65000, status: "paid", dueDate: "2026-03-10" },
  { id: "INV-2026-03-002", room: "102", tenant: "佐藤花子", amount: 65000, status: "paid", dueDate: "2026-03-10" },
  { id: "INV-2026-03-003", room: "201", tenant: "鈴木次郎", amount: 68000, status: "overdue", dueDate: "2026-03-10" },
  { id: "INV-2026-03-004", room: "202", tenant: "高橋美咲", amount: 68000, status: "paid", dueDate: "2026-03-10" },
  { id: "INV-2026-03-005", room: "301", tenant: "伊藤健一", amount: 70000, status: "paid", dueDate: "2026-03-10" },
  { id: "INV-2026-03-006", room: "302", tenant: "渡辺真理", amount: 70000, status: "pending", dueDate: "2026-03-10" },
  { id: "INV-2026-03-007", room: "303", tenant: "山本愛", amount: 70000, status: "overdue", dueDate: "2026-03-10" },
  { id: "INV-2026-03-008", room: "401", tenant: "中村一郎", amount: 72000, status: "paid", dueDate: "2026-03-10" },
  { id: "INV-2026-03-009", room: "403", tenant: "小林由美", amount: 72000, status: "paid", dueDate: "2026-03-10" },
];

export const payments = [
  { id: "PAY-001", date: "2026-03-01", room: "101", tenant: "田中太郎", amount: 65000, method: "Bank Transfer", invoice: "INV-2026-03-001" },
  { id: "PAY-002", date: "2026-03-01", room: "102", tenant: "佐藤花子", amount: 65000, method: "Bank Transfer", invoice: "INV-2026-03-002" },
  { id: "PAY-003", date: "2026-03-02", room: "201", tenant: "鈴木次郎", amount: 68000, method: "Bank Transfer", invoice: "INV-2026-03-003" },
  { id: "PAY-004", date: "2026-03-01", room: "202", tenant: "高橋美咲", amount: 68000, method: "Cash", invoice: "INV-2026-03-004" },
  { id: "PAY-005", date: "2026-03-01", room: "301", tenant: "伊藤健一", amount: 70000, method: "Bank Transfer", invoice: "INV-2026-03-005" },
  { id: "PAY-006", date: "2026-03-03", room: "302", tenant: "渡辺真理", amount: 70000, method: "Bank Transfer", invoice: "INV-2026-03-006" },
];

export const maintenanceTickets = [
  { id: "MT-001", room: "203", issue: "Water leak in bathroom", priority: "high", status: "in-progress", assignedStaff: "山田修理", createdDate: "2026-03-12" },
  { id: "MT-002", room: "301", issue: "Air conditioner not cooling", priority: "medium", status: "pending", assignedStaff: "-", createdDate: "2026-03-13" },
  { id: "MT-003", room: "102", issue: "Door lock malfunction", priority: "high", status: "completed", assignedStaff: "佐々木工務", createdDate: "2026-03-10" },
  { id: "MT-004", room: "401", issue: "Window screen damaged", priority: "low", status: "pending", assignedStaff: "-", createdDate: "2026-03-14" },
  { id: "MT-005", room: "203", issue: "Light fixture replacement", priority: "medium", status: "in-progress", assignedStaff: "山田修理", createdDate: "2026-03-11" },
];

export const chatConversations = [
  { id: "C001", tenant: "田中太郎", room: "101", lastMessage: "ありがとうございます", timestamp: "2026-03-14 14:30", unread: 0 },
  { id: "C002", tenant: "高橋美咲", room: "202", lastMessage: "請求書を確認しました", timestamp: "2026-03-14 11:20", unread: 0 },
  { id: "C003", tenant: "伊藤健一", room: "301", lastMessage: "エアコンの調子が悪いです", timestamp: "2026-03-13 16:45", unread: 2 },
  { id: "C004", tenant: "渡辺真理", room: "302", lastMessage: "来月の支払いについて", timestamp: "2026-03-13 09:15", unread: 1 },
  { id: "C005", tenant: "佐藤花子", room: "102", lastMessage: "了解しました", timestamp: "2026-03-12 18:30", unread: 0 },
];

export const revenueData = [
  { month: "Sep", revenue: 680000 },
  { month: "Oct", revenue: 720000 },
  { month: "Nov", revenue: 710000 },
  { month: "Dec", revenue: 750000 },
  { month: "Jan", revenue: 730000 },
  { month: "Feb", revenue: 760000 },
  { month: "Mar", revenue: 740000 },
];

export const auditLogs = [
  { id: 1, timestamp: "2026-03-14 15:23:11", user: "admin@example.com", action: "UPDATE", entity: "Invoice", details: "Updated invoice INV-2026-03-003 status to overdue" },
  { id: 2, timestamp: "2026-03-14 14:45:02", user: "admin@example.com", action: "CREATE", entity: "Payment", details: "Created payment PAY-006 for room 302" },
  { id: 3, timestamp: "2026-03-14 13:30:55", user: "staff@example.com", action: "UPDATE", entity: "Maintenance", details: "Assigned ticket MT-001 to 山田修理" },
  { id: 4, timestamp: "2026-03-14 11:20:33", user: "admin@example.com", action: "CREATE", entity: "Invoice", details: "Generated invoices for March 2026 billing cycle" },
  { id: 5, timestamp: "2026-03-13 16:50:14", user: "admin@example.com", action: "CREATE", entity: "Maintenance", details: "Created maintenance ticket MT-002" },
  { id: 6, timestamp: "2026-03-13 09:15:22", user: "staff@example.com", action: "UPDATE", entity: "Room", details: "Updated room 203 status to maintenance" },
  { id: 7, timestamp: "2026-03-12 17:05:48", user: "admin@example.com", action: "DELETE", entity: "Tenant", details: "Removed tenant from room 103" },
];
