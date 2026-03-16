import { Save, Bell, Mail, Lock, User } from "lucide-react";

export function Settings() {
  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
          <p className="text-sm text-neutral-600">System configuration and preferences</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      <div className="space-y-6">
        {/* Account Settings */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <User className="w-5 h-5" />
              Account Settings
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
                <input
                  type="text"
                  defaultValue="Admin User"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  defaultValue="admin@example.com"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Security Settings
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Current Password</label>
              <input
                type="password"
                placeholder="Enter current password"
                className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">New Password</label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notification Settings
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <div>
                <div className="text-sm font-medium text-neutral-900">Payment Notifications</div>
                <div className="text-xs text-neutral-600">Receive alerts when payments are received</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <div>
                <div className="text-sm font-medium text-neutral-900">Maintenance Alerts</div>
                <div className="text-xs text-neutral-600">Get notified about new maintenance requests</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <div>
                <div className="text-sm font-medium text-neutral-900">Overdue Invoice Reminders</div>
                <div className="text-xs text-neutral-600">Daily reminders for overdue invoices</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium text-neutral-900">System Updates</div>
                <div className="text-xs text-neutral-600">Notifications about system maintenance</div>
              </div>
              <input type="checkbox" className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Settings
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP Server</label>
                <input
                  type="text"
                  defaultValue="smtp.example.com"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP Port</label>
                <input
                  type="text"
                  defaultValue="587"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP Username</label>
                <input
                  type="text"
                  defaultValue="noreply@example.com"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
