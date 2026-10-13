import { randomUUID } from 'node:crypto'
import { catalog, shippingCost } from './catalog.js'

function checkoutUrl(path = '') {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '')
  return siteUrl ? `${siteUrl}${path}` : undefined
}

function checkoutPoint(preference) {
  return process.env.MERCADO_PAGO_ENVIRONMENT === 'test'
    ? preference.sandbox_init_point
    : preference.init_point
}

function hasDeliveryDetails(customer) {
  const requiredFields = ['name', 'email', 'phone', 'address', 'city']
  return requiredFields.every((field) => typeof customer?.[field] === 'string' && customer[field].trim().length > 1)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ message: 'Metodo no permitido.' })
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) return response.status(500).json({ message: 'Falta configurar Mercado Pago.' })

  const { cart, customer } = request.body ?? {}
  if (!Array.isArray(cart) || cart.length === 0 || !hasDeliveryDetails(customer)) {
    return response.status(400).json({ message: 'Completa el carrito y los datos de entrega.' })
  }

  const quantities = cart.reduce((total, { id, quantity }) => {
    if (typeof id === 'string' && Number.isInteger(quantity)) total[id] = (total[id] ?? 0) + quantity
    return total
  }, {})
  const items = Object.entries(quantities).map(([id, quantity]) => {
    const product = catalog[id]
    if (!product || quantity < 1 || quantity > 20) return null
    return { title: product.title, unit_price: product.unit_price, quantity, currency_id: 'MXN' }
  })
  if (items.includes(null)) return response.status(400).json({ message: 'El pedido contiene productos o cantidades invalidas.' })
  items.push({ title: 'Envio', unit_price: shippingCost, quantity: 1, currency_id: 'MXN' })

  try {
    const mercadoPagoResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items,
        external_reference: randomUUID(),
        payer: { email: customer.email.trim() },
        metadata: {
          customer_name: customer.name.trim(),
          customer_phone: customer.phone.trim(),
          delivery_address: customer.address.trim(),
          delivery_city: customer.city.trim(),
          delivery_notes: typeof customer.notes === 'string' ? customer.notes.trim() : '',
        },
        back_urls: checkoutUrl('?payment_status=approved') ? {
          success: checkoutUrl('?payment_status=approved'),
          pending: checkoutUrl('?payment_status=pending'),
          failure: checkoutUrl('?payment_status=failure'),
        } : undefined,
        auto_return: checkoutUrl() ? 'approved' : undefined,
        notification_url: checkoutUrl('/api/mercado-pago-webhook'),
        statement_descriptor: 'OAXACA PAL NORTE',
      }),
    })
    const preference = await mercadoPagoResponse.json()
    const initPoint = checkoutPoint(preference)
    if (!mercadoPagoResponse.ok || !initPoint) {
      return response.status(502).json({ message: 'Mercado Pago no pudo iniciar el pago.' })
    }
    return response.status(200).json({ initPoint })
  } catch {
    return response.status(502).json({ message: 'No fue posible conectar con Mercado Pago.' })
  }
}