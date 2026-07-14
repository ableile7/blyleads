'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { detectTier } from '@/lib/tiers'

const CHUNK_SIZE = 3000

type FileResult = {
  name: string
  status: 'pending' | 'parsing' | 'uploading' | 'done' | 'error'
  tier?: string
  total?: number
  processed?: number
  inserted?: number
  skipped?: number
  skippedRows?: Record<string, string>[]
  tierCounts?: Record<string, number>
  error?: string
}

export default function UploadForm() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<FileResult[]>([])
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)

  function loadFiles(selected: File[]) {
    setFiles(selected)
    setResults(selected.map(f => ({ name: f.name, status: 'pending' })))
  }
  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    loadFiles(Array.from(e.target.files || []))
    if (fileRef.current) fileRef.current.value = ''
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function handleDragLeave(e: React.DragEvent) { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => /\.(csv|xlsx?)$/i.test(f.name))
    if (dropped.length > 0) loadFiles(dropped)
  }
  function updateResult(index: number, patch: Partial<FileResult>) {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  function parseCsv(file: File): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data),
        error: err => reject(err),
      })
    })
  }

  // Excel: first sheet, first row = headers. raw:false gives each cell's
  // FORMATTED text, so dates come through as "6/22/23" (not serial numbers
  // like 45099) and the year-tier routing still works.
  async function parseExcel(file: File): Promise<Record<string, string>[]> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return []
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' })
    return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])))
  }

  const isExcel = (name: string) => /\.xlsx?$/i.test(name)

  function parseFile(file: File): Promise<Record<string, string>[]> {
    return isExcel(file.name) ? parseExcel(file) : parseCsv(file)
  }

  // Retried up to 3 times: a single network blip 25 chunks into a large file
  // shouldn't kill the whole upload. Re-sending a chunk the server already
  // processed is safe — dedup skips its rows.
  async function uploadChunk(tier: string, rows: Record<string, string>[], finalize: boolean) {
    let lastErr: unknown
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier, rows, finalize }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        return data as { inserted: number; skipped: number; skippedRows?: Record<string, string>[]; tierCounts?: Record<string, number> }
      } catch (e) {
        lastErr = e
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
    throw lastErr
  }

  // Download the skipped duplicates as a CSV (original columns + Skip Reason).
  function downloadDuplicates(name: string, rows: Record<string, string>[]) {
    if (rows.length === 0) return
    const headers = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set }, new Set<string>()))
    const esc = (v: string) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = [headers.join(',')]
    for (const r of rows) lines.push(headers.map(h => esc(r[h] ?? '')).join(','))
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `duplicates-${name.replace(/\.csv$/i, '')}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  async function handleUpload() {
    if (files.length === 0) return
    setRunning(true)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const tier = detectTier(file.name)
      if (!tier) {
        updateResult(i, { status: 'error', error: 'Filename must contain APEX, BRONZE, COPPER, RUBY, GOLD, SILVER, or DATA' })
        continue
      }

      try {
        updateResult(i, { status: 'parsing', tier })
        const rows = await parseFile(file)
        const total = rows.length
        updateResult(i, { status: 'uploading', total, processed: 0, inserted: 0, skipped: 0 })

        let inserted = 0, skipped = 0, processed = 0
        const skippedRows: Record<string, string>[] = []
        const tierCounts: Record<string, number> = {}
        for (let c = 0; c < rows.length; c += CHUNK_SIZE) {
          const chunk = rows.slice(c, c + CHUNK_SIZE)
          const isLast = c + CHUNK_SIZE >= rows.length
          const r = await uploadChunk(tier, chunk, isLast)
          inserted += r.inserted; skipped += r.skipped; processed += chunk.length
          if (r.skippedRows) skippedRows.push(...r.skippedRows)
          for (const [t, n] of Object.entries(r.tierCounts || {})) tierCounts[t] = (tierCounts[t] || 0) + n
          updateResult(i, { processed, inserted, skipped })
        }
        updateResult(i, { status: 'done', inserted, skipped, skippedRows, tierCounts })
        // Record the upload in the history log (best-effort).
        try {
          await fetch('/api/admin/upload-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, tier, inserted, skipped }),
          })
        } catch { /* logging failure shouldn't affect the upload */ }
      } catch (e) {
        updateResult(i, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' })
      }
    }

    setRunning(false)
    setFiles([])
    router.refresh() // refresh the upload-history table below
  }

  const allDone = results.length > 0 && results.every(r => r.status === 'done' || r.status === 'error')

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${dragging ? 'border-[#1F3864] bg-blue-50' : 'border-gray-200 hover:border-[#1F3864]'}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {files.length > 0 ? (
            <p className="text-sm font-semibold text-[#1F3864]">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-600">Drop files here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">CSV or Excel (.xlsx) — filenames must contain APEX, BRONZE, COPPER, RUBY, GOLD, SILVER, or DATA</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={handleSelect} />
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((r, i) => {
              const pct = r.total ? Math.round(((r.processed ?? 0) / r.total) * 100) : 0
              return (
                <div key={i} className={`rounded-xl px-4 py-3 text-sm ${
                  r.status === 'done'      ? 'bg-green-50 border border-green-200' :
                  r.status === 'error'     ? 'bg-red-50 border border-red-200' :
                  r.status === 'uploading' || r.status === 'parsing' ? 'bg-blue-50 border border-blue-200' :
                  'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-semibold truncate max-w-[280px] ${
                        r.status === 'done' ? 'text-green-700' :
                        r.status === 'error' ? 'text-red-600' :
                        r.status === 'uploading' || r.status === 'parsing' ? 'text-blue-700' : 'text-gray-500'
                      }`}>{r.name}{r.tier ? ` → ${r.tier}` : ''}</p>
                      {r.status === 'parsing' && <p className="text-blue-500 mt-0.5">Reading file…</p>}
                      {r.status === 'uploading' && (
                        <p className="text-blue-600 mt-0.5">
                          {(r.processed ?? 0).toLocaleString()} / {(r.total ?? 0).toLocaleString()} rows · {(r.inserted ?? 0).toLocaleString()} added{r.skipped ? `, ${r.skipped.toLocaleString()} skipped` : ''}
                        </p>
                      )}
                      {r.status === 'done' && (
                        <p className="text-green-600 mt-0.5">
                          {(r.inserted ?? 0).toLocaleString()} added{r.skipped ? `, ${(r.skipped).toLocaleString()} skipped (duplicates)` : ''} of {(r.total ?? 0).toLocaleString()}
                          {r.tierCounts && Object.keys(r.tierCounts).length > 1 && (
                            <span className="block text-xs text-green-700 mt-0.5">
                              {Object.entries(r.tierCounts).sort().map(([t, n]) => `${t}: ${n.toLocaleString()}`).join(' · ')}
                            </span>
                          )}
                          {r.skippedRows && r.skippedRows.length > 0 && (
                            <button
                              onClick={() => downloadDuplicates(r.name, r.skippedRows!)}
                              className="ml-2 text-[#1F3864] font-semibold hover:underline"
                            >
                              ↓ Download duplicates ({r.skippedRows.length})
                            </button>
                          )}
                        </p>
                      )}
                      {r.status === 'error' && <p className="text-red-500 mt-0.5">{r.error}</p>}
                    </div>
                    <span className="text-lg flex-shrink-0">
                      {r.status === 'done' ? '✓' : r.status === 'error' ? '✗' : (r.status === 'uploading' || r.status === 'parsing') ? '⏳' : '·'}
                    </span>
                  </div>
                  {r.status === 'uploading' && r.total ? (
                    <div className="mt-2 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1F3864] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={allDone ? () => { setFiles([]); setResults([]) } : handleUpload}
          disabled={files.length === 0 || running}
          className="mt-6 w-full bg-[#1F3864] text-white rounded-lg py-3 font-semibold hover:bg-[#2a4a80] transition disabled:opacity-50"
        >
          {running ? 'Uploading…' : allDone ? 'Upload More Files' : `Upload ${files.length > 0 ? files.length + ' ' : ''}File${files.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-6">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Filename → Tier Detection</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Contains APEX</span><span className="font-semibold text-[#b8860b]">Apex Core</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains A-TIER</span><span className="font-semibold text-gray-600">Apex Essential</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains BRONZE</span><span className="font-semibold text-[#1F3864]">Prime</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains COPPER</span><span className="font-semibold text-[#2d4a1e]">Select</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains RUBY</span><span className="font-semibold text-[#4a1e3a]">Premier</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains GOLD</span><span className="font-semibold text-yellow-600">Core (split by year)</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains SILVER</span><span className="font-semibold text-gray-500">Essential (split by year)</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains DATA</span><span className="font-semibold text-[#0f766e]">Data Leads</span></div>
        </div>
        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          GOLD and SILVER rows are routed into 2018-2020 / 2021-2022 / 2023 tiers by each
          row&apos;s Record Date. Rows with no readable date (or a year outside those ranges)
          stay in the base Core/Essential tier — the result line shows the split.
        </p>
      </div>
    </div>
  )
}
