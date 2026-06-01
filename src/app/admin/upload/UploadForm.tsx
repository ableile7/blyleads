'use client'
import { useState, useRef } from 'react'

type UploadResult = {
  inserted: number
  skipped: number
  tier: string
  errors?: string[]
}

export default function UploadForm() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setResult(null)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/admin/upload', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Upload failed')
    } else {
      setResult(data)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#1F3864] transition"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {file ? (
            <p className="text-sm font-semibold text-[#1F3864]">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-600">Click to select CSV file</p>
              <p className="text-xs text-gray-400 mt-1">Filename must contain BRONZE, COPPER, or RUBY</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-700">Upload Complete — {result.tier} Tier</p>
            <p className="text-sm text-green-600 mt-1">✓ {result.inserted} leads inserted</p>
            {result.skipped > 0 && <p className="text-sm text-gray-500">{result.skipped} duplicates skipped</p>}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="mt-6 w-full bg-[#1F3864] text-white rounded-lg py-3 font-semibold hover:bg-[#2a4a80] transition disabled:opacity-50"
        >
          {loading ? 'Processing…' : 'Upload & Import'}
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
