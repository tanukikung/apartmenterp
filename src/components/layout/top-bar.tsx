'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Building2,
  X,
} from 'lucide-react';
import LogoutButton from '@/components/auth/LogoutButton';

interface TopBarProps {
  onMenuClick?: () => void;
  username?: string;
  displayName?: string;
  role?: string;
}

export default function TopBar({ onMenuClick, username, displayName, role }: TopBarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{type: string; id: string; label: string}>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mock search - searches rooms, tenants, invoices
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    // In a real implementation, this would call an API
    // For now, we show placeholder results
    const mockResults = [
      { type: 'room', id: '101', label: `ห้อง 101` },
      { type: 'room', id: '202', label: `ห้อง 202` },
      { type: 'tenant', id: 't1', label: `นาย สมชาย ใจดี` },
      { type: 'invoice', id: 'inv-001', label: `ใบแจ้งหนี้ #INV-001` },
    ].filter(r => r.label.toLowerCase().includes(query.toLowerCase()));
    setSearchResults(mockResults);
  };

  const handleSearchSelect = (result: {type: string; id: string}) => {
    setSearchQuery('');
    setShowSearch(false);
    setSearchResults([]);
    switch (result.type) {
      case 'room':
        router.push(`/admin/rooms/${result.id}`);
        break;
      case 'tenant':
        router.push(`/admin/tenants/${result.id}`);
        break;
      case 'invoice':
        router.push(`/admin/invoices/${result.id}`);
        break;
    }
  };

  const notificationCount = 3; // Mock count

  return (
    <>
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 md:px-6 gap-4">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors md:hidden"
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
              <Building2 size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-slate-800 leading-tight tracking-tight">Apartment ERP</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Console</div>
            </div>
          </Link>
        </div>

        {/* Center: Global Search */}
        <div ref={searchRef} className="flex-1 max-w-md relative">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาห้อง, ผู้เช่า, ใบแจ้งหนี้..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          {/* Search Results Dropdown */}
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden z-50">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSearchSelect(result)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium">
                    {result.type === 'room' ? '📦' : result.type === 'tenant' ? '👤' : '📄'}
                  </span>
                  <span>{result.label}</span>
                  <span className="ml-auto text-xs text-slate-400 capitalize">{result.type}</span>
                </button>
              ))}
            </div>
          )}
          {showSearch && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 p-4 text-center text-sm text-slate-500 z-50">
              ไม่พบผลลัพธ์สำหรับ "{searchQuery}"
            </div>
          )}
        </div>

        {/* Right: Notifications + User */}
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell size={20} />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {notificationCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-800">การแจ้งเตือน</span>
                  <button className="text-xs text-indigo-600 hover:text-indigo-700">ทั้งหมด</button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {[
                    { id: 1, title: 'มีผู้เช่าใหม่ลงทะเบียน', time: '5 นาทีที่แล้ว', read: false },
                    { id: 2, title: 'ห้อง 305 ค้างชำระ 15 วัน', time: '1 ชั่วโมงที่แล้ว', read: false },
                    { id: 3, title: 'สร้างเอกสารสำเร็จ', time: '2 ชั่วโมงที่แล้ว', read: true },
                  ].map(notif => (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 ${!notif.read ? 'bg-indigo-50/50' : ''}`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${notif.read ? 'bg-slate-100' : 'bg-indigo-100'}`}>
                        <Bell size={14} className={notif.read ? 'text-slate-400' : 'text-indigo-600'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">{notif.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{notif.time}</p>
                      </div>
                      {!notif.read && <div className="h-2 w-2 rounded-full bg-indigo-500 mt-2" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Avatar / Menu */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <span className="text-xs font-semibold text-white">
                  {displayName ? displayName.charAt(0).toUpperCase() : (username ? username.charAt(0).toUpperCase() : 'A')}
                </span>
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-slate-800 leading-tight">{displayName || 'ผู้ดูแลระบบ'}</div>
                <div className="text-xs text-slate-500">{role || 'เจ้าของ'}</div>
              </div>
              <ChevronDown size={14} className="text-slate-400 hidden md:block" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-800">{displayName || 'ผู้ดูแลระบบ'}</p>
                  <p className="text-xs text-slate-500">{username || 'owner'}@apartment.com</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/admin/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Settings size={16} className="text-slate-400" />
                    ตั้งค่า
                  </Link>
                  <div className="w-full">
                    <LogoutButton />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}