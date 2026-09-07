import React, { useRef, useState } from 'react';
import { duplicateSlots, FILE_SLOTS, FileSlot, inspectBulkFile } from '../services/bulkImport';

interface Entry { file: File; slot: FileSlot | ''; error?: string }
interface Props { disabled: boolean; onAssign: (files: { file: File; slot: FileSlot }[]) => void }

export function BulkFileUpload({ disabled, onAssign }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState('');
  const duplicates = duplicateSlots(entries.map(entry => entry.slot));
  const selected = entries.filter(entry => entry.slot && !entry.error);
  const locked = disabled || busy;

  async function inspect(files: File[]) {
    if (disabled || busyRef.current || !files.length) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    try {
      const results = await Promise.all(files.map(async file => {
        try { return { file, slot: await inspectBulkFile(file) }; }
        catch (error) { return { file, slot: '' as const, error: error instanceof Error ? error.message : String(error) }; }
      }));
      setEntries(results);
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <section className="mb-3 rounded-lg border border-gray-200 bg-slate-50 p-3" aria-label="Bulk file upload">
    <input ref={input} type="file" multiple accept=".xls,.xlsx" className="hidden" onChange={e => {
      void inspect(Array.from(e.target.files || []));
      e.target.value = '';
    }} />
    <button type="button" disabled={locked} onClick={() => input.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!locked) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); void inspect(Array.from(e.dataTransfer.files)); }}
      className={`w-full rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors disabled:opacity-50 ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
      <span className="block font-semibold">{busy ? 'Identifying files…' : 'Drop all files here, or select several at once'}</span>
      <span className="block mt-1 text-xs text-gray-500">PO DE / EU / UK · Availability · Tags · Outer</span>
    </button>
    {!!entries.length && <div className="mt-3">
      <p className="text-xs text-gray-600 mb-2">Review the assignments. Select the region for unidentified PO files. Assigned files replace the current selection in that slot.</p>
      {entries.map((entry, index) => <div key={index} className="flex flex-wrap items-center gap-2 py-1">
        <span className="min-w-0 flex-1 truncate text-xs" title={entry.file.name}>{entry.file.name}</span>
        {entry.error ? <span className="text-xs text-red-700">{entry.error}</span> : <select
          aria-label={`Assign ${entry.file.name}`} value={entry.slot} disabled={locked}
          onChange={e => setEntries(current => current.map((item, i) => i === index ? { ...item, slot: e.target.value as FileSlot | '' } : item))}
          className="border border-gray-300 rounded p-1 text-xs">
          <option value="">Unassigned / skip</option>
          {FILE_SLOTS.map(slot => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
        </select>}
      </div>)}
      {!!duplicates.length && <p role="alert" className="text-xs text-red-700 mt-2">Choose only one file per slot: {duplicates.join(', ')}.</p>}
      <button type="button" disabled={locked || !selected.length || !!duplicates.length}
        className="mt-2 rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        onClick={() => {
          onAssign(selected.map(entry => ({ file: entry.file, slot: entry.slot as FileSlot })));
          setNotice(`${selected.length} files assigned. ${entries.length - selected.length} skipped. You can now process the files.`);
          setEntries([]);
        }}>Assign {selected.length} files</button>
    </div>}
    <p role="status" className="mt-2 text-xs text-green-700">{busy ? 'Reading file contents…' : notice}</p>
  </section>;
}
