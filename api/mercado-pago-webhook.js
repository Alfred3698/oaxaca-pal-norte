import { createHmac, timingSafeEqual } from 'node:crypto'

async function notifyBackoffice(payment) {
  const backofficeUrl = process.env.BACKOFFICE_URL?.replace(/\/$/, '')
  const secret = process.env.OAXACA_PAL_NORTE_API_SECRET
  if (!backofficeUrl || !secret) throw new Error('Falta configurar el servicio de pedidos.')

  const orderId = payment.external_reference
  if (typeof orderId !== 'string' || !orderId) throw new Error('El pago no tiene referencia de pedido.')

  const body = JSON.stringify({
    providerPaymentId: String(payment.id),
    status: payment.status,
    amount: payment.transaction_amount,
    currency: payment.currency_id,
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return fetch(`${backofficeUrl}/oaxaca-pal-norte/orders/${encodeURIComponent(orderId)}/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-oaxaca-timestamp': timestamp,
      'x-oaxaca-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(10000),
  })
}

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
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) return response.status(500).end()

  const paymentId = request.query['data.id'] ?? request.body?.data?.id
  try {
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` },
    })
    const payment = await paymentResponse.json()
    if (!paymentResponse.ok) {
      if (request.body?.live_mode === false && paymentResponse.status === 404) {
        console.info('Webhook test received', { paymentId })
        return response.status(200).end()
      }
      return response.status(502).end()
    }

    const backofficeResponse = await notifyBackoffice(payment)
    if (!backofficeResponse.ok) return response.status(502).end()
    return response.status(200).end()
  } catch {
    return response.status(500).end()
  }
}