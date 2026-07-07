import { createAdminClient } from '@/lib/supabase/server'
import AgentActions from './AgentActions'

export default async function AdminAgentsPage() {
  const supabase = createAdminClient()
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false })

  const pending = agents?.filter(a => a.status === 'pending') ?? []
  const approved = agents?.filter(a => a.status === 'approved') ?? []
  const suspended = agents?.filter(a => a.status === 'suspended') ?? []
  const rejected = agents?.filter(a => a.status === 'rejected') ?? []

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-8">Agent Management</h2>

      {pending.length > 0 && (
        <section className="mb-10">
          <h3 className="text-sm font-bold text-amber-600 uppercase tracking-wide mb-4">
            Pending Approval ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(agent => (
              <div key={agent.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-800">
                    {agent.full_name}
                    {agent.agency === 'ELG' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-[#1F3864] text-white px-2 py-0.5 rounded-full align-middle">ELG</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{agent.email}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <AgentActions agentId={agent.id} currentStatus={agent.status} agency={agent.agency} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h3 className="text-sm font-bold text-green-600 uppercase tracking-wide mb-4">
          Approved ({approved.length})
        </h3>
        <div className="space-y-3">
          {approved.map(agent => (
            <div key={agent.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-800">{agent.full_name}</p>
                <p className="text-sm text-gray-500">{agent.email}</p>
              </div>
              <AgentActions agentId={agent.id} currentStatus={agent.status} agency={agent.agency} />
            </div>
          ))}
          {approved.length === 0 && <p className="text-sm text-gray-400">No approved agents yet.</p>}
        </div>
      </section>

      {suspended.length > 0 && (
        <section className="mb-10">
          <h3 className="text-sm font-bold text-amber-600 uppercase tracking-wide mb-4">
            Suspended ({suspended.length})
          </h3>
          <div className="space-y-3">
            {suspended.map(agent => (
              <div key={agent.id} className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-800">
                    {agent.full_name}
                    {agent.agency === 'ELG' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-[#1F3864] text-white px-2 py-0.5 rounded-full align-middle">ELG</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{agent.email}</p>
                </div>
                <AgentActions agentId={agent.id} currentStatus={agent.status} agency={agent.agency} />
              </div>
            ))}
          </div>
        </section>
      )}

      {rejected.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-red-500 uppercase tracking-wide mb-4">
            Rejected ({rejected.length})
          </h3>
          <div className="space-y-3">
            {rejected.map(agent => (
              <div key={agent.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-800">
                    {agent.full_name}
                    {agent.agency === 'ELG' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-[#1F3864] text-white px-2 py-0.5 rounded-full align-middle">ELG</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{agent.email}</p>
                </div>
                <AgentActions agentId={agent.id} currentStatus={agent.status} agency={agent.agency} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
