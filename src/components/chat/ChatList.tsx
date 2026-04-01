import React, { useMemo } from 'react';

export type Conversation = {
  id: string;
  lastMessageAt: string;
  unreadCount: number;
  lineUser?: { displayName?: string | null; pictureUrl?: string | null } | null;
  room?: { roomNumber?: string; roomNo?: string } | null;
  tenant?: { fullName: string } | null;
  overdue?: boolean | null;
  waitingPayment?: boolean | null;
};

type Filter = 'all' | 'unread' | 'overdue' | 'waiting';

type Props = {
  items: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  widthClass?: string;
};

function Avatar({ src, name, lineLinked }: { src?: string | null; name: string; lineLinked?: boolean }) {
  const [error, setError] = React.useState(false);
  return (
    <div className="relative shrink-0">
      {src && !error ? (
        // eslint-disable-next-line @next/next/no-img-element -- LINE CDN avatar
        <img src={src} alt={name} onError={() => setError(true)} className="h-10 w-10 rounded-full object-cover border-2 border-line-green/20" />
      ) : (
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-line-green to-emerald-500 flex items-center justify-center text-white text-xs font-bold border-2 border-line-green/30">
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      {/* LINE green online indicator */}
      {lineLinked && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-line-green border-2 border-white" aria-label="เชื่อมต่อ LINE แล้ว" />
      )}
    </div>
  );
}

function ChatListImpl({ items, selectedId, onSelect, widthClass = 'w-80' }: Props) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [search, setSearch] = React.useState('');

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'unread') list = list.filter((x) => x.unreadCount > 0);
    if (filter === 'overdue') list = list.filter((x) => x.overdue);
    if (filter === 'waiting') list = list.filter((x) => x.waitingPayment);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((x) => {
        const name = x.tenant?.fullName || (x.room?.roomNumber ?? x.room?.roomNo) || x.lineUser?.displayName || '';
        return name.toLowerCase().includes(q);
      });
    }
    list = list.slice().sort((a, b) => {
      const score = (x: Conversation) => {
        let s = 0;
        if (x.unreadCount > 0) s += 1000;
        if (x.overdue) s += 500;
        s += new Date(x.lastMessageAt).getTime() / 100000;
        return -s;
      };
      return score(a) - score(b);
    });
    return list;
  }, [items, filter, search]);

  return (
    <div className={`admin-card cute-surface ${widthClass}`}>
      <div className="admin-card-header">
        <div className="admin-card-title">การสนทนา</div>
        <span className="admin-badge">{filtered.length}</span>
      </div>
      <div className="space-y-3 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input"
          placeholder="ค้นหาผู้เช่า ห้อง หรือชื่อ LINE"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={`admin-button ${filter === 'all' ? 'admin-button-primary' : ''}`}>ทั้งหมด</button>
          <button onClick={() => setFilter('unread')} className={`admin-button ${filter === 'unread' ? 'admin-button-primary' : ''}`}>ยังไม่อ่าน</button>
          <button onClick={() => setFilter('overdue')} className={`admin-button ${filter === 'overdue' ? 'admin-button-primary' : ''}`}>ค้างชำระ</button>
          <button onClick={() => setFilter('waiting')} className={`admin-button ${filter === 'waiting' ? 'admin-button-primary' : ''}`}>รอชำระ</button>
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-auto">
          {filtered.map((conversation) => {
            const name = conversation.tenant?.fullName || (conversation.room?.roomNumber ?? conversation.room?.roomNo) || conversation.lineUser?.displayName || 'ไม่ทราบ';
            const pictureUrl = conversation.lineUser?.pictureUrl;
            return (
              <button
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={`w-full rounded-3xl border p-3 text-left transition ${
                  selectedId === conversation.id
                    ? 'border-line-green/30 bg-line-green-light/30 shadow-sm'
                    : 'border-line-green/10 bg-white/85 hover:bg-line-green-light/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar src={pictureUrl} name={name} lineLinked={!!conversation.lineUser} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate font-medium text-slate-900">{name}</div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {conversation.overdue ? <span className="admin-badge admin-status-bad">ค้างชำระ</span> : null}
                        {conversation.waitingPayment ? <span className="admin-badge admin-status-warn">รอชำระ</span> : null}
                        {conversation.unreadCount > 0 ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-line-green text-[10px] font-bold text-white">
                            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{new Date(conversation.lastMessageAt).toLocaleString('th-TH')}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const ChatList = React.memo(ChatListImpl);
