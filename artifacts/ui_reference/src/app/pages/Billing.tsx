import { Upload, Eye, FileDown } from "lucide-react";

const billings = [
  { id: "B-2026-03", month: "March 2026", roomsBilled: 10, totalAmount: 740000, status: "completed" },
  { id: "B-2026-02", month: "February 2026", roomsBilled: 11, totalAmount: 760000, status: "completed" },
  { id: "B-2026-01", month: "January 2026", roomsBilled: 10, totalAmount: 730000, status: "completed" },
  { id: "B-2025-12", month: "December 2025", roomsBilled: 11, totalAmount: 750000, status: "completed" },
  { id: "B-2025-11", month: "November 2025", roomsBilled: 10, totalAmount: 710000, status: "completed" },
];

export function Billing() {
  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Billing</h1>
          <p className="text-sm text-neutral-600">Manage monthly billing imports</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Import Excel
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Billing Import Instructions</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Upload an Excel file containing room numbers, amounts, and billing details</li>
          <li>• The system will automatically generate invoices for each entry</li>
          <li>• Review the preview before confirming the import</li>
        </ul>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-300">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Billing ID</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Billing Month</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Rooms Billed</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Total Amount</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {billings.map((billing) => (
              <tr key={billing.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{billing.id}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{billing.month}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{billing.roomsBilled}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">¥{billing.totalAmount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                    {billing.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <button className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-neutral-600 hover:bg-neutral-100 rounded" title="Export">
                      <FileDown className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
