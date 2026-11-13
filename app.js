const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const cart = new Map();
let products = [];
let activeCategory = "Todos";
let searchQuery = "";
let lastFocusedElement = null;

const productGrid = document.querySelector("#product-grid");
const emptyResults = document.querySelector("#empty-results");
const resultsCount = document.querySelector("#results-count");
const drawer = document.querySelector("#cart-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const whatsappPhone = "5491125547478";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function refreshProducts() {
  const response = await fetch("data/initial-products.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("No se pudo cargar el catálogo público.");
  products = await response.json();
  showCatalogNotice("Los precios y el stock son de referencia. Consultá disponibilidad y coordiná el pedido por WhatsApp.");
  renderProducts();
  renderCart();
}

function showCatalogNotice(message) {
  const notice = document.querySelector("#catalog-notice");
  notice.replaceChildren();
  notice.hidden = !message;
  if (!message) return;
  notice.append(document.createTextNode(message));
}

function renderProducts() {
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === "Todos" || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  productGrid.innerHTML = visibleProducts
    .map((product) => {
      const available = product.stock > 0 && product.price !== null;
      const image = product.image
        ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
        : `<div class="product-placeholder ${product.category === "Mascotas" ? "pet-placeholder" : "home-placeholder"}" aria-hidden="true"><span>${product.category === "Mascotas" ? "♡" : "⌂"}</span></div>`;
      return `
        <article class="product-card">
          <div class="product-image-wrap">
            ${image}
            <span class="product-badge">${product.stock === 0 ? "SIN STOCK" : "CONSULTAR"}</span>
            ${product.image.startsWith("/images/") ? '<span class="illustration-badge">IMAGEN ILUSTRATIVA</span>' : ""}
            <button class="product-add" type="button" data-add="${escapeHtml(product.id)}" aria-label="Agregar ${escapeHtml(product.name)} al carrito" ${available ? "" : "disabled"}>
              ${available ? "+" : "−"}
            </button>
          </div>
          <div class="product-info">
            <div><h3 class="product-name">${escapeHtml(product.name)}</h3><span class="product-category">${escapeHtml(product.category)}</span></div>
            <div class="product-pricing">
              ${product.price === null ? `<div class="product-price price-pending">Precio a confirmar</div>` : `<div class="product-price">${money.format(product.price)}</div>`}
              <div class="product-stock">${product.stock === 1 ? "1 unidad (referencia)" : `${product.stock} unidades (referencia)`}</div>
            </div>
          </div>
          ${product.description ? `<p class="product-description">${escapeHtml(product.description)}</p>` : ""}
        </article>`;
    })
    .join("");

  resultsCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "producto" : "productos"}`;
  emptyResults.hidden = visibleProducts.length > 0;
}

function getCartQuantity() {
  return [...cart.values()].reduce((total, item) => total + item.quantity, 0);
}

function getSubtotal() {
  return [...cart.values()].reduce((total, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return total + (product?.price || 0) * item.quantity;
  }, 0);
}

function renderCart() {
  const quantity = getCartQuantity();
  const cartItems = [...cart.values()];
  document.querySelector("#cart-count").textContent = String(quantity);
  document.querySelector("#drawer-item-count").textContent = `(${quantity})`;
  document.querySelector("#cart-items").innerHTML = cartItems
    .map(({ id, quantity: itemQuantity }) => {
      const product = products.find((entry) => entry.id === id);
      if (!product) {
        return `<article class="cart-item cart-item-unavailable"><div><strong>Producto sin disponibilidad</strong><small>Quitalo para continuar.</small></div><button class="remove-item" type="button" data-remove="${escapeHtml(id)}">Quitar</button></article>`;
      }
      return `
        <article class="cart-item">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="" />` : `<div class="cart-item-placeholder">${product.category === "Mascotas" ? "♡" : "⌂"}</div>`}
          <div class="cart-item-description">
            <strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${product.stock} (ref.)</small>
            <div class="quantity-control" aria-label="Cantidad de ${escapeHtml(product.name)}">
              <button type="button" data-quantity="${escapeHtml(id)}" data-change="-1" aria-label="Quitar una unidad">−</button>
              <span>${itemQuantity}</span>
              <button type="button" data-quantity="${escapeHtml(id)}" data-change="1" aria-label="Agregar una unidad" ${itemQuantity >= product.stock ? "disabled" : ""}>+</button>
            </div>
          </div>
          <div class="cart-item-price"><strong>${product.price === null ? "Precio a confirmar" : money.format(product.price * itemQuantity)}</strong><button class="remove-item" type="button" data-remove="${escapeHtml(id)}">Quitar</button></div>
        </article>`;
    })
    .join("");

  const isEmpty = quantity === 0;
  const canCheckout = cartItems.length > 0 && cartItems.every(({ id, quantity: count }) => {
    const product = products.find((entry) => entry.id === id);
    return product && product.active && Number.isFinite(product.price) && product.stock >= count;
  });
  document.querySelector("#cart-empty").hidden = !isEmpty;
  document.querySelector("#cart-footer").hidden = isEmpty;
  document.querySelector("#cart-subtotal").textContent = money.format(getSubtotal());
  document.querySelector("#cart-shipping").textContent = "A coordinar";
  document.querySelector("#cart-total").textContent = money.format(getSubtotal());
  document.querySelector("#shipping-progress").textContent = canCheckout
    ? "La disponibilidad final, el envío y el pago se coordinan por WhatsApp."
    : "El pedido solo se habilita con productos con precio y stock visibles.";
  document.querySelector("#checkout-button").disabled = !canCheckout;
}

async function addToCart(productId) {
  try {
    await refreshProducts();
    const product = products.find((item) => item.id === productId);
    if (!product || !product.active || product.stock < 1 || product.price === null) {
      showPageError("Ese producto no tiene stock disponible.");
      return;
    }
    const existingItem = cart.get(productId);
    if ((existingItem?.quantity ?? 0) >= product.stock) {
      showPageError(`Solo quedan ${product.stock} unidades de ${product.name}.`);
    } else {
      cart.set(productId, { id: productId, quantity: (existingItem?.quantity ?? 0) + 1 });
      showPageError("");
      renderCart();
      openCart();
    }
  } catch (error) {
    showPageError(error.message);
  }
}

function changeQuantity(productId, change) {
  const item = cart.get(productId);
  const product = products.find((entry) => entry.id === productId);
  if (!item) return;
  const quantity = item.quantity + change;
  if (quantity <= 0) cart.delete(productId);
  else if (product && quantity <= product.stock) cart.set(productId, { ...item, quantity });
  renderCart();
}

function showPageError(message) {
  const status = document.querySelector("#page-status");
  status.textContent = message;
  status.hidden = !message;
}

function showCatalogError(message) {
  const notice = document.querySelector("#catalog-notice");
  notice.textContent = message;
  notice.hidden = false;
  productGrid.replaceChildren();
  emptyResults.textContent = "No se pudo cargar el catálogo.";
  emptyResults.hidden = false;
  resultsCount.textContent = "";
}

function openCart() {
  if (drawer.classList.contains("is-open")) return;
  lastFocusedElement = document.activeElement;
  drawer.removeAttribute("inert");
  drawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("visible");
    document.querySelector("#close-cart").focus();
  });
  document.body.style.overflow = "hidden";
}

function closeCart() {
  if (!drawer.classList.contains("is-open")) return;
  drawer.classList.remove("is-open");
  drawerBackdrop.classList.remove("visible");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("inert", "");
  document.body.style.overflow = "";
  window.setTimeout(() => {
    drawerBackdrop.hidden = true;
    lastFocusedElement?.focus();
  }, 320);
}

function sendOrderToWhatsApp() {
  const items = [...cart.values()].map(({ id, quantity }) => {
    const product = products.find((entry) => entry.id === id);
    if (!product || !product.active || !Number.isFinite(product.price) || product.stock < quantity) return null;
    return `• ${quantity} × ${product.name} — ${money.format(product.price * quantity)}`;
  });
  if (!items.length || items.some((item) => !item)) return;

  const message = [
    "Hola, quiero hacer un pedido en NovaShop:",
    "",
    ...items,
    "",
    `Subtotal de referencia: ${money.format(getSubtotal())}`,
    "Envío: a coordinar",
    "",
    "¿Me confirman disponibilidad y cómo coordinar la compra?",
  ].join("\n");
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
  const whatsappWindow = window.open(whatsappUrl, "_blank");
  if (whatsappWindow) whatsappWindow.opener = null;
  else window.location.assign(whatsappUrl);
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button && !button.disabled) addToCart(button.dataset.add);
});

document.querySelector("#cart-items").addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    changeQuantity(quantityButton.dataset.quantity, Number(quantityButton.dataset.change));
    return;
  }
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    cart.delete(removeButton.dataset.remove);
    renderCart();
  }
});

document.querySelector(".category-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("selected", chip === button);
  });
  document.querySelectorAll("[data-category-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.categoryLink === activeCategory);
  });
  document.querySelector(".nav-link.active:not([data-category-link])")?.classList.toggle("active", activeCategory === "Todos");
  renderProducts();
});

document.querySelectorAll("[data-category-link]").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelector(`[data-category="${link.dataset.categoryLink}"]`)?.click();
  });
});

document.querySelector("#search-input").addEventListener("input", (event) => {
  searchQuery = event.target.value.trim().toLowerCase();
  renderProducts();
});

document.querySelector("#open-cart").addEventListener("click", async () => {
  try {
    await refreshProducts();
    openCart();
  } catch (error) {
    showPageError(error.message);
  }
});
document.querySelector("#close-cart").addEventListener("click", closeCart);
document.querySelector("#continue-shopping").addEventListener("click", closeCart);
drawerBackdrop.addEventListener("click", closeCart);
document.querySelector("#checkout-button").addEventListener("click", sendOrderToWhatsApp);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawer.classList.contains("is-open")) closeCart();
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
if (window.location.protocol === "file:") {
  showCatalogError("Abrí NovaShop con Live Server para que cargue el catálogo público.");
} else {
  refreshProducts().catch((error) => {
    const message = `No se pudo cargar el catálogo público (${error.message}).`;
    showCatalogError(message);
    showPageError(message);
  });
}
