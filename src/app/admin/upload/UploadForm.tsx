'use client'
import { useState, useRef } from 'react'

type FileResult = {
  name: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  inserted?: number
  skipped?: number
  tier?: string
  error?: string
}

export default function UploadForm() {
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'))
    if (dropped.length > 0) loadFiles(dropped)
  }

  function updateResult(index: number, patch: Partial<FileResult>) {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  async function handleUpload() {
    if (files.length === 0) return
    setRunning(true)

    for (let i = 0; i < files.length; i++) {
      updateResult(i, { status: 'uploading' })

      const formData = new FormData()
      formData.append('file', files[i])

      try {
        const res = await fetch('/api/admin/upload', { method: 'POST', body: formData })
        const data = await res.json()

        if (!res.ok) {
          updateResult(i, { status: 'error', error: data.error || 'Upload failed' })
        } else {
          updateResult(i, { status: 'done', inserted: data.inserted, skipped: data.skipped, tier: data.tier })
        }
      } catch {
        updateResult(i, { status: 'error', error: 'Network error' })
      }
    }

    setRunning(false)
    setFiles([])
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
              <p className="text-xs text-gray-400 mt-1">Multiple files supported — filenames must contain BRONZE, COPPER, or RUBY</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={handleSelect} />
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-3 ${
                r.status === 'done'     ? 'bg-green-50 border border-green-200' :
                r.status === 'error'   ? 'bg-red-50 border border-red-200' :
                r.status === 'uploading' ? 'bg-blue-50 border border-blue-200' :
                'bg-gray-50 border border-gray-200'
              }`}>
                <div>
                  <p className={`font-semibold truncate max-w-[280px] ${
                    r.status === 'done' ? 'text-green-700' :
                    r.status === 'error' ? 'text-red-600' :
                    r.status === 'uploading' ? 'text-blue-700' :
                    'text-gray-500'
                  }`}>{r.name}</p>
                  {r.status === 'done' && (
                    <p className="text-green-600 mt-0.5">{r.tier} — {r.inserted} inserted{r.skipped ? `, ${r.skipped} skipped` : ''}</p>
                  )}
                  {r.status === 'error' && <p className="text-red-500 mt-0.5">{r.error}</p>}
                  {r.status === 'uploading' && <p className="text-blue-500 mt-0.5">Uploading…</p>}
                </div>
                <span className="text-lg flex-shrink-0">
                  {r.status === 'done' ? '✓' : r.status === 'error' ? '✗' : r.status === 'uploading' ? '⏳' : '·'}
                </span>
              </div>
            ))}
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
          <div className="flex justify-between"><span className="text-gray-500">Contains BRONZE</span><span className="font-semibold text-[#1F3864]">Prime</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains COPPER</span><span className="font-semibold text-[#2d4a1e]">Select</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Contains RUBY</span><span className="font-semibold text-[#4a1e3a]">Premier</span></div>
        </div>
      </div>
    </div>
  )
}
