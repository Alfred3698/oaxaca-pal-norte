import { catalog } from './catalog.js'

export default function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ message: 'Metodo no permitido.' })

  const products = Object.entries(catalog).map(([id, product]) => ({
    id,
    name: product.title,
    detail: product.detail,
    image: product.image,
    unit: product.unit,
    adult: product.adult ?? false,
    price: product.unit_price,
  }))
  return response.status(200).json({ currency: 'MXN', products })
}