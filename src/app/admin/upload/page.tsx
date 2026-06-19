import { createAdminClient } from '@/lib/supabase/server'
import UploadForm from './UploadForm'

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
        Upload a CSV batch. Tier is detected from the filename (BRONZE → Prime, COPPER → Select, RUBY → Premier, GOLD → Core, SILVER → Essential, DATA → Data Leads).
        Duplicate leads are skipped automatically.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <UploadForm />

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Upload History</h3>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['File', 'Tier', 'Added', 'Skipped', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(batches as Batch[] | null)?.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2.5 text-gray-800 max-w-[220px] truncate" title={b.filename}>{b.filename}</td>
                    <td className="px-4 py-2.5 text-gray-600">{b.tier ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700 font-medium">{b.inserted.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-400">{b.skipped ? b.skipped.toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(b.uploaded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
                {(!batches || batches.length === 0) && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No uploads yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
