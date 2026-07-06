import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Public routes — always accessible
  const publicPaths = ['/', '/signup', '/pending']
  if (publicPaths.includes(path) || path.startsWith('/api/') || path.startsWith('/admin')) {
    return supabaseResponse
  }

  // Not logged in → login page
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Check agent approval status
  const { data: agent } = await supabase
    .from('agents')
    .select('status')
    .eq('id', user.id)
    .single()

  if (!agent || agent.status === 'pending') {
    return NextResponse.redirect(new URL('/pending', request.url))
  }

  // Temporarily blocked — account, orders, and leads stay intact; no portal
  // access until an admin reinstates them.
  if (agent.status === 'suspended') {
    return NextResponse.redirect(new URL('/pending?reason=suspended', request.url))
  }

  if (agent.status === 'rejected') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
}
