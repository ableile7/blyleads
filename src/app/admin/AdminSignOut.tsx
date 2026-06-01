'use client'
export default function AdminSignOut() {
  async function handleSignOut() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    window.location.href = '/admin'
  }
  return (
    <button
      onClick={handleSignOut}
      className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition text-white ml-2"
    >
      Sign Out
    </button>
  )
}
