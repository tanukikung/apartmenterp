'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { systemFlows, getFlowById, NODE_TYPE_STYLES, CATEGORY_LABELS, type FlowDefinition, type FlowNode } from '@/lib/system-flows';
import { JOURNEY_GROUPS } from '@/lib/docs-journeys';
import {
  ADMIN_PAGES,
  API_ROUTES,
  type AdminPage,
  type ApiRoute,
} from '@/lib/system-map';

function JourneyGroupSelector({ active, onChange }: { active: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  p-4">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2 block">
        Journey Group
      </label>
      <select
        value={active ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full text-sm rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-3 py-2 text-[hsl(var(--card-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/50 cursor-pointer appearance-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
      >
        <option value="">— All flows —</option>
        {JOURNEY_GROUPS.map(group => (
          <option key={group.id} value={group.id}>{group.emoji} {group.title}</option>
        ))}
      </select>
    </div>
  );
}

function FlowList({ flows, selectedId, activeGroup, onSelect }: {
  flows: typeof systemFlows;
  selectedId: string;
  activeGroup: string | null;
  onSelect: (id: string) => void;
}) {
  const groupLabel = activeGroup
    ? JOURNEY_GROUPS.find(g => g.id === activeGroup)
    : null;

  return (
    <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  flex-1 overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--card))' }}>
        <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">
          {groupLabel ? `${groupLabel.emoji} ${groupLabel.title}` : `Flows (${flows.length})`}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {flows.map(flow => {
          const catLabel = CATEGORY_LABELS[flow.category];
          return (
            <button
              key={flow.id}
              onClick={() => onSelect(flow.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                ${selectedId === flow.id
                  ? 'border-l-4 border-[hsl(var(--primary))]'
                  : 'border-l-4 border-transparent hover:bg-white/5'}`}
              style={selectedId === flow.id ? { background: 'rgba(99,102,241,0.1)' } : {}}
            >
              <div className="flex-none mt-0.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_TYPE_STYLES.trigger.border }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[hsl(var(--card-foreground))]">{flow.nameTh}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded  text-[10px] text-[hsl(var(--on-surface-variant))]">
                    {catLabel?.nameTh ?? flow.category}
                  </span>
                  <span className="text-[10px] text-[hsl(var(--on-surface-variant))]">· {flow.linearLayout?.length ?? 0} steps</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ZoomableDiagram({ flow, onNodeClick, selectedNodeId }: { flow: FlowDefinition; onNodeClick: (nodeId: string) => void; selectedNodeId: string | null }) {
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [zoomDisplay, setZoomDisplay] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [transform, setTransform] = useState('');

  const NODE_W = 144;
  const NODE_H = 40;
  const GAP = 43;
  const PADDING_X = 38;
  const PADDING_Y = 19;
  const CX = PADDING_X + NODE_W / 2;

  const nodes = flow.linearLayout || [];
  const svgH = PADDING_Y * 2 + nodes.length * NODE_H + (nodes.length - 1) * GAP;
  const svgW = CX * 2;

  const applyTransform = (zoom: number) => {
    const t = `scale(${zoom}) translate(${panRef.current.x / zoom}px, ${panRef.current.y / zoom}px)`;
    setTransform(t);
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(zoomRef.current * delta, 0.5), 3);
      zoomRef.current = newZoom;
      setZoomDisplay(Math.round(newZoom * 100));
      applyTransform(newZoom);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  if (!nodes.length) {
    return <div className="text-xs text-[hsl(var(--on-surface-variant))] p-4">No layout data</div>;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
    lastPos.current = { x: e.clientX, y: e.clientY };
    applyTransform(zoomRef.current);
  };

  const handleReset = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoomDisplay(100);
    setTransform('');
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Zoom controls */}
      <div className="flex-none flex items-center gap-1 mb-2">
        <button onClick={() => { zoomRef.current = Math.min(zoomRef.current * 1.2, 3); setZoomDisplay(Math.round(zoomRef.current * 100)); applyTransform(zoomRef.current); }} className="px-2 py-1 text-xs rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  hover:bg-white/10 text-[hsl(var(--card-foreground))] transition-all hover:scale-105 active:scale-95">+</button>
        <span className="text-xs text-[hsl(var(--on-surface-variant))] font-mono px-1">{zoomDisplay}%</span>
        <button onClick={() => { zoomRef.current = Math.max(zoomRef.current * 0.8, 0.5); setZoomDisplay(Math.round(zoomRef.current * 100)); applyTransform(zoomRef.current); }} className="px-2 py-1 text-xs rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  hover:bg-white/10 text-[hsl(var(--card-foreground))] transition-all hover:scale-105 active:scale-95">−</button>
        <button onClick={handleReset} className="px-2 py-1 text-xs text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] ml-1 transition-colors">รีเซ็ต</button>
      </div>

      {/* Diagram area */}
      <div
        className="flex-1 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  relative"
        ref={containerRef}
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab', overflow: 'hidden' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => { isDragging.current = false; }}
        onMouseLeave={() => { isDragging.current = false; }}
      >
        <div style={{ transform, transformOrigin: '0 0', display: 'block', width: svgW, height: svgH }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: svgW, height: svgH, display: 'block' }}>
            <defs>
              <marker id={`arr-l-${flow.id}`} markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
                <circle cx="2.5" cy="2.5" r="1.5" fill="#94a3b8" />
              </marker>
            </defs>

            {nodes.map((nodeId, i) => {
              if (i === nodes.length - 1) return null;
              const y1 = PADDING_Y + i * (NODE_H + GAP) + NODE_H;
              const y2 = PADDING_Y + (i + 1) * (NODE_H + GAP);
              return (
                <line key={`line-${i}`} x1={CX} y1={y1} x2={CX} y2={y2}
                  stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2"
                  markerEnd={`url(#arr-l-${flow.id})`}
                />
              );
            })}

            {nodes.map((nodeId, i) => {
              const node = flow.nodes[nodeId];
              if (!node) return null;
              const style = NODE_TYPE_STYLES[node.type];
              const isSelected = selectedNodeId === nodeId;
              const isHovered = hoveredNode === nodeId;
              const y = PADDING_Y + i * (NODE_H + GAP);

              return (
                <g key={nodeId} transform={`translate(${CX - NODE_W / 2}, ${y})`} onClick={() => onNodeClick(nodeId)} onMouseEnter={() => setHoveredNode(nodeId)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: 'pointer' }}>
                  <rect x="0" y="0" width={NODE_W} height={NODE_H} rx="5"
                    fill={isSelected ? style.bg : isHovered ? style.bg + '33' : '#ffffff'}
                    stroke={isSelected ? '#3b82f6' : isHovered ? style.border : style.border}
                    strokeWidth={isSelected || isHovered ? 1.5 : 0.75}
                  />
                  <rect x="0" y="0" width={36} height={11} rx="5" fill={style.border} />
                  <text x="18" y="8.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="white">{style.label}</text>
                  <circle cx={NODE_W - 10} cy="10" r="7" fill={isSelected ? '#3b82f6' : '#e2e8f0'} />
                  <text x={NODE_W - 10} y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={isSelected ? 'white' : '#64748b'}>{i + 1}</text>
                  <text x={NODE_W / 2} y={NODE_H / 2 + 3} textAnchor="middle" fontSize="10" fontWeight="600" fill={style.text}>{node.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── FLOW STEPS ───────────────────────────────

function FlowSteps({ flow, selectedNodeId, onNodeClick }: { flow: FlowDefinition; selectedNodeId: string | null; onNodeClick: (nodeId: string) => void }) {
  const layout = flow.linearLayout || [];

  return (
    <div className="space-y-2">
      {layout.map((nodeId, i) => {
        const node = flow.nodes[nodeId];
        if (!node) return null;
        const style = NODE_TYPE_STYLES[node.type];
        const isSelected = selectedNodeId === nodeId;

        return (
          <div
            key={nodeId}
            onClick={() => onNodeClick(nodeId)}
            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-[hsl(var(--primary))]' : 'border-[hsl(var([hsl(var(--color-border))]))]'}`}
            style={isSelected ? { background: 'rgba(99,102,241,0.08)' } : { background: 'hsl(var(--card))' }}
          >
            <div className="flex-none flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
              style={{ backgroundColor: style.border, color: 'white' }}>
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: style.bg, color: style.text }}>{style.label}</span>
                <span className="text-sm font-semibold text-[hsl(var(--card-foreground))] truncate">{node.label}</span>
              </div>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] leading-relaxed">{node.description}</p>
              {node.files.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {node.files.map((f, fi) => (
                    <span key={fi} className="text-xs  px-1.5 py-0.5 rounded font-mono text-[hsl(var(--on-surface-variant))]">{f.path.split('/').pop()}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── NODE DETAIL MODAL ─────────────────────────

function NodeDetailModal({ node, flow, onClose }: { node: FlowNode; flow: FlowDefinition; onClose: () => void }) {
  const style = NODE_TYPE_STYLES[node.type];
  const nodeIndex = (flow.linearLayout || []).indexOf(node.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="relative rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-[hsl(var([hsl(var(--color-border))]))] " onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))]" style={{ backgroundColor: style.bg }}>
          <div className="flex-none flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold" style={{ backgroundColor: style.border, color: 'white' }}>
            {nodeIndex >= 0 ? nodeIndex + 1 : '?'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: style.text }}>{style.label}</div>
            <div className="text-sm font-semibold text-[hsl(var(--card-foreground))] truncate">{node.label}</div>
          </div>
          <button onClick={onClose} className="ml-auto flex-none w-8 h-8 rounded-full  hover:bg-white/10 flex items-center justify-center text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider mb-1">Description</div>
            <p className="text-sm text-[hsl(var(--card-foreground))] leading-relaxed">{node.description}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider mb-2">Source Files</div>
            <div className="space-y-2">
              {node.files.map((f, fi) => (
                <div key={fi} className="flex items-start gap-2 p-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] ">
                  <span className="text-xs text-[hsl(var(--on-surface-variant))] font-mono mt-0.5">📄</span>
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-[hsl(var(--card-foreground))] break-all">{f.path}</div>
                    <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">{f.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-[hsl(var(--on-surface-variant))] uppercase tracking-wider mb-2">Connected Nodes</div>
            <div className="space-y-1">
              {flow.edges.filter(e => e.from === node.id || e.to === node.id).map((edge, ei) => {
                const otherId = edge.from === node.id ? edge.to : edge.from;
                const otherNode = flow.nodes[otherId];
                if (!otherNode) return null;
                const otherStyle = NODE_TYPE_STYLES[otherNode.type];
                return (
                  <div key={ei} className="flex items-center gap-2 text-xs">
                    <span className="text-[hsl(var(--on-surface-variant))]">{edge.from === node.id ? '→' : '←'}</span>
                    <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: otherStyle.bg, color: otherStyle.text }}>{otherStyle.label}</span>
                    <span className="text-[hsl(var(--card-foreground))]">{otherNode.label}</span>
                    {edge.label && <span className="text-[hsl(var(--on-surface-variant))] ml-auto">{edge.label}</span>}
                  </div>
                );
              })}
              {flow.edges.filter(e => e.from === node.id || e.to === node.id).length === 0 && (
                <div className="text-xs text-[hsl(var(--on-surface-variant))] italic">No connected edges defined</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TROUBLESHOOTING SECTION ───────────────────

function TroubleshootingSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  const items = [
    {
      id: 'ts-1',
      q: 'หน้า docs ขึ้นว่า "No layout data" สำหรับ flow ที่เลือก',
      a: 'Flow นั้นยังไม่มี linearLayout array ใน system-flows.ts — ต้องเพิ่ม node IDs ตามลำดับการไหล',
    },
    {
      id: 'ts-2',
      q: 'Zoom controls ไม่ทำงานหลังจาก pan แล้ว',
      a: 'ปัญหาอยู่ที่ applyTransform ใช้ panRef.current โดยตรง แต่ zoom คำนวณผิด — ตรวจสอบว่ zoomRef และ panRef update แบบ synchronous ในทุก operation',
    },
    {
      id: 'ts-3',
      q: 'คลิก node แล้ว modal ไม่ขึ้น',
      a: 'ตรวจสอบว่ selectedNodeId state ถูก set จาก onNodeClick ของ ZoomableDiagram และ FlowSteps — ถ้าทั้งสองแยกกัน set state อาจมี race condition',
    },
    {
      id: 'ts-4',
      q: 'Journey group ไม่แสดง flow ที่ควรจะมี',
      a: 'ตรวจสอบว่ flowIds ใน JOURNEY_GROUPS ตรงกับ id ของ flow ใน systemFlows — ถ้า flow ถูกลบหรือ rename id, group จะไม่เห็น flow',
    },
    {
      id: 'ts-5',
      q: 'Node ใน diagram ลบลายเมื่อ zoom เข้าไป',
      a: 'SVG transform ใช้ transform-origin: 0 0 และ translate + scale — ตรวจสอบว่ SVG viewBox ถูกต้องและไม่มี overflow',
    },
  ];

  return (
    <div className="rounded-xl border border-[rgba(251,191,36,0.2)]  p-4 space-y-2" style={{ background: 'rgba(251,191,36,0.05)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-[#fbbf24]">Troubleshooting</span>
      </div>
      {items.map(item => (
        <div key={item.id}>
          <button
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
            className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-[hsl(var(--card-foreground))] hover:bg-white/5 transition-colors"
          >
            <span className="text-[#fbbf24]">{openId === item.id ? '▼' : '▶'}</span>
            <span className="font-medium">{item.q}</span>
          </button>
          {openId === item.id && (
            <div className="ml-6 px-3 py-2 text-sm rounded-lg  text-[hsl(var(--on-surface-variant))]">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── PAGE ROW ──────────────────────────────────

function PageRow({ page }: { page: AdminPage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-[hsl(var(--on-surface-variant))] text-xs">{expanded ? '▼' : '▶'}</span>
        <code className="text-xs font-mono text-[hsl(var(--primary))]">{page.path}</code>
        <span className="text-xs text-[hsl(var(--on-surface-variant))] ml-auto">{page.sectionTh}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-2 space-y-1">
          <div className="text-xs text-[hsl(var(--on-surface-variant))]">{page.description}</div>
          {page.apiCalls.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {page.apiCalls.map((call, i) => (
                <span key={i} className="text-xs font-mono  px-1.5 py-0.5 rounded text-[hsl(var(--on-surface-variant))]">{call}</span>
              ))}
            </div>
          )}
          <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-1 font-mono">{page.file}</div>
        </div>
      )}
    </div>
  );
}

// ─── ROUTE ROW ─────────────────────────────────

function RouteRow({ route }: { route: ApiRoute }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-[hsl(var(--on-surface-variant))] text-xs">{expanded ? '▼' : '▶'}</span>
        <code className="text-xs font-mono text-[#a78bfa]">{route.method} {route.path}</code>
        {route.auth && <span className="ml-auto text-xs  px-1.5 py-0.5 rounded text-[hsl(var(--on-surface-variant))]">auth</span>}
      </button>
      {expanded && (
        <div className="px-4 pb-2 space-y-1">
          <div className="text-xs text-[hsl(var(--on-surface-variant))]">{route.description}</div>
          {route.calledBy.length > 0 && (
            <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-1">
              Called by: <span className="font-mono">{route.calledBy.join(', ')}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {route.tags.map((tag, i) => (
              <span key={i} className="text-xs  px-1.5 py-0.5 rounded text-[hsl(var(--on-surface-variant))]">{tag}</span>
            ))}
          </div>
          {route.files[0] && <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-1 font-mono">{route.files[0]}</div>}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'flows' | 'map'>('flows');
  const [selectedFlowId, setSelectedFlowId] = useState<string>(systemFlows[0]?.id ?? '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeJourneyGroup, setActiveJourneyGroup] = useState<string | null>(null);

  const selectedFlow = getFlowById(selectedFlowId);

  // Filter flows by active journey group
  const filteredFlows = activeJourneyGroup
    ? systemFlows.filter(f => {
        const group = JOURNEY_GROUPS.find(g => g.id === activeJourneyGroup);
        return group?.flowIds.includes(f.id);
      })
    : systemFlows;

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
  };

  const handleFlowSelect = (flowId: string) => {
    setSelectedFlowId(flowId);
    setSelectedNodeId(null);
  };

  const selectedNode = selectedFlow && selectedNodeId ? selectedFlow.nodes[selectedNodeId] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Page header with tab switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">📚</div>
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--card-foreground))]">System Documentation</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">Architectural reference — flows, pages, and API routes</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  p-1">
          <button
            onClick={() => setActiveTab('flows')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'flows' ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] hover:bg-white/5'}`}
          >
            Flows
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'map' ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] hover:bg-white/5'}`}
          >
            Map
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'flows' && (
        <div className="flex gap-4 h-[calc(100vh-180px)]">
          {/* LEFT — Journey group + flow list */}
          <div className="w-72 flex-none flex flex-col gap-3 overflow-hidden">
            <JourneyGroupSelector active={activeJourneyGroup} onChange={setActiveJourneyGroup} />
            <FlowList flows={filteredFlows} selectedId={selectedFlowId} activeGroup={activeJourneyGroup} onSelect={handleFlowSelect} />
          </div>

          {/* MIDDLE — Flow steps */}
          <div className="flex-1 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">Steps</h3>
                <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">{selectedFlow?.nameTh ?? selectedFlow?.name ?? '—'}</p>
              </div>
              <span className="text-xs text-[hsl(var(--on-surface-variant))]">{selectedFlow?.linearLayout?.length ?? 0} nodes</span>
            </div>
            {selectedFlow ? (
              <FlowSteps flow={selectedFlow} selectedNodeId={selectedNodeId} onNodeClick={handleNodeClick} />
            ) : (
              <div className="text-sm text-[hsl(var(--on-surface-variant))] text-center py-8">Select a flow to view steps</div>
            )}
            <div className="mt-6">
              <TroubleshootingSection />
            </div>
          </div>

          {/* RIGHT — Zoomable diagram */}
          <div className="flex-1 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">Flow Diagram</h3>
                <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">Click node to see details · Scroll to zoom · Drag to pan</p>
              </div>
              {selectedFlow && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[hsl(var(--on-surface-variant))]">{selectedFlow.nameTh}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium`} style={{ backgroundColor: NODE_TYPE_STYLES.trigger.bg, color: NODE_TYPE_STYLES.trigger.text }}>
                    {CATEGORY_LABELS[selectedFlow.category]?.nameTh ?? selectedFlow.category}
                  </span>
                </div>
              )}
            </div>
            <div className="h-[calc(100%-80px)]">
              {selectedFlow ? (
                <ZoomableDiagram flow={selectedFlow} onNodeClick={handleNodeClick} selectedNodeId={selectedNodeId} />
              ) : (
                <div className="h-full flex items-center justify-center text-[hsl(var(--on-surface-variant))] text-sm">Select a flow to view diagram</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'map' && (
        <div className="flex gap-4">
          {/* Left: Pages */}
          <div className="flex-1 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden">
            <div className="px-4 py-3 border-b border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--card))' }}>
              <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">Admin Pages ({ADMIN_PAGES.length})</h3>
            </div>
            <div className="divide-y divide-[hsl(var([hsl(var(--color-border))]))] max-h-[calc(100vh-200px)] overflow-y-auto">
              {ADMIN_PAGES.map(page => (
                <PageRow key={page.path} page={page} />
              ))}
            </div>
          </div>

          {/* Right: API Routes */}
          <div className="flex-1 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden">
            <div className="px-4 py-3 border-b border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--card))' }}>
              <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">API Routes ({API_ROUTES.length})</h3>
            </div>
            <div className="divide-y divide-[hsl(var([hsl(var(--color-border))]))] max-h-[calc(100vh-200px)] overflow-y-auto">
              {API_ROUTES.map(route => (
                <RouteRow key={`${route.method}-${route.path}`} route={route} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Node detail modal */}
      {selectedNode && selectedFlow && (
        <NodeDetailModal node={selectedNode} flow={selectedFlow} onClose={() => setSelectedNodeId(null)} />
      )}
    </motion.div>
  );
}
