import { createAdminClient } from '@/lib/supabase/server'
import UploadForm from './UploadForm'
import LocalDateTime from './LocalDateTime'
import { tierLabel } from '@/lib/tiers'

type Batch = {
  id: string
  filename: string
  tier: string | null
  inserted: number
  skipped: number
  uploaded_at: string
}

export default async function AdminUploadPage() {
  const supabase = createAdminClient()
  const { data: batches } = await supabase
    .from('upload_batches')
    .select('*')
    .order('uploaded_at', { ascending: false })

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Leads</h2>
      <p className="text-gray-500 text-sm mb-8">
        Upload a CSV batch. Tier is detected from the filename (APEX → Apex Core, A-TIER → Apex Essential, BRONZE → Prime, COPPER → Select, RUBY → Premier, GOLD → Core, SILVER → Essential, DATA → Data Leads).
        Duplicate leads are skipped automatically.
      </p>

      <UploadForm />

      <div className="mt-12">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Upload History</h3>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Skipped</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(batches as Batch[] | null)?.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3 text-gray-800 font-medium">{b.filename}</td>
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{b.tier ? tierLabel(b.tier) : '—'}</td>
                  <td className="px-5 py-3 text-gray-800 font-semibold text-right tabular-nums">{b.inserted.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-400 text-right tabular-nums">{b.skipped ? b.skipped.toLocaleString() : '—'}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    <LocalDateTime iso={b.uploaded_at} />
                  </td>
                </tr>
              ))}
              {(!batches || batches.length === 0) && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No uploads yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
