import { getStore } from '@netlify/blobs'
import { hash } from 'bcrypt'

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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return Response.json({ error: 'Неверный формат email' }, { status: 400 })
  }

  if (password.length < 6) {
    return Response.json({ error: 'Пароль должен быть не менее 6 символов' }, { status: 400 })
  }

  const store = getStore({ name: 'users', consistency: 'strong' })

  const existing = await store.get(email, { type: 'json' })
  if (existing) {
    return Response.json({ error: 'Этот email уже зарегистрирован' }, { status: 409 })
  }

  const hashedPassword = await hash(password, 10)
  await store.setJSON(email, {
    email,
    password: hashedPassword,
    created_at: new Date().toISOString(),
  })

  return Response.json({ success: true })
}

export const config = {
  path: '/api/register',
  method: 'POST',
}
