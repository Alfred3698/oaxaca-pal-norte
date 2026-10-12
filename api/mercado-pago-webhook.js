import { createHmac, timingSafeEqual } from 'node:crypto'

function signatureIsValid(request) {
  const signature = request.headers['x-signature']
  const requestId = request.headers['x-request-id']
  const paymentId = request.query['data.id'] ?? request.body?.data?.id
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!signature || !requestId || !paymentId || !secret) return false

  const parts = Object.fromEntries(signature.split(',').map((part) => part.trim().split('=')))
  if (!parts.ts || !parts.v1) return false
  const manifest = `id:${String(paymentId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  const received = Buffer.from(parts.v1, 'hex')
  const calculated = Buffer.from(expected, 'hex')
  return received.length === calculated.length && timingSafeEqual(received, calculated)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).end()
  if (!signatureIsValid(request)) return response.status(401).end()

  const paymentId = request.query['data.id'] ?? request.body?.data?.id
  try {
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` },
    })
    const payment = await paymentResponse.json()
    if (!paymentResponse.ok) return response.status(502).end()

    if (payment.status === 'approved') {
      console.info('Payment approved', { paymentId: payment.id, reference: payment.external_reference })
    }
    return response.status(200).end()
  } catch {
    return response.status(500).end()
  }
}