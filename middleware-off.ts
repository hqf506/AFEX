import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type AppRole = 'admin' | 'employee' | 'cashier'

const LOGIN_PATH = '/login'
const HOME_PATH = '/'

function isProtectedPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/invoice')
  )
}

function getAllowedRoles(pathname: string): AppRole[] {
  if (pathname.startsWith('/admin')) {
    return ['admin']
  }

  if (pathname.startsWith('/orders')) {
    return ['admin', 'employee']
  }

  if (pathname.startsWith('/invoice')) {
    return ['admin', 'employee', 'cashier']
  }

  if (pathname === '/') {
    return ['admin', 'employee', 'cashier']
  }

  return ['admin', 'employee', 'cashier']
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response.cookies.set({
            name,
            value,
            ...(options as object),
          })
        },
        remove(name: string, options: Record<string, unknown>) {
          response.cookies.set({
            name,
            value: '',
            ...(options as object),
          })
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (pathname === LOGIN_PATH && user) {
    return NextResponse.redirect(new URL(HOME_PATH, request.url))
  }

  if (!isProtectedPath(pathname)) {
    return response
  }

  if (!user) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url))
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !profile?.role) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url))
  }

  const allowedRoles = getAllowedRoles(pathname)
  const userRole = profile.role as AppRole

  if (!allowedRoles.includes(userRole)) {
    return NextResponse.redirect(new URL(HOME_PATH, request.url))
  }

  return response
}

export const config = {
  matcher: ['/', '/login', '/admin/:path*', '/orders/:path*', '/invoice/:path*'],
}
