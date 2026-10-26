import { createHmac, randomUUID } from 'node:crypto'
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
  const requiredFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'postalCode']
  return requiredFields.every((field) => typeof customer?.[field] === 'string' && customer[field].trim().length > 1)
}

async function registerOrder(order) {
  const backofficeUrl = process.env.BACKOFFICE_URL?.replace(/\/$/, '')
  const secret = process.env.OAXACA_PAL_NORTE_API_SECRET
  if (!backofficeUrl || !secret) throw new Error('Falta configurar el servicio de pedidos.')

  const body = JSON.stringify(order)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return fetch(`${backofficeUrl}/oaxaca-pal-norte/orders`, {
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

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ message: 'Metodo no permitido.' })
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) return response.status(500).json({ message: 'Falta configurar Mercado Pago.' })
  if (!process.env.BACKOFFICE_URL || !process.env.OAXACA_PAL_NORTE_API_SECRET) {
    return response.status(500).json({ message: 'Falta configurar el servicio de pedidos.' })
  }

  const { cart, customer } = request.body ?? {}
  if (!Array.isArray(cart) || cart.length === 0) {
    return response.status(400).json({ message: 'El carrito esta vacio o no es valido.' })
  }
  const requiredCustomerFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'postalCode']
  const missingCustomerFields = requiredCustomerFields.filter((field) => (
    typeof customer?.[field] !== 'string' || customer[field].trim().length <= 1
  ))
  if (missingCustomerFields.length > 0) {
    return response.status(400).json({
      message: 'Completa los datos de entrega requeridos.',
      missingFields: missingCustomerFields,
    })
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
  const orderItems = Object.entries(quantities).map(([id, quantity]) => ({
    productId: id,
    productTitle: catalog[id].title,
    quantity,
    unitPrice: catalog[id].unit_price,
  }))
  const subtotal = orderItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
  const orderId = randomUUID()
  const order = {
    orderId,
    customerName: customer.name.trim(),
    customerEmail: customer.email.trim(),
    customerPhone: customer.phone.trim(),
    shippingAddress: customer.address.trim(),
    shippingCity: customer.city.trim(),
    shippingState: customer.state.trim(),
    shippingPostalCode: customer.postalCode.trim(),
    deliveryNotes: typeof customer.notes === 'string' ? customer.notes.trim() : '',
    currency: 'MXN',
    subtotal,
    shippingAmount: shippingCost,
    totalAmount: subtotal + shippingCost,
    items: orderItems,
  }

  try {
    const orderResponse = await registerOrder(order)
    if (!orderResponse.ok) {
      const errorDetails = (await orderResponse.text()).slice(0, 1000)
      console.log('Backoffice order registration failed', {
        orderId,
        url: orderResponse.url,
        payload: JSON.stringify(order),
        status: orderResponse.status,
        statusText: orderResponse.statusText,
        response: errorDetails,
      })
      return response.status(502).json({ message: 'No fue posible registrar el pedido.' })
    }

    items.push({ title: 'Envio', unit_price: shippingCost, quantity: 1, currency_id: 'MXN' })
    const mercadoPagoResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items,
        external_reference: orderId,
        payer: { email: customer.email.trim() },
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
    return response.status(200).json({ initPoint, orderId, preferenceId: preference.id })
  } catch {
    return response.status(502).json({ message: 'No fue posible registrar el pedido o conectar con Mercado Pago.' })
  }
}