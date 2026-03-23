import React, { useMemo } from 'react';

export type Conversation = {
  id: string;
  lastMessageAt: string;
  unreadCount: number;
  lineUser?: { displayName?: string | null; pictureUrl?: string | null } | null;
  room?: { roomNumber: string } | null;
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

function Avatar({ src, name }: { src?: string | null; name: string }) {
  const [error, setError] = React.useState(false);
  if (src && !error) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover border border-pink-100"
      />
    );
  }
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-pink-400 to-fuchsia-400 flex items-center justify-center text-white text-xs font-bold border border-pink-200">
      {initials}
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
        const name = x.tenant?.fullName || x.room?.roomNumber || x.lineUser?.displayName || '';
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
        <div className="admin-card-title">Conversations</div>
        <span className="admin-badge">{filtered.length}</span>
      </div>
      <div className="space-y-3 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input"
          placeholder="Search by tenant, room, or LINE name"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={`admin-button ${filter === 'all' ? 'admin-button-primary' : ''}`}>All</button>
          <button onClick={() => setFilter('unread')} className={`admin-button ${filter === 'unread' ? 'admin-button-primary' : ''}`}>Unread</button>
          <button onClick={() => setFilter('overdue')} className={`admin-button ${filter === 'overdue' ? 'admin-button-primary' : ''}`}>Overdue</button>
          <button onClick={() => setFilter('waiting')} className={`admin-button ${filter === 'waiting' ? 'admin-button-primary' : ''}`}>Waiting</button>
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-auto">
          {filtered.map((conversation) => {
            const name = conversation.tenant?.fullName || conversation.room?.roomNumber || conversation.lineUser?.displayName || 'Unknown';
            const pictureUrl = conversation.lineUser?.pictureUrl;
            return (
              <button
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={`w-full rounded-3xl border p-3 text-left transition ${
                  selectedId === conversation.id
                    ? 'border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50 shadow-sm'
                    : 'border-pink-100 bg-white/85 hover:bg-pink-50/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar src={pictureUrl} name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate font-medium text-slate-900">{name}</div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {conversation.overdue ? <span className="admin-badge admin-status-bad">Overdue</span> : null}
                        {conversation.waitingPayment ? <span className="admin-badge admin-status-warn">Waiting</span> : null}
                        {conversation.unreadCount > 0 ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-[10px] font-bold text-white">
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
