import { ArrowClockwise, Database, Eye, UsersThree } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import type { ResearchBatchSummary, ResearchParticipant } from '../../types';
import styles from '../../ui.module.css';
import { SettingsSectionHeader } from './SettingsShared';

interface ResearchArchiveSettingsProps {
  listParticipants(): Promise<ResearchParticipant[]>;
  listBatches(subject: string): Promise<ResearchBatchSummary[]>;
  readBatch(subject: string, batchId: string): Promise<unknown>;
}

interface TurnGroup {
  id: string;
  threadId: string;
  turnId: string;
  createdAt: string;
  byteLength: number;
  batches: ResearchBatchSummary[];
  eventKinds: string[];
}

interface ArchiveEvent {
  id: string;
  occurredAt: string;
  eventType: string;
  sequence?: number;
  data: unknown;
}

const EVENT_PAGE_SIZE = 100;

export function ResearchArchiveSettings({
  listParticipants,
  listBatches,
  readBatch,
}: ResearchArchiveSettingsProps) {
  const [participants, setParticipants] = useState<ResearchParticipant[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>();
  const [batches, setBatches] = useState<ResearchBatchSummary[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string>();
  const [events, setEvents] = useState<ArchiveEvent[]>([]);
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(EVENT_PAGE_SIZE);
  const [loading, setLoading] = useState<'participants' | 'turns' | 'events'>();
  const [error, setError] = useState<string>();

  const refreshParticipants = async () => {
    setLoading('participants');
    setError(undefined);
    try {
      const next = await listParticipants();
      setParticipants(next);
      setSelectedSubject((current) => current ?? next[0]?.subject);
    } catch (cause) {
      setError(messageFor(cause, 'The research archive could not be opened.'));
    } finally {
      setLoading(undefined);
    }
  };

  useEffect(() => {
    void refreshParticipants();
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    let current = true;
    setLoading('turns');
    setError(undefined);
    setEvents([]);
    setSelectedTurnId(undefined);
    void listBatches(selectedSubject)
      .then((next) => {
        if (current) setBatches(next);
      })
      .catch((cause: unknown) => {
        if (current) setError(messageFor(cause, 'Participant turns could not be loaded.'));
      })
      .finally(() => {
        if (current) setLoading(undefined);
      });
    return () => {
      current = false;
    };
  }, [selectedSubject, listBatches]);

  const turns = useMemo(() => groupTurns(batches), [batches]);
  const selectedTurn = turns.find(({ id }) => id === selectedTurnId);
  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return events;
    return events.filter(
      (event) =>
        event.eventType.toLocaleLowerCase().includes(needle) ||
        stringify(event.data).toLocaleLowerCase().includes(needle),
    );
  }, [events, query]);

  const openTurn = async (turn: TurnGroup) => {
    if (!selectedSubject) return;
    setSelectedTurnId(turn.id);
    setLoading('events');
    setError(undefined);
    try {
      const documents = await mapWithConcurrency(turn.batches, 3, ({ batchId }) =>
        readBatch(selectedSubject, batchId),
      );
      setEvents(readArchiveEvents(documents));
      setVisibleLimit(EVENT_PAGE_SIZE);
    } catch (cause) {
      setError(messageFor(cause, 'The raw turn could not be loaded.'));
      setEvents([]);
    } finally {
      setLoading(undefined);
    }
  };

  return (
    <SettingsSectionHeader
      title="Raw trajectory archive"
      description="Admins can inspect the exact ordered events uploaded by research-release participants. Every archive read is audited."
    >
      <div className={styles.researchArchiveToolbar}>
        <div>
          <Database size={18} aria-hidden="true" />
          <span>{participants.length} participants</span>
          <span>{turns.length} turns</span>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void refreshParticipants()}
          disabled={Boolean(loading)}
        >
          <ArrowClockwise size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div className={styles.settingsError} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.researchArchiveGrid}>
        <section className={styles.researchArchiveColumn} aria-label="Participants">
          <header>
            <UsersThree size={16} aria-hidden="true" />
            <strong>Participants</strong>
          </header>
          <div className={styles.researchArchiveList}>
            {participants.map((participant) => (
              <button
                type="button"
                key={participant.subject}
                className={
                  selectedSubject === participant.subject ? styles.archiveRowActive : ''
                }
                onClick={() => setSelectedSubject(participant.subject)}
              >
                <strong>{participant.email ?? shortId(participant.subject)}</strong>
                <span>
                  {participant.batchCount} bundles · {formatBytes(participant.byteLength)}
                </span>
                <small>{formatTime(participant.lastCreatedAt)}</small>
              </button>
            ))}
            {!participants.length && loading !== 'participants' ? (
              <p>No uploaded research records.</p>
            ) : null}
          </div>
        </section>

        <section className={styles.researchArchiveColumn} aria-label="Turns">
          <header>
            <Eye size={16} aria-hidden="true" />
            <strong>Turns</strong>
          </header>
          <div className={styles.researchArchiveList}>
            {turns.map((turn) => (
              <button
                type="button"
                key={turn.id}
                className={selectedTurnId === turn.id ? styles.archiveRowActive : ''}
                onClick={() => void openTurn(turn)}
              >
                <strong>{shortId(turn.turnId)}</strong>
                <span>{turn.eventKinds.slice(0, 2).join(' · ') || 'Raw events'}</span>
                <small>
                  {formatTime(turn.createdAt)} · {formatBytes(turn.byteLength)}
                </small>
              </button>
            ))}
            {!turns.length && loading !== 'turns' ? (
              <p>No turns for this participant.</p>
            ) : null}
          </div>
        </section>

        <section
          className={`${styles.researchArchiveColumn} ${styles.researchEventColumn}`}
          aria-label="Raw events"
        >
          <header>
            <strong>
              {selectedTurn ? `Turn ${shortId(selectedTurn.turnId)}` : 'Raw events'}
            </strong>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleLimit(EVENT_PAGE_SIZE);
              }}
              placeholder="Filter events"
              aria-label="Filter raw events"
              disabled={!events.length}
            />
          </header>
          <div className={styles.researchEventList}>
            {visibleEvents.slice(0, visibleLimit).map((event) => (
              <details key={event.id} className={styles.researchEventRow}>
                <summary>
                  <span>{event.eventType}</span>
                  <time>{formatTime(event.occurredAt)}</time>
                </summary>
                <EventImages value={event.data} />
                <pre>{stringify(event.data)}</pre>
              </details>
            ))}
            {visibleEvents.length > visibleLimit ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setVisibleLimit((count) => count + EVENT_PAGE_SIZE)}
              >
                Load {Math.min(EVENT_PAGE_SIZE, visibleEvents.length - visibleLimit)} more
              </button>
            ) : null}
            {loading === 'events' ? <p>Reading raw bundles…</p> : null}
            {selectedTurn && !visibleEvents.length && loading !== 'events' ? (
              <p>No events match this filter.</p>
            ) : null}
            {!selectedTurn ? <p>Select a turn to inspect its ordered event stream.</p> : null}
          </div>
        </section>
      </div>
    </SettingsSectionHeader>
  );
}

function groupTurns(batches: readonly ResearchBatchSummary[]): TurnGroup[] {
  const grouped = new Map<string, TurnGroup>();
  for (const batch of batches) {
    const threadId = batch.scope?.threadId ?? 'legacy';
    const turnId = batch.scope?.turnId ?? batch.batchId;
    const id = `${threadId}:${turnId}`;
    const existing = grouped.get(id);
    if (existing) {
      existing.batches.push(batch);
      existing.byteLength += batch.byteLength;
      existing.eventKinds.push(...(batch.scope?.eventKinds ?? []));
      if (batch.createdAt > existing.createdAt) existing.createdAt = batch.createdAt;
    } else {
      grouped.set(id, {
        id,
        threadId,
        turnId,
        createdAt: batch.createdAt,
        byteLength: batch.byteLength,
        batches: [batch],
        eventKinds: [...(batch.scope?.eventKinds ?? [])],
      });
    }
  }
  return [...grouped.values()]
    .map((turn) => ({ ...turn, eventKinds: [...new Set(turn.eventKinds)] }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function readArchiveEvents(documents: readonly unknown[]): ArchiveEvent[] {
  const events = documents.flatMap((document) => {
    const record = asRecord(document);
    return Array.isArray(record.events) ? record.events : [];
  });
  const output: ArchiveEvent[] = [];
  const chunks = new Map<
    string,
    Array<{ index: number; count: number; data: string; event: Record<string, unknown> }>
  >();
  for (const candidate of events) {
    const event = asRecord(candidate);
    const payload = asRecord(event.payload);
    if (event.kind === 'raw.event_chunk' && typeof payload.eventId === 'string') {
      const entries = chunks.get(payload.eventId) ?? [];
      entries.push({
        index: Number(payload.chunkIndex),
        count: Number(payload.chunkCount),
        data: String(payload.chunkData ?? ''),
        event,
      });
      chunks.set(payload.eventId, entries);
      continue;
    }
    output.push(toArchiveEvent(event));
  }
  for (const [eventId, entries] of chunks) {
    const ordered = entries.sort((left, right) => left.index - right.index);
    const first = ordered[0];
    const complete =
      Boolean(first) &&
      first!.count > 0 &&
      ordered.length === first!.count &&
      ordered.every(
        (entry, index) =>
          entry.index === index && entry.count === first!.count && Boolean(entry.data),
      );
    if (!first || !complete) {
      output.push({
        id: `integrity-${eventId}`,
        occurredAt: String(first?.event.occurredAt ?? ''),
        eventType: 'archive.integrity_error',
        data: {
          eventId,
          expectedChunks: first?.count ?? null,
          observedChunks: ordered.length,
          message: 'The archived event is incomplete and was not reconstructed.',
        },
      });
      continue;
    }
    const payload = asRecord(first.event.payload);
    output.push({
      id: eventId,
      occurredAt: String(first.event.occurredAt ?? ''),
      eventType: String(payload.eventType ?? 'raw.event'),
      ...(typeof payload.sequence === 'number' ? { sequence: payload.sequence } : {}),
      data: decodeChunkedJson(ordered.map(({ data }) => data)),
    });
  }
  return output.sort(
    (left, right) =>
      (left.sequence ?? Number.MAX_SAFE_INTEGER) -
        (right.sequence ?? Number.MAX_SAFE_INTEGER) ||
      left.occurredAt.localeCompare(right.occurredAt),
  );
}

function toArchiveEvent(event: Record<string, unknown>): ArchiveEvent {
  const payload = asRecord(event.payload);
  return {
    id: String(event.id ?? crypto.randomUUID()),
    occurredAt: String(event.occurredAt ?? ''),
    eventType: String(payload.eventType ?? event.kind ?? 'research.event'),
    ...(typeof payload.sequence === 'number' ? { sequence: payload.sequence } : {}),
    data: event.kind === 'raw.event' ? payload.data : event,
  };
}

function decodeChunkedJson(chunks: readonly string[]): unknown {
  try {
    const binary = chunks.map((chunk) => atob(chunk)).join('');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return { decodeError: 'The raw event chunks could not be reconstructed.' };
  }
}

function EventImages({ value }: { value: unknown }) {
  const images = findImages(value);
  if (!images.length) return null;
  return (
    <div className={styles.researchEventImages}>
      {images.map((image, index) => (
        <img
          key={`${image.mimeType}-${index}`}
          src={`data:${image.mimeType};base64,${image.dataBase64}`}
          alt={`Captured research frame ${index + 1}`}
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
}

function findImages(value: unknown): Array<{ mimeType: string; dataBase64: string }> {
  const found: Array<{ mimeType: string; dataBase64: string }> = [];
  const visit = (candidate: unknown, depth: number) => {
    if (depth > 6 || found.length >= 4) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    const record = asRecord(candidate);
    if (
      typeof record.mimeType === 'string' &&
      /^(?:image\/png|image\/jpeg|image\/webp)$/.test(record.mimeType) &&
      typeof record.dataBase64 === 'string'
    ) {
      found.push({ mimeType: record.mimeType, dataBase64: record.dataBase64 });
      return;
    }
    Object.values(record).forEach((item) => visit(item, depth + 1));
  };
  visit(value, 0);
  return found;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await operation(values[index]!);
    }
  });
  await Promise.all(workers);
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function shortId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
