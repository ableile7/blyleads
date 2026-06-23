import { isAdminAuthed } from '@/lib/adminAuth'
import AdminLoginGate from './AdminLoginGate'
import AdminSignOut from './AdminSignOut'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = isAdminAuthed()
  if (!authed) return <AdminLoginGate />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1F3864] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/emblem.png" alt="BlyLeads" className="h-9 w-auto" />
            <span className="text-xl font-bold">BlyLeads</span>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded font-semibold">Admin</span>
        </div>
        <nav className="flex items-center gap-1">
          {[
            { href: '/admin', label: 'Overview' },
            { href: '/admin/agents', label: 'Agents' },
            { href: '/admin/leads', label: 'Leads' },
            { href: '/admin/upload', label: 'Upload' },
            { href: '/admin/pricing', label: 'Pricing' },
            { href: '/admin/orders', label: 'Orders' },
          ].map(link => (
            <a key={link.href} href={link.href}
              className="text-sm text-blue-200 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition">
              {link.label}
            </a>
          ))}
          <AdminSignOut />
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
