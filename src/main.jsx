import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Check, Minus, Plus, ShoppingBag, X } from 'lucide-react'
import './styles.css'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function loadCart() {
  try {
    const url = new URL(window.location.href)
    if (['approved', 'pending', 'failure'].includes(url.searchParams.get('payment_status'))) {
      localStorage.removeItem('oaxaca-cart')
      url.searchParams.delete('payment_status')
      window.history.replaceState(window.history.state, '', url)
      return []
    }

    const savedCart = JSON.parse(localStorage.getItem('oaxaca-cart') || '[]')
    if (!Array.isArray(savedCart)) return []
    return savedCart.filter(({ id, quantity }) => typeof id === 'string' && Number.isInteger(quantity) && quantity > 0)
  } catch {
    return []
  }
}

function App() {
  const [cart, setCart] = useState(loadCart)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [products, setProducts] = useState([])
  const [shippingCost, setShippingCost] = useState(null)

  useEffect(() => localStorage.setItem('oaxaca-cart', JSON.stringify(cart)), [cart])
  useEffect(() => {
    fetch('/api/catalog-prices')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(({ products: serverProducts, shippingCost: serverShippingCost }) => {
        setProducts(serverProducts)
        setShippingCost(serverShippingCost)
      })
      .catch(() => setNotice('No fue posible cargar los precios. Intenta recargar la pagina.'))
  }, [])

  const productsById = Object.fromEntries(products.map((product) => [product.id, product]))
  const cartItems = cart.map(({ id, quantity }) => ({ ...productsById[id], quantity })).filter((item) => Number.isFinite(item.price))
  const itemsTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const shippingTotal = cartItems.length > 0 && Number.isFinite(shippingCost) ? shippingCost : 0
  const total = itemsTotal + shippingTotal
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const changeQuantity = (id, amount) => {
    setCart((current) => {
      const item = current.find((entry) => entry.id === id)
      if (!item && amount > 0) return [...current, { id, quantity: 1 }]
      return current
        .map((entry) => entry.id === id ? { ...entry, quantity: entry.quantity + amount } : entry)
        .filter((entry) => entry.quantity > 0)
    })
  }

  const submitOrder = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const customer = Object.fromEntries(form.entries())
    setIsSubmitting(true)
    setNotice('')
    try {
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: cart.map(({ id, quantity }) => ({ id, quantity })), customer }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      window.location.assign(data.initPoint)
    } catch (error) {
      setNotice(error.message || 'No fue posible iniciar el pago. Intenta nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <>
    <header className="topbar">
      <a className="brand" href="#inicio" aria-label="Oaxaca pa'l Norte, inicio"><span>Oaxaca</span> pa'l Norte</a>
      <nav><a href="#catalogo">Tienda</a><a href="#mezcales">Mezcales</a><a href="#origen">Nuestro origen</a></nav>
      <button className="cart-trigger" onClick={() => setIsCartOpen(true)} aria-label="Abrir carrito"><ShoppingBag size={19}/><span>Carrito</span><b>{itemCount}</b></button>
    </header>
    <div className="test-banner">Ambiente de prueba: todos los productos tienen un precio de $1.00 MXN.</div>

    <main id="inicio">
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow">Directo de Oaxaca a tu mesa</p><h1>Sabores que<br/><i>viajan lejos.</i></h1><p className="hero-text">Despensa oaxaquena elegida con carino, para que el norte sepa un poco mas a casa.</p><a className="button button-light" href="#catalogo">Conocer la tienda <ArrowRight size={18}/></a></div>
        <div className="hero-art"><img src="/products/mezcal.png" alt="Botellas de mezcal artesanal"/><span>Hecho en Oaxaca</span></div>
      </section>

      <section className="catalog" id="catalogo">
        <div className="section-heading"><div><p className="eyebrow">La seleccion</p><h2>Del mercado,<br/>hasta tu puerta.</h2></div><p>Ingredientes con origen y oficio. Empacamos cada pedido para que llegue como debe llegar.</p></div>
        <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}>
          <div className="product-image"><img src={product.image} alt={product.name}/>{product.adult && <span>+18</span>}</div>
          <div className="product-info"><div><h3>{product.name}</h3><p>{product.detail}</p></div><p className="unit">{product.unit}</p></div>
          <div className="product-bottom"><strong>{Number.isFinite(product.price) ? money.format(product.price) : 'Cargando...'}</strong><button className="add-button" onClick={() => changeQuantity(product.id, 1)} aria-label={`Agregar ${product.name}`} disabled={!Number.isFinite(product.price)}><Plus size={19}/></button></div>
        </article>)}</div>
      </section>

      <section className="mezcal-guide" id="mezcales" aria-labelledby="mezcal-title">
        <div className="mezcal-heading">
          <div><p className="eyebrow">Agave, territorio y oficio</p><h2 id="mezcal-title">Un paisaje distinto<br/><i>en cada maguey.</i></h2></div>
          <p>El agave marca el pulso del mezcal: su tiempo de maduracion, el lugar donde crece y las manos que lo transforman dejan una huella propia en cada copa.</p>
        </div>
        <div className="agave-grid">
          <article className="agave-card">
            <img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Agave_angustifolia-_plants_near_Yagul_Oaxaca.jpg/960px-Agave_angustifolia-_plants_near_Yagul_Oaxaca.jpg" alt="Espadines jovenes creciendo cerca de Yagul, Oaxaca" loading="lazy"/>
            <div className="agave-copy"><span className="agave-index">01 / CULTIVADO</span><h3>Espadin</h3><p className="scientific">Agave angustifolia</p><p>El gran anfitrion de Oaxaca. Dulce y frutal, con notas de agave cocido; una entrada amable al mundo del mezcal.</p></div>
          </article>
          <article className="agave-card">
            <img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ed/Agave_potatorum%2C_one_of_the_Maguey_Mezcaleros_%289172772660%29.jpg/960px-Agave_potatorum%2C_one_of_the_Maguey_Mezcaleros_%289172772660%29.jpg" alt="Agave potatorum, conocido como Tobalá, en Oaxaca" loading="lazy"/>
            <div className="agave-copy"><span className="agave-index">02 / SILVESTRE</span><h3>Tobala</h3><p className="scientific">Agave potatorum</p><p>Pequeno y de crecimiento lento. Suele dar destilados sedosos, con recuerdos florales, especiados y de canela.</p></div>
          </article>
          <article className="agave-card">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Century_Plant_%28Agave_marmorata%29_flowering_..._%2853552214224%29.jpg/960px-Century_Plant_%28Agave_marmorata%29_flowering_..._%2853552214224%29.jpg" alt="Agave marmorata floreciendo en Hierve el Agua, Oaxaca" loading="lazy"/>
            <div className="agave-copy"><span className="agave-index">03 / SILVESTRE</span><h3>Tepeztate</h3><p className="scientific">Agave marmorata</p><p>De maduracion muy larga y presencia imponente. Su perfil puede ser intenso, herbal, mineral y terroso.</p></div>
          </article>
          <article className="agave-card">
            <img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/4/40/Agave_karwinskii_imported_from_iNaturalist_photo_2617925_on_6_January_2024.jpg/960px-Agave_karwinskii_imported_from_iNaturalist_photo_2617925_on_6_January_2024.jpg" alt="Agave karwinskii, especie asociada a nombres regionales como Barril y Madrecuixe" loading="lazy"/>
            <div className="agave-copy"><span className="agave-index">04 / SILVESTRE</span><h3>Madrecuixe / Barril</h3><p className="scientific">Agave karwinskii</p><p>Familia de formas diversas y gran caracter. En boca puede mostrar notas verdes, minerales y una complejidad persistente.</p></div>
          </article>
        </div>
        <p className="agave-note">Los nombres comunes y perfiles cambian entre pueblos, palenques y lotes; cada mezcal expresa su propio origen.</p>
        <div className="maturation">
          <div className="maturation-heading"><p className="eyebrow">Del destilado a la guarda</p><h3>El tiempo tambien<br/>se puede probar.</h3></div>
          <article><span>01</span><h4>Joven</h4><p>Sin maduracion en madera. Conserva el caracter directo del agave y del proceso de destilacion.</p></article>
          <article><span>02</span><h4>Reposado</h4><p>Descansa en recipientes de madera por al menos dos meses; puede tomar color y notas suaves de especias.</p></article>
          <article><span>03</span><h4>Anejo</h4><p>Permanece al menos doce meses en recipientes de madera de maximo 200 litros, con matices mas profundos.</p></article>
          <p className="maturation-footnote">La maduracion en vidrio no convierte al mezcal en anejo. Consulta siempre la categoria y el tiempo declarados en la etiqueta.</p>
        </div>
        <div className="image-credits">Fotografias: <a href="https://commons.wikimedia.org/wiki/File:Agave_angustifolia-_plants_near_Yagul_Oaxaca.jpg" target="_blank" rel="noreferrer">Thayne Tuason / CC BY 4.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Agave_potatorum,_one_of_the_Maguey_Mezcaleros_(9172772660).jpg" target="_blank" rel="noreferrer">Dick Culbert / CC BY 2.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Century_Plant_(Agave_marmorata)_flowering_..._(53552214224).jpg" target="_blank" rel="noreferrer">Bernard Dupont / CC BY-SA 2.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Agave_karwinskii_imported_from_iNaturalist_photo_2617925_on_6_January_2024.jpg" target="_blank" rel="noreferrer">Wendy Garcia Monterrubio / CC BY-SA 4.0</a>.</div>
      </section>

      <section id="origen" className="origin"><p className="eyebrow">Desde 2024</p><blockquote>"Que la distancia no nos quite el sabor de nuestra tierra."</blockquote><p>Somos una pequena despensa para quienes extranan Oaxaca y para quienes apenas empiezan a descubrirla.</p></section>
    </main>
    <footer><a className="brand" href="#inicio"><span>Oaxaca</span> pa'l Norte</a><p>Sabores de origen. Envio al norte de Mexico.</p></footer>

    {isCartOpen && <aside className="cart-panel" aria-label="Carrito de compra"><div className="cart-head"><div><p className="eyebrow">Tu pedido</p><h2>La canasta</h2></div><button onClick={() => setIsCartOpen(false)} aria-label="Cerrar carrito"><X/></button></div>{cartItems.length === 0 ? <div className="empty"><ShoppingBag size={30}/><p>Tu canasta esta esperando algo rico.</p><button className="text-button" onClick={() => setIsCartOpen(false)}>Ver productos</button></div> : <><div className="cart-items">{cartItems.map((item) => <div className="cart-item" key={item.id}><img src={item.image} alt=""/><div><h3>{item.name}</h3><p>{money.format(item.price)}</p><div className="quantity"><button onClick={() => changeQuantity(item.id, -1)} aria-label={`Quitar ${item.name}`}><Minus size={14}/></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)} aria-label={`Agregar ${item.name}`}><Plus size={14}/></button></div></div><strong>{money.format(item.price * item.quantity)}</strong></div>)}</div><div className="shipping-line"><span>Subtotal productos</span><strong>{money.format(itemsTotal)}</strong></div><div className="shipping-line"><span>Envio</span><strong>{money.format(shippingTotal)}</strong></div><div className="cart-total"><span>Total</span><strong>{money.format(total)}</strong></div><button className="button checkout" onClick={() => { setIsCartOpen(false); setCheckoutOpen(true) }}>Continuar con entrega <ArrowRight size={18}/></button></>}</aside>}
    {(isCartOpen || checkoutOpen) && <button className="backdrop" aria-label="Cerrar" onClick={() => { setIsCartOpen(false); setCheckoutOpen(false) }}/>} 
    {checkoutOpen && <dialog open className="checkout-modal" aria-labelledby="delivery-title"><button className="close-modal" onClick={() => setCheckoutOpen(false)} aria-label="Cerrar"><X/></button>{completed ? <div className="success"><Check size={36}/><p className="eyebrow">Pedido preparado</p><h2>Gracias por elegir Oaxaca.</h2><p>Recibimos tus datos. Al confirmar el pago o mensaje, coordinaremos tu entrega.</p><button className="button" onClick={() => { setCart([]); setCheckoutOpen(false); setCompleted(false) }}>Volver a la tienda</button></div> : <><p className="eyebrow">Paso final</p><h2 id="delivery-title">Datos de entrega</h2><p className="modal-description">Completa tus datos antes de continuar con el pago.</p><p className="test-checkout-note">Modo de prueba: productos a $1.00 MXN; el envio se calcula en el servidor.</p><form onSubmit={submitOrder}><label>Nombre completo<input required name="name" autoComplete="name"/></label><label>Correo electronico<input required type="email" name="email" autoComplete="email"/></label><label>Telefono<input required type="tel" name="phone" autoComplete="tel"/></label><label>Direccion completa<textarea required name="address" rows="2" autoComplete="street-address"/></label><label>Ciudad<input required name="city" autoComplete="address-level2"/></label><label>Estado<input required name="state" autoComplete="address-level1"/></label><label>Codigo postal<input required name="postalCode" autoComplete="postal-code" inputMode="numeric"/></label><label>Notas de entrega <span>(opcional)</span><textarea name="notes" rows="2"/></label>{notice && <p className="notice">{notice}</p>}<div className="shipping-line"><span>Subtotal productos</span><strong>{money.format(itemsTotal)}</strong></div><div className="shipping-line"><span>Envio</span><strong>{money.format(shippingTotal)}</strong></div><div className="checkout-summary"><span>Total del pedido</span><strong>{money.format(total)}</strong></div><button className="button checkout" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Abriendo Mercado Pago...' : <>Continuar al pago <ArrowRight size={18}/></>}</button><p className="payment-note">Seras redirigido a Mercado Pago para realizar un pago seguro.</p></form></>}</dialog>}
  </>
}

createRoot(document.getElementById('root')).render(<App />)