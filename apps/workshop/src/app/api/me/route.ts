import { NextResponse } from 'next/server';
import { resolveAuth } from '@hq/auth/middleware';

export async function GET(request: Request) {
  const context = await resolveAuth({
    cookieHeader: request.headers.get('cookie'),
    authorizationHeader: request.headers.get('authorization'),
  });

  if (context.kind === 'none') {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    principal: {
      ...context.principal,
      permissions: context.principal.permissions,
    },
  });
}
