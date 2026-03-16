import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const revenueData = [
  { month: "Sep", revenue: 680000 },
  { month: "Oct", revenue: 720000 },
  { month: "Nov", revenue: 710000 },
  { month: "Dec", revenue: 750000 },
  { month: "Jan", revenue: 730000 },
  { month: "Feb", revenue: 760000 },
  { month: "Mar", revenue: 740000 },
];

const occupancyData = [
  { month: "Sep", rate: 75 },
  { month: "Oct", rate: 83 },
  { month: "Nov", rate: 83 },
  { month: "Dec", rate: 92 },
  { month: "Jan", rate: 83 },
  { month: "Feb", rate: 92 },
  { month: "Mar", rate: 83 },
];

const overdueData = [
  { month: "Sep", count: 3 },
  { month: "Oct", count: 1 },
  { month: "Nov", count: 2 },
  { month: "Dec", count: 0 },
  { month: "Jan", count: 1 },
  { month: "Feb", count: 2 },
  { month: "Mar", count: 2 },
];

const maintenanceFrequency = [
  { category: "Plumbing", count: 8 },
  { category: "Electrical", count: 5 },
  { category: "HVAC", count: 12 },
  { category: "Appliances", count: 6 },
  { category: "Other", count: 4 },
];

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#737373"];

export function Analytics() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Analytics</h1>
        <p className="text-sm text-neutral-600">Business insights and trends</p>
      </div>

      <div className="space-y-6">
        {/* Revenue Trend */}
        <div className="bg-white border border-neutral-300 p-6">
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
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-6">
          {/* Occupancy Rate */}
          <div className="bg-white border border-neutral-300 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Occupancy Rate</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={occupancyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="month" stroke="#737373" />
                <YAxis stroke="#737373" />
                <Tooltip />
                <Bar dataKey="rate" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Overdue Rate */}
          <div className="bg-white border border-neutral-300 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Overdue Invoices</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={overdueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="month" stroke="#737373" />
                <YAxis stroke="#737373" />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#ea580c" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Maintenance Frequency */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-neutral-300 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Maintenance by Category</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={maintenanceFrequency}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, count }) => `${category}: ${count}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {maintenanceFrequency.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-neutral-300 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Maintenance Frequency</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={maintenanceFrequency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="category" stroke="#737373" />
                <YAxis stroke="#737373" />
                <Tooltip />
                <Bar dataKey="count" fill="#9333ea" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
