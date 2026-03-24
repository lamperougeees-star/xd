import { getStore } from '@netlify/blobs'
import { compare } from 'bcrypt'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { email, password } = await req.json()

  if (!email || !password) {
    return Response.json({ error: 'Email и пароль обязательны' }, { status: 400 })
  }

  const store = getStore({ name: 'users', consistency: 'strong' })

  const user = await store.get(email, { type: 'json' })
  if (!user) {
    return Response.json({ error: 'Неверный email или пароль' }, { status: 401 })
  }

  const match = await compare(password, user.password)
  if (!match) {
    return Response.json({ error: 'Неверный email или пароль' }, { status: 401 })
  }

  return Response.json({ success: true })
}

export const config = {
  path: '/api/login',
  method: 'POST',
}
