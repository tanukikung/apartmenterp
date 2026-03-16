import { useState } from "react";
import { chatConversations } from "../utils/mockData";
import { Send, Receipt, FileText, Bell } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const messages = [
  { id: 1, sender: "tenant", text: "エアコンの調子が悪いです", timestamp: "2026-03-13 16:45" },
  { id: 2, sender: "admin", text: "ご連絡ありがとうございます。詳しい状況を教えていただけますか？", timestamp: "2026-03-13 16:50" },
  { id: 3, sender: "tenant", text: "冷房が全く効かなくなりました。昨日から急にです。", timestamp: "2026-03-13 16:52" },
  { id: 4, sender: "admin", text: "承知しました。明日の午前中に修理業者を手配いたします。", timestamp: "2026-03-13 17:00" },
];

export function Chat() {
  const [selectedChat, setSelectedChat] = useState(chatConversations[2]);
  const [messageText, setMessageText] = useState("");

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
        <h1 className="text-2xl font-semibold text-neutral-900">Chat</h1>
        <p className="text-sm text-neutral-600">Communicate with tenants</p>
      </motion.div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-200px)]">
        {/* Left: Conversation List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-3 bg-white border border-neutral-300 flex flex-col"
        >
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">Conversations</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chatConversations.map((conv, index) => (
              <motion.button
                key={conv.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.05 }}
                whileHover={{ backgroundColor: "#f5f5f5", x: 5 }}
                onClick={() => setSelectedChat(conv)}
                className={`w-full px-4 py-3 text-left border-b border-neutral-200 transition-all ${
                  selectedChat.id === conv.id ? "bg-blue-50 border-l-4 border-l-blue-600" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-neutral-900">{conv.tenant}</span>
                  {conv.unread > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      whileHover={{ scale: 1.2 }}
                      className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full"
                    >
                      {conv.unread}
                    </motion.span>
                  )}
                </div>
                <div className="text-xs text-neutral-600 mb-1">Room {conv.room}</div>
                <div className="text-xs text-neutral-500 truncate">{conv.lastMessage}</div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Middle: Chat Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-6 bg-white border border-neutral-300 flex flex-col"
        >
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">{selectedChat.tenant}</h2>
            <p className="text-xs text-neutral-600">Room {selectedChat.room}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex ${msg.sender === "admin" ? "justify-end" : "justify-start"}`}
                >
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className={`max-w-[70%] px-4 py-2 ${
                      msg.sender === "admin"
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-100 text-neutral-900"
                    }`}
                  >
                    <div className="text-sm">{msg.text}</div>
                    <div
                      className={`text-xs mt-1 ${
                        msg.sender === "admin" ? "text-blue-100" : "text-neutral-500"
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="border-t border-neutral-300 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Right: Room Info & Quick Actions */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-3 bg-white border border-neutral-300"
        >
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-2">
            {[
              { icon: Receipt, label: "Send Invoice" },
              { icon: FileText, label: "Send Receipt" },
              { icon: Bell, label: "Send Reminder" }
            ].map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + index * 0.05 }}
                whileHover={{ scale: 1.05, x: 5 }}
                whileTap={{ scale: 0.95 }}
                className="w-full px-4 py-2 bg-white border border-neutral-300 text-sm hover:bg-neutral-50 flex items-center gap-2"
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </motion.button>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-neutral-300">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Room Info</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-neutral-600">Room:</span>
                <span className="ml-2 text-neutral-900">{selectedChat.room}</span>
              </div>
              <div>
                <span className="text-neutral-600">Tenant:</span>
                <span className="ml-2 text-neutral-900">{selectedChat.tenant}</span>
              </div>
              <div>
                <span className="text-neutral-600">Rent:</span>
                <span className="ml-2 text-neutral-900">¥70,000</span>
              </div>
              <div>
                <span className="text-neutral-600">Last Payment:</span>
                <span className="ml-2 text-neutral-900">2026-03-01</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}