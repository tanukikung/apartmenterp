import { useState } from "react";
import { invoices } from "../utils/mockData";
import { Eye, Send, FileDown } from "lucide-react";
import { motion } from "motion/react";

export function Invoices() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredInvoices = statusFilter
    ? invoices.filter((inv) => inv.status === statusFilter)
    : invoices;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex justify-between items-center"
      >
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Invoices</h1>
          <p className="text-sm text-neutral-600">Invoice management and distribution</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          Create Invoice
        </motion.button>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-neutral-300 p-4 mb-4"
      >
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setStatusFilter(null)}
            className={`px-4 py-2 text-sm border ${
              statusFilter === null
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            All Status
          </motion.button>
          {["paid", "pending", "overdue"].map((status, index) => (
            <motion.button
              key={status}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 text-sm border ${
                statusFilter === status
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white border border-neutral-300"
      >
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Invoice ID</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Room</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Tenant</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Due Date</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice, index) => (
              <motion.tr
                key={invoice.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + index * 0.03 }}
                whileHover={{ backgroundColor: "#fafafa", x: 5 }}
                className="border-b border-neutral-200"
              >
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{invoice.id}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{invoice.room}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{invoice.tenant}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">¥{invoice.amount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{invoice.dueDate}</td>
                <td className="px-4 py-3 text-sm">
                  <motion.span
                    whileHover={{ scale: 1.05 }}
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      invoice.status === "paid" ? "bg-green-100 text-green-800" :
                      invoice.status === "overdue" ? "bg-red-100 text-red-800" :
                      "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {invoice.status}
                  </motion.span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                      title="Send via LINE"
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-1 text-neutral-600 hover:bg-neutral-100 rounded"
                      title="Download PDF"
                    >
                      <FileDown className="w-4 h-4" />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
}