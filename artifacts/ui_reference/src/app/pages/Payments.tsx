import { Upload, CheckCircle2, AlertCircle } from "lucide-react";

const bankStatements = [
  { date: "2026-03-01", amount: 65000, name: "タナカ タロウ", matched: true, invoice: "INV-2026-03-001" },
  { date: "2026-03-01", amount: 65000, name: "サトウ ハナコ", matched: true, invoice: "INV-2026-03-002" },
  { date: "2026-03-02", amount: 68000, name: "スズキ ジロウ", matched: true, invoice: "INV-2026-03-003" },
  { date: "2026-03-01", amount: 68000, name: "タカハシ ミサキ", matched: true, invoice: "INV-2026-03-004" },
  { date: "2026-03-03", amount: 50000, name: "ヤマモト", matched: false, invoice: "-" },
  { date: "2026-03-01", amount: 70000, name: "イトウ ケンイチ", matched: true, invoice: "INV-2026-03-005" },
];

export function Payments() {
  const matchedCount = bankStatements.filter((s) => s.matched).length;
  const unmatchedCount = bankStatements.filter((s) => !s.matched).length;

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Payments</h1>
          <p className="text-sm text-neutral-600">Review payment matching</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload Bank Statement
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">Total Transactions</div>
          <div className="text-2xl font-semibold text-neutral-900">{bankStatements.length}</div>
        </div>
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">Matched Payments</div>
          <div className="text-2xl font-semibold text-green-600">{matchedCount}</div>
        </div>
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">Unmatched Payments</div>
          <div className="text-2xl font-semibold text-orange-600">{unmatchedCount}</div>
        </div>
      </div>

      {/* Two Panel Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Bank Statements */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">Bank Statements</h2>
          </div>
          <div className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-600 border-b border-neutral-200">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {bankStatements.map((statement, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-700">{statement.date}</td>
                    <td className="py-3 text-neutral-900">{statement.name}</td>
                    <td className="py-3 text-right text-neutral-900">¥{statement.amount.toLocaleString()}</td>
                    <td className="py-3 text-center">
                      {statement.matched ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 inline" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-orange-600 inline" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Invoice Matches */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">Invoice Matches</h2>
          </div>
          <div className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-600 border-b border-neutral-200">
                  <th className="pb-2">Invoice ID</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Match Status</th>
                </tr>
              </thead>
              <tbody>
                {bankStatements
                  .filter((s) => s.matched)
                  .map((statement, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="py-3 text-neutral-900">{statement.invoice}</td>
                      <td className="py-3 text-right text-neutral-900">¥{statement.amount.toLocaleString()}</td>
                      <td className="py-3">
                        <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                          Matched
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Unmatched Section */}
      {unmatchedCount > 0 && (
        <div className="mt-6 bg-orange-50 border border-orange-200 p-4">
          <h3 className="text-sm font-semibold text-orange-900 mb-3">Unmatched Transactions</h3>
          <div className="space-y-2">
            {bankStatements
              .filter((s) => !s.matched)
              .map((statement, i) => (
                <div key={i} className="flex justify-between items-center bg-white p-3 border border-orange-200">
                  <div>
                    <div className="text-sm font-medium text-neutral-900">{statement.name}</div>
                    <div className="text-xs text-neutral-600">{statement.date}</div>
                  </div>
                  <div className="text-sm font-medium text-neutral-900">¥{statement.amount.toLocaleString()}</div>
                  <button className="px-3 py-1 bg-blue-600 text-white text-xs hover:bg-blue-700">
                    Match Manually
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
