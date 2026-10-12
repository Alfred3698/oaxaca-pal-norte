import 'dotenv/config'
import express from 'express'
import { resolve } from 'node:path'
import createPreference from './api/create-preference.js'
import mercadoPagoWebhook from './api/mercado-pago-webhook.js'

const app = express()
const port = process.env.PORT || 3000
const distPath = resolve('dist')

app.use(express.json({ limit: '16kb' }))
app.post('/api/create-preference', createPreference)
app.post('/api/mercado-pago-webhook', mercadoPagoWebhook)
app.use(express.static(distPath))
app.use((request, response) => response.sendFile(resolve(distPath, 'index.html')))

app.listen(port, () => console.info(`Oaxaca pa'l Norte listening on ${port}`))