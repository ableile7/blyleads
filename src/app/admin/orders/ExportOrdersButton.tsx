'use client'

export type ExportRow = {
  agent: string
  email: string
  tiers: string
  leads: number
  priceList: string
  priceAfterDiscount: string
  total: string
  status: string
  date: string
  downloaded: string
  sessionId: string
  note: string
}

const HEADERS = [
  'Agent', 'Email', 'Tiers', 'Leads', 'Price/Lead (List)', 'Price/Lead (After Discount)',
  'Total Collected', 'Status', 'Order Date', 'Downloaded', 'Session ID', 'Payment Note',
]

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function isoDate(d: string): string {
  if (!d) return ''
  const t = new Date(d)
  return isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10)
}

export default function ExportOrdersButton({ rows }: { rows: ExportRow[] }) {
  function handleExport() {
    const lines = [HEADERS.join(',')]
    for (const r of rows) {
      lines.push([
        r.agent, r.email, r.tiers, r.leads, r.priceList, r.priceAfterDiscount,
        r.total, r.status, isoDate(r.date), isoDate(r.downloaded), r.sessionId, r.note,
      ].map(csvEscape).join(','))
    }
    // Prepend a BOM so Excel opens UTF-8 correctly.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `blyleads-orders-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={rows.length === 0}
      className="text-xs font-semibold text-[#1F3864] border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 whitespace-nowrap"
    >
      ↓ Export CSV
    </button>
  )
}
