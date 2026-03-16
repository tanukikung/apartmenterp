import { DollarSign, Users, AlertCircle, Wrench } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { revenueData } from "../utils/mockData";
import { motion } from "motion/react";

const kpiCards = [
  { label: "Occupancy Rate", value: "83.3%", icon: Users, trend: "+2.5%", color: "text-blue-600" },
  { label: "Monthly Revenue", value: "¥740,000", icon: DollarSign, trend: "-2.6%", color: "text-green-600" },
  { label: "Overdue Invoices", value: "2", icon: AlertCircle, trend: "+1", color: "text-orange-600" },
  { label: "Open Tickets", value: "3", icon: Wrench, trend: "-2", color: "text-purple-600" },
];

const recentPayments = [
  { date: "2026-03-03", tenant: "渡辺真理", room: "302", amount: "¥70,000" },
  { date: "2026-03-02", tenant: "鈴木次郎", room: "201", amount: "¥68,000" },
  { date: "2026-03-01", tenant: "田中太郎", room: "101", amount: "¥65,000" },
  { date: "2026-03-01", tenant: "佐藤花子", room: "102", amount: "¥65,000" },
  { date: "2026-03-01", tenant: "高橋美咲", room: "202", amount: "¥68,000" },
];

const recentMessages = [
  { tenant: "伊藤健一", room: "301", message: "エアコンの調子が悪いです", time: "2h ago" },
  { tenant: "渡辺真理", room: "302", message: "来月の支払いについて", time: "1d ago" },
  { tenant: "高橋美咲", room: "202", message: "請求書を確認しました", time: "1d ago" },
];

const maintenanceAlerts = [
  { room: "203", issue: "Water leak in bathroom", priority: "High", status: "In Progress" },
  { room: "301", issue: "Air conditioner not cooling", priority: "Medium", status: "Pending" },
  { room: "401", issue: "Window screen damaged", priority: "Low", status: "Pending" },
];

export function Dashboard() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-600">Building status overview</p>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5, boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}
              className="bg-white border border-neutral-300 p-4 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-sm text-neutral-600">{kpi.label}</div>
                <motion.div
                  whileHover={{ scale: 1.2, rotate: 360 }}
                  transition={{ duration: 0.5 }}
                >
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </motion.div>
              </div>
              <div className="text-2xl font-semibold text-neutral-900 mb-1">{kpi.value}</div>
              <div className="text-sm text-neutral-500">{kpi.trend} from last month</div>
            </motion.div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white border border-neutral-300 p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Revenue Trend</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="month" stroke="#737373" />
            <YAxis stroke="#737373" />
            <Tooltip />
            <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Activity Panels */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recent Payments */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300">
            <h3 className="font-semibold text-neutral-900">Recent Payments</h3>
          </div>
          <div className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-600 border-b border-neutral-200">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Tenant</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.05 }}
                    whileHover={{ backgroundColor: "#f5f5f5" }}
                    className="border-b border-neutral-100"
                  >
                    <td className="py-2 text-neutral-600">{payment.date}</td>
                    <td className="py-2 text-neutral-900">{payment.tenant}</td>
                    <td className="py-2 text-right text-neutral-900">{payment.amount}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Recent Messages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300">
            <h3 className="font-semibold text-neutral-900">Recent Messages</h3>
          </div>
          <div className="p-4 space-y-3">
            {recentMessages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.05 }}
                whileHover={{ scale: 1.02, x: 5 }}
                className="pb-3 border-b border-neutral-100 last:border-0 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-neutral-900">{msg.tenant}</span>
                  <span className="text-xs text-neutral-500">{msg.time}</span>
                </div>
                <p className="text-sm text-neutral-600">{msg.message}</p>
                <span className="text-xs text-neutral-500">Room {msg.room}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Maintenance Alerts */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300">
            <h3 className="font-semibold text-neutral-900">Maintenance Alerts</h3>
          </div>
          <div className="p-4 space-y-3">
            {maintenanceAlerts.map((alert, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.05 }}
                whileHover={{ scale: 1.02, x: -5 }}
                className="pb-3 border-b border-neutral-100 last:border-0 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-neutral-900">Room {alert.room}</span>
                  <motion.span
                    whileHover={{ scale: 1.1 }}
                    className={`text-xs px-2 py-0.5 rounded ${
                      alert.priority === "High"
                        ? "bg-red-100 text-red-700"
                        : alert.priority === "Medium"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {alert.priority}
                  </motion.span>
                </div>
                <p className="text-sm text-neutral-600 mb-1">{alert.issue}</p>
                <span className="text-xs text-neutral-500">{alert.status}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}