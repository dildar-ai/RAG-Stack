import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Network-edge guard for the app (Next.js 16 "proxy" convention, formerly middleware).
 * Refreshes the Supabase session cookie and keeps /dashboard signed-in only.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser()

  // Public embeddable widget is served signed-out and skips the session check
  if (request.nextUrl.pathname.startsWith('/widget')) {
    return supabaseResponse
  }

  // Protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect logged in users away from login
  if (request.nextUrl.pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Signed-in dashboard HTML must never sit in browser caches: every visit
  // must re-run this guard so a signed-out session can't render stale pages.
  if (user && request.nextUrl.pathname.startsWith('/dashboard')) {
    supabaseResponse.headers.set('Cache-Control', 'no-store')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|widget|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
