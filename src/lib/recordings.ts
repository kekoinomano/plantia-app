import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { PlantPacket } from './plant-packet';
import type { Recording } from './sonora/signal';

// Change this single value to adjust the maximum recording length.
export const MAX_RECORDING_MINUTES = 10;
export const MAX_RECORDING_MS = MAX_RECORDING_MINUTES * 60_000;

export type SavedRecording = { id: string; name: string; startedAt: string; durationMs: number; packets: number };
const directory = new Directory(Paths.document, 'recordings');
const openJournals = new Set<string>();
const fileFor = (id: string, extension = 'json') => new File(directory, `${id}.${extension}`);
const encoder = new TextEncoder();

function ensureDirectory() { directory.create({ idempotent: true, intermediates: true }); }
function validId(id: string) { if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Grabación no válida.'); }
function summary(recording: Recording): SavedRecording {
  return { id: recording.session.id, name: recording.session.name,
    startedAt: recording.session.started_at, durationMs: recording.packets.at(-1)?.elapsed_ms ?? 0,
    packets: recording.packets.length };
}

export class RecordingWriter {
  readonly id: string;
  readonly startedAt = new Date().toISOString();
  private started = performance.now();
  private file: File;
  private pending: PlantPacket[] = [];
  private count = 0;
  private lastElapsed = 0;
  private closed = false;

  constructor(readonly name: string) {
    ensureDirectory();
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.file = fileFor(this.id, 'jsonl');
    this.file.create();
    this.file.write(JSON.stringify({ id: this.id, name, started_at: this.startedAt }) + '\n');
    openJournals.add(this.id);
  }

  add(packet: PlantPacket) {
    if (this.closed) return;
    const elapsed_ms = Math.max(this.lastElapsed, performance.now() - this.started);
    this.lastElapsed = elapsed_ms;
    this.pending.push({ seq: this.count++, elapsed_ms, values: packet.values, ...(packet.error ? { error: packet.error } : {}) });
    if (this.pending.length >= 25) this.flush();
  }

  flush() {
    if (!this.pending.length || this.closed) return;
    const batch = this.pending.map(packet => JSON.stringify(packet)).join('\n') + '\n';
    const handle = this.file.open(FileMode.Append);
    try { handle.writeBytes(encoder.encode(batch)); this.pending = []; }
    finally { handle.close(); }
  }

  get durationMs() { return this.lastElapsed; }
  get packetCount() { return this.count; }

  finish(): SavedRecording | null {
    if (this.closed) return null;
    this.flush();
    this.closed = true;
    try { return finishJournal(this.file); }
    finally { openJournals.delete(this.id); }
  }
}

function finishJournal(journal: File): SavedRecording | null {
  const lines = journal.textSync().split('\n').filter(Boolean);
  if (!lines.length) { journal.delete(); return null; }
  const header = JSON.parse(lines[0]) as { id: string; name: string; started_at: string };
  const packets: PlantPacket[] = [];
  for (const line of lines.slice(1)) {
    try { packets.push(JSON.parse(line) as PlantPacket); } catch { break; }
  }
  if (!packets.length) { journal.delete(); return null; }
  const recording: Recording = { session: { id: header.id, name: header.name,
    started_at: header.started_at, ended_at: new Date().toISOString(), mode: 'ble' }, packets };
  const target = fileFor(header.id);
  target.write(JSON.stringify(recording));
  journal.delete();
  return summary(recording);
}

export function listRecordings(): SavedRecording[] {
  ensureDirectory();
  for (const entry of directory.list()) {
    if (entry instanceof File && entry.name.endsWith('.jsonl') && !openJournals.has(entry.name.slice(0, -6))) {
      try { finishJournal(entry); } catch { /* Leave a damaged journal for diagnosis. */ }
    }
  }
  const result: SavedRecording[] = [];
  for (const entry of directory.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    try { result.push(summary(JSON.parse(entry.textSync()) as Recording)); } catch { /* Skip damaged files. */ }
  }
  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function loadRecording(id: string): Recording {
  validId(id);
  const recording = JSON.parse(fileFor(id).textSync()) as Recording;
  if (recording.session.id !== id || !Array.isArray(recording.packets)) throw new Error('La grabación está dañada.');
  return recording;
}

export function renameRecording(id: string, name: string) {
  const recording = loadRecording(id);
  recording.session.name = name.trim();
  fileFor(id).write(JSON.stringify(recording));
}

export function deleteRecording(id: string) {
  validId(id);
  const file = fileFor(id);
  if (file.exists) file.delete();
}
