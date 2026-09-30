import { useEffect, useRef, useState } from 'react';
import { List, MagnifyingGlass, Minus, Plus } from '@phosphor-icons/react';
import type { RemoteNote, RemoteVault } from '../shared/phone-remote';
import { SafeMarkdown } from '../renderer/components/SafeMarkdown';
import { remoteRequest } from './api';
import { Sheet } from './remote-ui';

interface Point {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
/** Notch RemoteControlServer.graphHTML force simulation, ported to typed SVG coordinates.
 * The original repulsion, link length, spring, centering and damping constants are retained. */
function stepGraph(points: Point[], edges: [string, string][]): void {
  const nodes = new Map(points.map((point) => [point.id, point]));
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j]!;
      let dx = a.x - b.x,
        dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 1;
      if (d2 < 90000) {
        const f = 2200 / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    }
    a.vx += -a.x * 0.0015;
    a.vy += -a.y * 0.0015;
  }
  for (const edge of edges) {
    const a = nodes.get(edge[0]),
      b = nodes.get(edge[1]);
    if (!a || !b) continue;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const f = (d - 110) * 0.004;
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }
  for (const point of points) {
    point.vx *= 0.85;
    point.vy *= 0.85;
    point.x += point.vx;
    point.y += point.vy;
  }
}

export function MemoryGraph({ online }: { online: boolean }) {
  const [vault, setVault] = useState<RemoteVault>({ nodes: [], edges: [] });
  const [points, setPoints] = useState<Point[]>([]);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 0.85 });
  const [noteId, setNoteId] = useState<string>();
  const [note, setNote] = useState<RemoteNote>();
  const [error, setError] = useState('');
  const [list, setList] = useState(false);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const dragging = useRef<string | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    const load = () =>
      remoteRequest<RemoteVault>('vault', undefined, controller.signal)
        .then((next) => {
          setVault((current) =>
            JSON.stringify(current) === JSON.stringify(next) ? current : next,
          );
          setLoaded(true);
          setError('');
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError('Memory could not be loaded. Reconnect to your Mac to try again.');
        });
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [online]);
  useEffect(() => {
    const next = vault.nodes.map((node, index) => ({
      id: node.id,
      x: Math.cos(index * 2.4) * (40 + Math.sqrt(index) * 26),
      y: Math.sin(index * 2.4) * (40 + Math.sqrt(index) * 26),
      vx: 0,
      vy: 0,
    }));
    for (let i = 0; i < 80; i++) stepGraph(next, vault.edges);
    setPoints(next);
  }, [vault]);
  useEffect(() => {
    if (!noteId) return;
    const controller = new AbortController();
    setNote(undefined);
    void remoteRequest<RemoteNote>(
      `note?id=${encodeURIComponent(noteId)}`,
      undefined,
      controller.signal,
    )
      .then(setNote)
      .catch(() => {
        if (!controller.signal.aborted) setError('This note is no longer available.');
      });
    return () => controller.abort();
  }, [noteId]);
  const nodeMap = new Map(points.map((point) => [point.id, point]));
  const zoom = (factor: number) =>
    setCamera((current) => ({
      ...current,
      scale: Math.min(4, Math.max(0.2, current.scale * factor)),
    }));
  return (
    <section className="memory-room">
      <div className="graph-toolbar">
        <span>
          {loaded
            ? `${vault.nodes.length} memories · ${vault.edges.length} ${vault.edges.length === 1 ? 'link' : 'links'}`
            : 'Loading memory…'}
        </span>
        <button
          className="icon"
          aria-label={list ? 'Show graph' : 'Show memory list'}
          onClick={() => setList(!list)}
        >
          <List size={20} />
        </button>
      </div>
      {error && (
        <p className="remote-error" role="alert">
          {error}
        </p>
      )}
      {list && (
        <label className="memory-search">
          <MagnifyingGlass size={18} />
          <input
            aria-label="Search memories"
            placeholder="Find a memory…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      )}
      {loaded && !vault.nodes.length ? (
        <div className="memory-empty">
          <h2>A memory starts with a conversation.</h2>
          <p>Saved preferences, learned lessons, and skills will appear here as you use Sia.</p>
        </div>
      ) : list ? (
        <div className="memory-list">
          {!vault.nodes.some((node) =>
            `${node.title} ${node.kind}`.toLowerCase().includes(query.toLowerCase()),
          ) && <p className="composer-hint">No memories match “{query}”. Try another word.</p>}
          {vault.nodes
            .filter((node) =>
              `${node.title} ${node.kind}`.toLowerCase().includes(query.toLowerCase()),
            )
            .map((node) => (
              <button key={node.id} onClick={() => setNoteId(node.id)}>
                <i data-kind={node.kind} />
                <span>{node.title}</span>
                <small>{node.kind}</small>
              </button>
            ))}
        </div>
      ) : (
        <svg
          ref={svg}
          className="memory-svg"
          viewBox="-195 -230 390 460"
          aria-label="Memory graph. Drag to pan, pinch to zoom, or tap a memory to read it."
          onPointerDown={(event) => {
            const previous = pointers.current.size;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (!previous) {
              moved.current = false;
              dragging.current =
                (event.target as Element).closest('[data-node]')?.getAttribute('data-node') ??
                undefined;
            }
            if (pointers.current.size > 1) {
              dragging.current = undefined;
              moved.current = true;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const old = pointers.current.get(event.pointerId);
            if (!old) return;
            const dx = event.clientX - old.x,
              dy = event.clientY - old.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
            const other = [...pointers.current.entries()].find(
              ([id]) => id !== event.pointerId,
            )?.[1];
            if (other) {
              const before = Math.hypot(old.x - other.x, old.y - other.y),
                after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
              if (before > 0) zoom(after / before);
            } else {
              const rect = event.currentTarget.getBoundingClientRect();
              const factor = Math.max(390 / rect.width, 460 / rect.height) / camera.scale;
              if (dragging.current)
                setPoints((current) =>
                  current.map((point) =>
                    point.id === dragging.current
                      ? { ...point, x: point.x + dx * factor, y: point.y + dy * factor }
                      : point,
                  ),
                );
              else
                setCamera((current) => ({
                  ...current,
                  x: current.x + dx * factor,
                  y: current.y + dy * factor,
                }));
            }
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }}
          onPointerUp={(event) => {
            if (!moved.current && dragging.current) setNoteId(dragging.current);
            pointers.current.delete(event.pointerId);
            dragging.current = undefined;
          }}
          onPointerCancel={(event) => {
            pointers.current.delete(event.pointerId);
            dragging.current = undefined;
          }}
        >
          <g transform={`scale(${camera.scale}) translate(${camera.x} ${camera.y})`}>
            {vault.edges.map(([a, b]) => {
              const first = nodeMap.get(a),
                second = nodeMap.get(b);
              return first && second ? (
                <line key={`${a}-${b}`} x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
              ) : null;
            })}
            {vault.nodes.map((node) => {
              const point = nodeMap.get(node.id);
              return point ? (
                <g
                  data-node={node.id}
                  data-kind={node.kind}
                  key={node.id}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Read ${node.title}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setNoteId(node.id);
                    }
                  }}
                >
                  <circle r={23} fill="transparent" />
                  <circle
                    className="graph-node"
                    r={
                      6 +
                      Math.min(
                        vault.edges.filter((edge) => edge.includes(node.id)).length * 1.6,
                        10,
                      )
                    }
                  />
                  <text y={25} textAnchor="middle">
                    {node.title.slice(0, 28)}
                  </text>
                </g>
              ) : null;
            })}
          </g>
        </svg>
      )}
      {!list && vault.nodes.length > 0 && (
        <div className="graph-controls">
          <button className="icon" aria-label="Zoom out" onClick={() => zoom(0.8)}>
            <Minus size={18} />
          </button>
          <button
            className="graph-reset"
            onClick={() => setCamera({ x: 0, y: 0, scale: 0.85 })}
          >
            Recenter
          </button>
          <button className="icon" aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <Plus size={18} />
          </button>
        </div>
      )}
      <div className="graph-legend">
        {['memory', 'skill', 'journal', 'workflow', 'topic'].map((kind) => (
          <span key={kind}>
            <i data-kind={kind} />
            {kind}
          </span>
        ))}
      </div>
      <Sheet
        open={!!noteId}
        onClose={() => setNoteId(undefined)}
        title={note?.title ?? 'Loading memory…'}
        description={
          note?.kind
            ? `From your assistant’s ${note.kind === 'memory' ? 'memory' : note.kind}.`
            : 'Opening this memory from your Mac.'
        }
        closeLabel="Close memory"
      >
        <div className="note-body">
          {note ? (
            <SafeMarkdown content={note.content} />
          ) : (
            <p role="status">{error || 'Loading…'}</p>
          )}
        </div>
      </Sheet>
    </section>
  );
}
