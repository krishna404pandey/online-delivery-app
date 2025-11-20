// API Base URL
const API_BASE = 'http://localhost:3000/api';

// Global state
let currentUser = null;
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let socket = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if this is an OAuth callback
    const isOAuthCallback = window.location.pathname === '/auth/callback' || window.location.search.includes('token=');
    
    if (!isOAuthCallback) {
        // Normal initialization
        checkAuth();
        loadCategories();
        updateCartCount();
        initializeSocket();
    } else {
        // For OAuth callback, initialize basics first
        initializeSocket();
        loadCategories();
        updateCartCount();
        // handleAuthCallback will be called separately (already set up below)
    }
});

// Socket.io connection
function initializeSocket() {
    socket = io('http://localhost:3000');
    
    socket.on('connect', () => {
        console.log('Connected to server');
        if (currentUser) {
            socket.emit('join-room', currentUser._id || currentUser.id);
        }
    });

    socket.on('order-status-updated', (order) => {
        const orderIdShort = (order._id || order.id || '').toString().substring(0, 8);
        const statusUpper = (order.status || 'unknown').toUpperCase();
        showToast(`Order #${orderIdShort} status updated to ${statusUpper}!`);
        // Reload orders if on orders page (for customers)
        if (document.getElementById('ordersContent')) {
            loadOrders();
        }
        // Reload dashboard orders if on dashboard (for retailers/wholesalers)
        if (document.getElementById('dashboardContent') && currentUser && (currentUser.role === 'retailer' || currentUser.role === 'wholesaler')) {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && (activeTab.textContent.includes('Orders') || activeTab.textContent.includes('Dashboard'))) {
                loadDashboardOrders();
            }
        }
    });

    socket.on('order-update', (order) => {
        // General order update - reload if on orders page (for customers)
        if (document.getElementById('ordersContent')) {
            loadOrders();
        }
        // Reload dashboard orders if on dashboard (for retailers/wholesalers)
        if (document.getElementById('dashboardContent') && currentUser && (currentUser.role === 'retailer' || currentUser.role === 'wholesaler')) {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && (activeTab.textContent.includes('Orders') || activeTab.textContent.includes('Dashboard'))) {
                loadDashboardOrders();
            }
        }
    });

    socket.on('new-query', (query) => {
        showToast(`New query received: ${query.subject || 'Query'}`);
        // Reload queries if on queries tab
        if (document.getElementById('dashboardContent') && currentUser && (currentUser.role === 'retailer' || currentUser.role === 'wholesaler')) {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.textContent.includes('Queries')) {
                loadDashboardQueries();
            }
        }
    });

    socket.on('query-response', (query) => {
        showToast(`Response received for your query: ${query.subject || 'Query'}`);
        // Reload queries if on queries page
        if (document.getElementById('queriesContent')) {
            loadQueries();
        }
    });

    socket.on('product-updated', (product) => {
        if (document.getElementById('productsGrid')) {
            loadProducts();
        }
    });
}

// Authentication
function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        fetch(`${API_BASE}/users/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(user => {
            if (user._id || user.id) {
                currentUser = user;
                updateNav();
                // Join socket room for real-time updates
                if (socket && socket.connected && (currentUser._id || currentUser.id)) {
                    socket.emit('join-room', currentUser._id || currentUser.id);
                }
                if (currentUser.role === 'retailer' || currentUser.role === 'wholesaler') {
                    showSection('dashboard');
                } else {
                    showSection('products');
                }
            }
        })
        .catch(() => {
            localStorage.removeItem('token');
        });
    }
}

function updateNav() {
    const isLoggedIn = !!currentUser;
    document.getElementById('loginLink').style.display = isLoggedIn ? 'none' : 'block';
    document.getElementById('registerLink').style.display = isLoggedIn ? 'none' : 'block';
    document.getElementById('profileLink').style.display = isLoggedIn ? 'block' : 'none';
    document.getElementById('logoutLink').style.display = isLoggedIn ? 'block' : 'none';
    document.getElementById('ordersLink').style.display = (isLoggedIn && currentUser.role === 'customer') ? 'block' : 'none';
    document.getElementById('queriesLink').style.display = (isLoggedIn && currentUser.role === 'customer') ? 'block' : 'none';
    document.getElementById('dashboardLink').style.display = (isLoggedIn && (currentUser.role === 'retailer' || currentUser.role === 'wholesaler')) ? 'block' : 'none';
}

// Section navigation
function showSection(sectionId) {
    // Clean up any existing map when switching sections
    const existingContainer = document.getElementById('locationPickerContainer');
    if (existingContainer) {
        existingContainer.remove();
    }
    const existingMap = document.getElementById('locationPickerMap');
    if (existingMap) {
        existingMap.remove();
        if (map) {
            map.remove();
            map = null;
        }
    }
    locationMarker = null;
    userLocation = null;
    
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        section.style.display = 'block';
    }

    if (sectionId === 'products') {
        loadProducts();
    } else if (sectionId === 'cart') {
        loadCart();
    } else if (sectionId === 'orders') {
        loadOrders();
    } else if (sectionId === 'queries') {
        loadQueries();
    } else if (sectionId === 'dashboard') {
        showDashboardTab('inventory');
    } else if (sectionId === 'profile') {
        loadProfile();
    }
}

// Registration
async function handleRegister(e) {
    e.preventDefault();
    const locationData = document.getElementById('registerLocation').value;
    let location = { lat: 0, lng: 0 };
    if (locationData) {
        try {
            location = JSON.parse(locationData);
        } catch (e) {
            // Use default location
        }
    }

    const userData = {
        name: document.getElementById('registerName').value,
        email: document.getElementById('registerEmail').value,
        password: document.getElementById('registerPassword').value,
        phone: document.getElementById('registerPhone').value,
        role: document.getElementById('registerRole').value,
        address: document.getElementById('registerAddress').value,
        location: location
    };

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('pendingEmail', userData.email);
            if (data.otp) {
                // OTP returned because email failed
                localStorage.setItem('pendingOTP', data.otp);
                showToast(`OTP: ${data.otp} (Email not configured - shown for testing)`);
            } else {
                // Email sent successfully - clear any old OTP from storage
                localStorage.removeItem('pendingOTP');
                showToast('OTP sent! Check your email (and spam folder).');
            }
            document.getElementById('otp-verify').style.display = 'block';
            document.getElementById('register').style.display = 'none';
        } else {
            showToast(data.error || 'Registration failed');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

// OTP Verification
async function handleOTPVerify(e) {
    e.preventDefault();
    const email = localStorage.getItem('pendingEmail');
    const otp = document.getElementById('otpCode').value;

    try {
        const res = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Email verified! Please login.');
            localStorage.removeItem('pendingEmail');
            localStorage.removeItem('pendingOTP');
            showSection('login');
        } else {
            showToast(data.error || 'Invalid OTP');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

function resendOTP() {
    const email = localStorage.getItem('pendingEmail');
    if (!email) {
        showToast('No pending registration found');
        return;
    }

    fetch(`${API_BASE}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    })
    .then(res => res.json())
    .then(data => {
        if (data.otp) {
            // OTP returned because email failed
            localStorage.setItem('pendingOTP', data.otp);
            showToast(`OTP: ${data.otp} (Email failed - check server console)`);
        } else {
            // Email sent successfully
            localStorage.removeItem('pendingOTP');
            showToast('OTP resent! Check your email (and spam folder).');
        }
    })
    .catch(error => {
        showToast('Error resending OTP: ' + error.message);
    });
}

// Send OTP for login
async function sendLoginOTP() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (!email) {
        showToast('Please enter your email first');
        return;
    }
    if (!password) {
        showToast('Please enter your password');
        return;
    }

    const sendButton = document.getElementById('sendOTPButton');
    const statusSpan = document.getElementById('otpStatus');
    const otpGroup = document.getElementById('loginOTPGroup');
    const submitButton = document.getElementById('loginSubmitButton');

    sendButton.disabled = true;
    const defaultLabel = '<i class="fas fa-paper-plane"></i> Send OTP';
    const resendLabel = '<i class="fas fa-redo"></i> Resend OTP';
    sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    statusSpan.textContent = '';
    let otpSentSuccessfully = false;

    try {
        const res = await fetch(`${API_BASE}/auth/login/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (res.ok) {
            if (data.otp) {
                // OTP was returned because email failed
                console.log(`⚠️  OTP for ${email}: ${data.otp}`);
                console.log('Email is not configured or failed. Check server console for details.');
                statusSpan.textContent = `OTP: ${data.otp} (Email failed - check server console)`;
                statusSpan.style.color = '#ff9800';
                showToast('OTP shown in status (email not configured)');
            } else {
                // Email was sent successfully
                statusSpan.textContent = 'OTP sent! Check your email (and spam folder).';
                statusSpan.style.color = '#4caf50';
                showToast('OTP sent to your email!');
            }
            otpGroup.style.display = 'block';
            submitButton.disabled = false;
            otpSentSuccessfully = true;
            sendButton.innerHTML = resendLabel;
            document.getElementById('loginOTP').focus();
        } else {
            showToast(data.error || 'Failed to send OTP');
            statusSpan.textContent = data.error || 'Failed to send OTP';
            statusSpan.style.color = '#f44336';
        }
    } catch (error) {
        showToast('Error: ' + error.message);
        statusSpan.textContent = 'Error sending OTP';
        statusSpan.style.color = '#f44336';
    } finally {
        sendButton.disabled = false;
        if (!otpSentSuccessfully) {
            sendButton.innerHTML = defaultLabel;
        }
    }
}

// Login with OTP
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const otp = document.getElementById('loginOTP').value;

    if (!password) {
        showToast('Please enter your password');
        return;
    }
    if (!otp) {
        showToast('Please enter OTP');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, otp })
        });

        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            updateNav();
            if (socket) socket.emit('join-room', currentUser._id || currentUser.id);
            showToast('Login successful!');
            // Reset form
            document.getElementById('loginForm').reset();
            document.getElementById('loginOTPGroup').style.display = 'none';
            document.getElementById('loginSubmitButton').disabled = true;
            document.getElementById('sendOTPButton').style.display = 'block';
            document.getElementById('sendOTPButton').innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP';
            document.getElementById('otpStatus').textContent = '';
            
            if (currentUser.role === 'retailer' || currentUser.role === 'wholesaler') {
                showSection('dashboard');
            } else {
                showSection('products');
            }
        } else {
            showToast(data.error || 'Login failed');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

function handleSocialLogin(provider) {
    if (provider === 'google') {
        window.location.href = `${API_BASE}/auth/google`;
    } else if (provider === 'facebook') {
        window.location.href = `${API_BASE}/auth/facebook`;
    }
}

// Handle OAuth callback
async function handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');
    
    if (token) {
        localStorage.setItem('token', token);
        
        // Wait for auth check to complete
        try {
            const res = await fetch(`${API_BASE}/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const user = await res.json();
            
            if (user._id || user.id) {
                currentUser = user;
                updateNav();
                
                // Join socket room
                if (socket) {
                    socket.emit('join-room', currentUser._id || currentUser.id);
                }
                
                showToast('Login successful!');
                
                // Show appropriate section based on role
                if (currentUser.role === 'retailer' || currentUser.role === 'wholesaler') {
                    showSection('dashboard');
                } else {
                    showSection('products');
                }
                
                // Clean URL after a short delay to ensure everything is loaded
                setTimeout(() => {
                    window.history.replaceState({}, document.title, '/');
                }, 500);
            }
        } catch (error) {
            console.error('Auth check error:', error);
            showToast('Error loading user profile');
        }
    } else if (error) {
        showToast('Authentication failed. Please try again.');
        showSection('login');
    }
}

// Check for OAuth callback on page load - wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/auth/callback' || window.location.search.includes('token=')) {
        // Small delay to ensure everything is initialized
        setTimeout(() => {
            handleAuthCallback();
        }, 100);
    }
});

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    updateNav();
    showSection('home');
    showToast('Logged out successfully');
}

// Products
async function loadProducts() {
    try {
        const res = await fetch(`${API_BASE}/products`);
        const products = await res.json();
        displayProducts(products);
    } catch (error) {
        showToast('Error loading products');
    }
}

function displayProducts(products) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = '<p>No products found</p>';
        return;
    }

    grid.innerHTML = products.map(product => {
        const productId = product._id || product.id;
        return `
        <div class="product-card" onclick="showProductDetails('${productId}')">
            <img src="${product.image}" alt="${product.name}" class="product-image">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-price">₹${product.price.toFixed(2)}</div>
                <div class="product-stock ${product.stock > 0 ? '' : 'out'}">
                    ${product.stock > 0 ? `In Stock (${product.stock})` : 'Out of Stock'}
                </div>
                ${product.averageRating > 0 ? `<div style="font-size: 0.9rem; color: #f39c12;">⭐ ${product.averageRating.toFixed(1)}</div>` : ''}
                <button class="btn-add-cart" ${product.stock === 0 ? 'disabled' : ''} 
                    onclick="event.stopPropagation(); addToCart('${productId}', '${product.name}', ${product.price})">
                    Add to Cart
                </button>
            </div>
        </div>
    `;
    }).join('');
}

async function showProductDetails(productId) {
    try {
        const res = await fetch(`${API_BASE}/products/${productId}`);
        const product = await res.json();
        
        // Update browsing history
        if (currentUser) {
            fetch(`${API_BASE}/users/browsing-history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ productId })
            }).catch(() => {});
        }
        
        // Load feedback
        const feedbackRes = await fetch(`${API_BASE}/feedback/product/${productId}`);
        const feedback = await feedbackRes.json();
        const avgRating = feedback.length > 0 
            ? (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1)
            : 'No ratings';

        const content = document.getElementById('productDetailsContent');
        content.innerHTML = `
            <div class="product-details">
                <img src="${product.image}" alt="${product.name}" class="product-details-image">
                <div class="product-details-info">
                    <h2>${product.name}</h2>
                    <div class="product-details-price">₹${product.price.toFixed(2)}</div>
                    <p>${product.description || 'No description available'}</p>
                    <p><strong>Category:</strong> ${product.category}</p>
                    <p><strong>Stock:</strong> ${product.stock > 0 ? `${product.stock} available` : 'Out of stock'}</p>
                    <p><strong>Rating:</strong> ${avgRating} ⭐</p>
                    <button class="btn-primary" ${product.stock === 0 ? 'disabled' : ''} 
                        onclick="addToCart('${product.id}', '${product.name}', ${product.price})">
                        Add to Cart
                    </button>
                    <h3 style="margin-top: 2rem;">Feedback</h3>
                    <div id="productFeedback">
                        ${feedback.length === 0 ? '<p>No feedback yet</p>' : 
                          feedback.map(f => `
                            <div style="padding: 1rem; margin: 0.5rem 0; background: #f5f5f5; border-radius: 5px;">
                                <div><strong>${f.rating} ⭐</strong></div>
                                <div>${f.comment || 'No comment'}</div>
                            </div>
                          `).join('')}
                    </div>
                    ${currentUser ? `
                        <div style="margin-top: 2rem;">
                            <h4>Add Feedback</h4>
                            <form onsubmit="submitFeedback(event, '${product.id}')">
                                <div class="form-group">
                                    <label>Rating</label>
                                    <select id="feedbackRating" required>
                                        <option value="5">5 ⭐</option>
                                        <option value="4">4 ⭐</option>
                                        <option value="3">3 ⭐</option>
                                        <option value="2">2 ⭐</option>
                                        <option value="1">1 ⭐</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Comment</label>
                                    <textarea id="feedbackComment"></textarea>
                                </div>
                                <button type="submit" class="btn-primary">Submit Feedback</button>
                            </form>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        showSection('product-details');
    } catch (error) {
        showToast('Error loading product details');
    }
}

async function submitFeedback(e, productId) {
    e.preventDefault();
    if (!currentUser) {
        showToast('Please login to submit feedback');
        return;
    }

    const rating = document.getElementById('feedbackRating').value;
    const comment = document.getElementById('feedbackComment').value;

    try {
        const res = await fetch(`${API_BASE}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ productId, rating, comment })
        });

        if (res.ok) {
            showToast('Feedback submitted!');
            showProductDetails(productId);
        } else {
            showToast('Error submitting feedback');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

// Search
async function searchProducts() {
    const query = document.getElementById('searchInput')?.value || '';
    const category = document.getElementById('categoryFilter')?.value || '';
    const minPrice = document.getElementById('minPrice')?.value || '';
    const maxPrice = document.getElementById('maxPrice')?.value || '';

    let url = `${API_BASE}/search/products?`;
    if (query) url += `query=${encodeURIComponent(query)}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (minPrice) url += `minPrice=${minPrice}&`;
    if (maxPrice) url += `maxPrice=${maxPrice}&`;

    try {
        const res = await fetch(url);
        const products = await res.json();
        displayProducts(products);
    } catch (error) {
        showToast('Error searching products');
    }
}

function getLocationAndSearch() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            searchNearby(lat, lng);
        });
    } else {
        showToast('Geolocation not supported');
    }
}

async function searchNearby(lat, lng) {
    const query = document.getElementById('searchInput')?.value || '';
    let url = `${API_BASE}/search/products?location=${lat},${lng}&maxDistance=50`;
    if (query) url += `&query=${encodeURIComponent(query)}`;

    try {
        const res = await fetch(url);
        const products = await res.json();
        displayProducts(products);
        showToast(`Found ${products.length} products nearby`);
    } catch (error) {
        showToast('Error searching nearby products');
    }
}

async function loadCategories() {
    try {
        const res = await fetch(`${API_BASE}/products/categories/list`);
        const categories = await res.json();
        const select = document.getElementById('categoryFilter');
        if (select) {
            select.innerHTML = '<option value="">All Categories</option>' +
                categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading categories');
    }
}

// Cart
function addToCart(productId, name, price) {
    if (!currentUser) {
        showToast('Please login to add items to cart');
        showSection('login');
        return;
    }

    const existingItem = cart.find(item => item.productId === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ productId, name, price, quantity: 1 });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    showToast('Added to cart!');
}

function loadCart() {
    const content = document.getElementById('cartContent');
    if (!content) return;

    if (cart.length === 0) {
        content.innerHTML = '<p>Your cart is empty</p>';
        return;
    }

    let total = 0;
    content.innerHTML = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h3>${item.name}</h3>
                    <p>₹${item.price.toFixed(2)} x ${item.quantity}</p>
                </div>
                <div class="cart-item-actions">
                    <div class="quantity-control">
                        <button class="quantity-btn" onclick="updateCartQuantity(${index}, -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateCartQuantity(${index}, 1)">+</button>
                    </div>
                    <button class="btn-primary" onclick="removeFromCart(${index})">Remove</button>
                </div>
            </div>
        `;
    }).join('') + `
        <div class="cart-total">
            <h3>Total: ₹${total.toFixed(2)}</h3>
            <button class="btn-primary" onclick="placeOrder()">Place Order</button>
        </div>
    `;
}

function updateCartQuantity(index, change) {
    cart[index].quantity += change;
    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    loadCart();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    loadCart();
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = count;
}

function placeOrder() {
    if (!currentUser) {
        showToast('Please login to place order');
        return;
    }

    if (cart.length === 0) {
        showToast('Cart is empty');
        return;
    }

    // Calculate total
    let total = 0;
    cart.forEach(item => {
        total += item.price * item.quantity;
    });

    // Show payment modal
    const modal = document.getElementById('paymentModal');
    const content = document.getElementById('paymentModalContent');
    
    content.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <h3>Order Summary</h3>
            ${cart.map(item => `
                <p>${item.name} x ${item.quantity} - ₹${(item.price * item.quantity).toFixed(2)}</p>
            `).join('')}
            <p style="font-size: 1.2rem; font-weight: bold; margin-top: 1rem;">
                Total: ₹${total.toFixed(2)}
            </p>
        </div>
        <div class="form-group">
            <label>Payment Method</label>
            <div class="payment-option" onclick="selectPaymentMethod('online')" id="payment-online">
                <strong>Online Payment</strong>
                <p style="font-size: 0.9rem; color: #666; margin-top: 0.25rem;">Pay now with card</p>
            </div>
            <div class="payment-option" onclick="selectPaymentMethod('cod')" id="payment-cod">
                <strong>Cash on Delivery (COD)</strong>
                <p style="font-size: 0.9rem; color: #666; margin-top: 0.25rem;">Pay when you receive</p>
            </div>
            <input type="hidden" id="selectedPaymentMethod" value="online">
        </div>
        <div class="form-group" id="offlineDateGroup" style="display:none;">
            <label>Schedule Pickup/Delivery Date</label>
            <input type="date" id="scheduledDate" class="calendar-input" min="${new Date().toISOString().split('T')[0]}">
            <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;">
                <i class="fas fa-calendar-alt"></i> We'll send you a reminder before the scheduled date
            </p>
        </div>
        <div class="form-group">
            <label>Delivery Address</label>
            <textarea id="deliveryAddress" placeholder="Enter delivery address">${currentUser.address || ''}</textarea>
            <button type="button" class="btn-secondary" onclick="openLocationPicker('order')" style="margin-top: 0.5rem;">
                <i class="fas fa-map-marker-alt"></i> Pin Location on Map
            </button>
            <input type="hidden" id="orderLocation">
            <div id="orderLocationDisplay" style="margin-top:0.5rem; font-size:0.9rem; color:#666;"></div>
        </div>
        <button class="btn-primary" onclick="confirmOrder()">Place Order</button>
    `;
    
    modal.style.display = 'block';
    
    // Set default selection
    const onlineOption = document.getElementById('payment-online');
    if (onlineOption) {
        onlineOption.classList.add('selected');
    }
    
    // Ensure hidden input has default value
    const hiddenInput = document.getElementById('selectedPaymentMethod');
    if (hiddenInput) {
        hiddenInput.value = 'online';
    }
}

function selectPaymentMethod(method) {
    // Remove selected class from all options
    document.querySelectorAll('.payment-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Add selected class to clicked option
    const selectedOption = document.getElementById(`payment-${method}`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
    
    // Update hidden input
    const hiddenInput = document.getElementById('selectedPaymentMethod');
    if (hiddenInput) {
        hiddenInput.value = method;
    }
    
    // Show/hide date picker for COD
    const dateGroup = document.getElementById('offlineDateGroup');
    if (dateGroup) {
        if (method === 'cod') {
            dateGroup.style.display = 'block';
        } else {
            dateGroup.style.display = 'none';
        }
    }
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clean up map if it exists
    const existingContainer = document.getElementById('locationPickerContainer');
    if (existingContainer) {
        existingContainer.remove();
    }
    const existingMap = document.getElementById('locationPickerMap');
    if (existingMap) {
        existingMap.remove();
        if (map) {
            map.remove();
            map = null;
        }
    }
    locationMarker = null;
    userLocation = null;
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const paymentModal = document.getElementById('paymentModal');
    if (paymentModal && e.target === paymentModal) {
        closePaymentModal();
    }
});

async function confirmOrder() {
    const paymentMethod = document.getElementById('selectedPaymentMethod').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value;
    const scheduledDateInput = document.getElementById('scheduledDate');
    const scheduledDate = paymentMethod === 'cod' && scheduledDateInput ? scheduledDateInput.value : null;

    if (!deliveryAddress || deliveryAddress.trim() === '') {
        showToast('Please enter delivery address');
        return;
    }

    if (paymentMethod === 'cod' && !scheduledDate) {
        showToast('Please select a scheduled date for COD orders');
        return;
    }

    // Calculate total
    let total = 0;
    cart.forEach(item => {
        total += item.price * item.quantity;
    });

    // For online payment, show confirmation dialog
    if (paymentMethod === 'online') {
        const confirmed = await showPaymentConfirmation(total);
        if (!confirmed) {
            return; // User cancelled
        }
    }

    const orderData = {
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
        paymentMethod,
        orderType: paymentMethod === 'cod' ? 'offline' : 'online',
        deliveryAddress: deliveryAddress.trim(),
        scheduledDate: paymentMethod === 'cod' ? scheduledDate : null
    };

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(orderData)
        });

        const data = await res.json();
        
        if (res.ok) {
            cart = [];
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartCount();
            closePaymentModal();
            showToast('Order placed successfully! Payment status: ' + data.paymentStatus);
            
            // Set reminder for offline orders
            if (scheduledDate && data._id) {
                setOrderReminder(data._id || data.id, scheduledDate);
            }
            
            // Reload orders and show orders section
            setTimeout(() => {
                showSection('orders');
                loadOrders();
            }, 500);
        } else {
            showToast(data.error || 'Error placing order');
            console.error('Order error:', data);
        }
    } catch (error) {
        console.error('Order placement error:', error);
        showToast('Error: ' + (error.message || 'Failed to place order'));
    }
}

// Payment confirmation dialog for online payments
function showPaymentConfirmation(amount) {
    return new Promise((resolve) => {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'modal';
        confirmModal.id = 'paymentConfirmModal';
        confirmModal.style.display = 'block';
        confirmModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;" onclick="event.stopPropagation()">
                <span class="close-modal" onclick="closePaymentConfirmModal(false)">&times;</span>
                <h2 style="margin-bottom: 1rem;">Confirm Payment</h2>
                <div style="text-align: center; padding: 2rem 0;">
                    <p style="font-size: 1.1rem; margin-bottom: 1rem;">CONFIRM PAYMENT of ₹</p>
                    <h1 style="font-size: 2.5rem; color: var(--primary-color); margin: 1rem 0;">₹${amount.toFixed(2)}</h1>
                    <p style="color: #666; margin-top: 1rem;">This is a placeholder for payment gateway integration</p>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button class="btn-secondary" onclick="closePaymentConfirmModal(false)" style="flex: 1;">No, Cancel</button>
                    <button class="btn-primary" onclick="closePaymentConfirmModal(true)" style="flex: 1;">Yes, Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);

        // Close on outside click
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                closePaymentConfirmModal(false);
            }
        });

        // Store resolve function globally for the buttons
        window.paymentConfirmResolve = resolve;
    });
}

function closePaymentConfirmModal(confirmed) {
    const modal = document.getElementById('paymentConfirmModal');
    if (modal) {
        modal.remove();
    }
    if (window.paymentConfirmResolve) {
        window.paymentConfirmResolve(confirmed);
        window.paymentConfirmResolve = null;
    }
}

function setOrderReminder(orderId, scheduledDate) {
    const reminderDate = new Date(scheduledDate);
    reminderDate.setDate(reminderDate.getDate() - 1); // Remind 1 day before
    
    const now = new Date();
    const timeUntilReminder = reminderDate.getTime() - now.getTime();
    
    if (timeUntilReminder > 0) {
        setTimeout(() => {
            const orderIdStr = (orderId || '').toString();
            showToast(`Reminder: Your order #${orderIdStr.substring(0, 8)} is scheduled for tomorrow!`);
            // In production, send email/SMS here
        }, timeUntilReminder);
    }
}

// Orders
async function loadOrders() {
    if (!currentUser) {
        showToast('Please login to view orders');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const orders = await res.json();
        displayOrders(orders);
    } catch (error) {
        showToast('Error loading orders');
    }
}

function displayOrders(orders) {
    const content = document.getElementById('ordersContent');
    if (!content) return;

    if (!orders || orders.length === 0) {
        content.innerHTML = '<p style="text-align: center; padding: 2rem;">No orders found</p>';
        return;
    }

    try {
        content.innerHTML = orders.map(order => {
            const orderId = (order._id || order.id || '').toString();
            const orderIdShort = orderId.substring(0, 8) || 'N/A';
            const deliveryDetails = order.deliveryDetails || {};
            // Fix tracking steps based on actual order status
            let trackingSteps = [];
            if (order.status === 'pending') {
                trackingSteps = [
                    { label: 'Order Placed', status: 'completed' },
                    { label: 'Processing', status: 'active' },
                    { label: 'In Transit', status: '' },
                    { label: 'Delivered', status: '' }
                ];
            } else if (order.status === 'processing') {
                trackingSteps = [
                    { label: 'Order Placed', status: 'completed' },
                    { label: 'Processing', status: 'completed' },
                    { label: 'In Transit', status: 'active' },
                    { label: 'Delivered', status: '' }
                ];
            } else if (order.status === 'in_transit') {
                trackingSteps = [
                    { label: 'Order Placed', status: 'completed' },
                    { label: 'Processing', status: 'completed' },
                    { label: 'In Transit', status: 'active' },
                    { label: 'Delivered', status: '' }
                ];
            } else if (order.status === 'delivered') {
                trackingSteps = [
                    { label: 'Order Placed', status: 'completed' },
                    { label: 'Processing', status: 'completed' },
                    { label: 'In Transit', status: 'completed' },
                    { label: 'Delivered', status: 'completed' }
                ];
            } else {
                trackingSteps = [
                    { label: 'Order Placed', status: 'completed' },
                    { label: 'Processing', status: '' },
                    { label: 'In Transit', status: '' },
                    { label: 'Delivered', status: '' }
                ];
            }

            const items = order.items || [];
            const totalAmount = order.totalAmount || 0;
            const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
            const scheduledDate = order.scheduledDate ? new Date(order.scheduledDate) : null;
            const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt) : null;

            return `
                <div class="order-card">
                    <div class="order-header">
                        <div>
                            <h3>Order #${orderIdShort}</h3>
                            <p>${createdAt.toLocaleString()}</p>
                            ${deliveryDetails.trackingNumber ? `<p><strong>Tracking:</strong> ${deliveryDetails.trackingNumber}</p>` : ''}
                        </div>
                        <div class="order-status ${order.status || 'pending'}" style="font-size: 1.1rem; font-weight: bold; padding: 0.5rem 1rem; border-radius: 5px;">
                            ${(order.status || 'pending').toUpperCase()}
                        </div>
                    </div>
                    <div class="order-tracking">
                        <h4>Order Tracking</h4>
                        <div class="tracking-timeline">
                            ${trackingSteps.map((step, idx) => `
                                <div class="tracking-step ${step.status}">
                                    <strong>${step.label}</strong>
                                    ${idx === 1 && order.status === 'processing' && deliveryDetails.estimatedDelivery ? 
                                        `<p style="font-size: 0.9rem; color: #666;">Est. delivery: ${new Date(deliveryDetails.estimatedDelivery).toLocaleDateString()}</p>` : ''}
                                    ${idx === 2 && order.status === 'in_transit' && deliveryDetails.estimatedDelivery ? 
                                        `<p style="font-size: 0.9rem; color: #666;">Est. delivery: ${new Date(deliveryDetails.estimatedDelivery).toLocaleDateString()}</p>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div style="margin-top: 1rem;">
                        <p style="margin-bottom: 0.5rem;"><strong>Current Status:</strong> 
                            <span class="order-status ${order.status || 'pending'}" style="font-size: 1rem; padding: 0.3rem 0.8rem; border-radius: 4px; margin-left: 0.5rem;">
                                ${(order.status || 'pending').toUpperCase()}
                            </span>
                        </p>
                        ${items.length > 0 ? items.map(item => `
                            <p>${item.productName || 'Product'} - ${item.quantity || 0} x ₹${(item.price || 0).toFixed(2)}</p>
                        `).join('') : '<p>No items</p>'}
                        <p><strong>Total: ₹${totalAmount.toFixed(2)}</strong></p>
                        <p><strong>Payment:</strong> <span class="order-status ${order.paymentStatus || 'pending'}">${(order.paymentStatus || 'pending').toUpperCase()}</span></p>
                        <p><strong>Payment Method:</strong> ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}</p>
                        ${scheduledDate ? `<p><strong>Scheduled Date:</strong> ${scheduledDate.toLocaleDateString()}</p>` : ''}
                        ${order.deliveryAddress ? `<p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>` : ''}
                        ${deliveredAt ? `<p><strong>Delivered At:</strong> ${deliveredAt.toLocaleString()}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error displaying orders:', error);
        content.innerHTML = '<p style="color: red;">Error loading orders. Please refresh the page.</p>';
    }
}

// Dashboard
function showDashboardTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    const content = document.getElementById('dashboardContent');
    if (tab === 'inventory') {
        loadInventory();
    } else if (tab === 'orders') {
        loadDashboardOrders();
    } else if (tab === 'queries') {
        loadDashboardQueries();
    } else if (tab === 'analytics') {
        loadAnalytics();
    }
}

function loadInventory() {
    const content = document.getElementById('dashboardContent');
    const isRetailer = currentUser.role === 'retailer';
    
    content.innerHTML = `
        <div class="inventory-form">
            <h3>Add New Product</h3>
            <form onsubmit="addProduct(event)">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="productName" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="productDescription"></textarea>
                </div>
                <div class="form-group">
                    <label>Price</label>
                    <input type="number" step="0.01" id="productPrice" required>
                </div>
                <div class="form-group">
                    <label>Stock</label>
                    <input type="number" id="productStock" required>
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <input type="text" id="productCategory" required>
                </div>
                <div class="form-group">
                    <label>Image URL</label>
                    <input type="url" id="productImage" value="https://via.placeholder.com/300">
                </div>
                ${isRetailer ? `
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="proxyAvailable"> Show as proxy product (available via wholesaler)
                        </label>
                        <select id="proxyWholesalerId" style="margin-top: 0.5rem; display: none;">
                            <option value="">Select Wholesaler</option>
                        </select>
                    </div>
                ` : ''}
                <button type="submit" class="btn-primary">Add Product</button>
            </form>
        </div>
        ${isRetailer ? `
            <div style="margin: 2rem 0; padding: 1.5rem; background: var(--light-color); border-radius: 10px;">
                <h3>Proxy Products (Available via Wholesalers)</h3>
                <p style="margin-bottom: 1rem;">Show products available from wholesalers to your customers</p>
                <button class="btn-primary" onclick="loadProxyProducts()">View Proxy Products</button>
                <div id="proxyProductsList" style="margin-top: 1rem;"></div>
            </div>
        ` : ''}
        <div id="inventoryList"></div>
    `;
    
    if (isRetailer) {
        loadWholesalersForProxy();
        document.getElementById('proxyAvailable')?.addEventListener('change', function() {
            document.getElementById('proxyWholesalerId').style.display = this.checked ? 'block' : 'none';
        });
    }
    
    loadInventoryList();
}

async function addProduct(e) {
    e.preventDefault();
    if (!currentUser) return;

    const productData = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDescription').value,
        price: document.getElementById('productPrice').value,
        stock: document.getElementById('productStock').value,
        category: document.getElementById('productCategory').value,
        image: document.getElementById('productImage').value
    };

    if (currentUser.role === 'retailer') {
        const proxyCheckbox = document.getElementById('proxyAvailable');
        if (proxyCheckbox && proxyCheckbox.checked) {
            productData.proxyWholesalerId = document.getElementById('proxyWholesalerId').value;
        }
    }

    try {
        const res = await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(productData)
        });

        if (res.ok) {
            showToast('Product added!');
            loadInventoryList();
            document.getElementById('productName').value = '';
            document.getElementById('productDescription').value = '';
            document.getElementById('productPrice').value = '';
            document.getElementById('productStock').value = '';
            document.getElementById('productCategory').value = '';
        } else {
            showToast('Error adding product');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

async function loadInventoryList() {
    if (!currentUser) return;

    try {
        const role = currentUser.role;
        const res = await fetch(`${API_BASE}/products?${role}Id=${currentUser._id || currentUser.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const products = await res.json();
        
        const list = document.getElementById('inventoryList');
        if (!list) return;

        if (products.length === 0) {
            list.innerHTML = '<p>No products in inventory</p>';
            return;
        }

        list.innerHTML = products.map(product => `
            <div class="inventory-item">
                <div>
                    <h4>${product.name}</h4>
                    <p>₹${product.price.toFixed(2)} | Stock: ${product.stock}</p>
                </div>
                <div>
                    <button class="btn-primary" onclick="editProduct('${product.id}')">Edit</button>
                    <button class="btn-secondary" onclick="deleteProduct('${product.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast('Error loading inventory');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Delete this product?')) return;

    try {
        const res = await fetch(`${API_BASE}/products/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (res.ok) {
            showToast('Product deleted');
            loadInventoryList();
        } else {
            showToast('Error deleting product');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

async function loadDashboardOrders() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const orders = await res.json();

        if (!orders || orders.length === 0) {
            content.innerHTML = '<p style="text-align: center; padding: 2rem;">No orders found</p>';
            return;
        }

        content.innerHTML = `
            <h3 style="margin-bottom: 1.5rem;">Customer Orders</h3>
            <div id="dashboardOrdersList"></div>
        `;

        const list = document.getElementById('dashboardOrdersList');
        if (list) {
            list.innerHTML = orders.map(order => {
                const orderId = (order._id || order.id || '').toString();
                const orderIdShort = orderId.substring(0, 8) || 'N/A';
                const customerName = order.customerId?.name || 'Customer';
                const customerEmail = order.customerId?.email || '';
                const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A';
                const items = order.items || [];
                const totalAmount = order.totalAmount || 0;

                return `
                    <div class="order-card" style="margin-bottom: 1.5rem;">
                        <div class="order-header">
                            <div>
                                <h3>Order #${orderIdShort}</h3>
                                <p><strong>Customer:</strong> ${customerName} ${customerEmail ? `(${customerEmail})` : ''}</p>
                                <p><strong>Placed:</strong> ${createdAt}</p>
                                ${order.deliveryDetails?.trackingNumber ? `<p><strong>Tracking:</strong> ${order.deliveryDetails.trackingNumber}</p>` : ''}
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Update Status:</label>
                                <select class="order-status" style="padding: 0.5rem; border-radius: 5px; font-size: 1rem;" 
                                    onchange="updateOrderStatus('${orderId}', this.value)">
                                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                                    <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
                                    <option value="in_transit" ${order.status === 'in_transit' ? 'selected' : ''}>In Transit</option>
                                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                </select>
                                <div class="order-status ${order.status || 'pending'}" style="margin-top: 0.5rem; text-align: center;">
                                    ${(order.status || 'pending').toUpperCase()}
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                            <h4>Order Items:</h4>
                            ${items.length > 0 ? items.map(item => `
                                <p>${item.productName || 'Product'} - ${item.quantity || 0} x ₹${(item.price || 0).toFixed(2)}</p>
                            `).join('') : '<p>No items</p>'}
                            <p style="margin-top: 0.5rem;"><strong>Total: ₹${totalAmount.toFixed(2)}</strong></p>
                            <p><strong>Payment:</strong> ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'} - 
                                <span class="order-status ${order.paymentStatus || 'pending'}">${(order.paymentStatus || 'pending').toUpperCase()}</span>
                            </p>
                            ${order.deliveryAddress ? `<p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>` : ''}
                            ${order.scheduledDate ? `<p><strong>Scheduled Date:</strong> ${new Date(order.scheduledDate).toLocaleDateString()}</p>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading dashboard orders:', error);
        content.innerHTML = '<p style="color: red;">Error loading orders. Please refresh.</p>';
    }
}

// Make updateOrderStatus globally accessible for inline handlers
window.updateOrderStatus = async function(orderId, status) {
    try {
        const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status })
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Order status updated to ${status.toUpperCase()}`);
            // Reload the orders list
            if (currentUser && (currentUser.role === 'retailer' || currentUser.role === 'wholesaler')) {
                loadDashboardOrders();
            }
            // Also reload customer orders if on orders page
            if (currentUser && currentUser.role === 'customer' && document.getElementById('ordersContent')) {
                loadOrders();
            }
        } else {
            showToast(data.error || 'Error updating order status');
            console.error('Order status update failed:', data);
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        showToast('Error: ' + (error.message || 'Failed to update order status'));
    }
};

function loadAnalytics() {
    const content = document.getElementById('dashboardContent');
    content.innerHTML = '<h3>Analytics Dashboard</h3><p>Analytics features coming soon...</p>';
}

// Queries/Help System
async function loadQueries() {
    if (!currentUser || currentUser.role !== 'customer') {
        showToast('Please login as customer');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/queries/customer`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const queries = await res.json();
        displayQueries(queries);
    } catch (error) {
        showToast('Error loading queries');
        console.error(error);
    }
}

function displayQueries(queries) {
    const content = document.getElementById('queriesContent');
    if (!content) return;

    if (!queries || queries.length === 0) {
        content.innerHTML = '<p style="text-align: center; padding: 2rem;">No queries yet. Raise a query to get help!</p>';
        return;
    }

    content.innerHTML = queries.map(query => {
        const queryId = (query._id || query.id || '').toString();
        const createdAt = query.createdAt ? new Date(query.createdAt).toLocaleString() : 'N/A';
        const respondedAt = query.respondedAt ? new Date(query.respondedAt).toLocaleString() : null;
        const retailerName = query.retailerId?.name || 'N/A';
        const wholesalerName = query.wholesalerId?.name || null;
        const orderNumber = query.orderId?.orderNumber || query.orderId?._id?.toString().substring(0, 8) || null;
        const productName = query.productId?.name || null;

        return `
            <div class="order-card" style="margin-bottom: 1.5rem;">
                <div class="order-header">
                    <div>
                        <h3>${query.subject || 'Query'}</h3>
                        <p><strong>Type:</strong> ${query.type || 'query'} | <strong>Status:</strong> 
                            <span class="order-status ${query.status || 'open'}">${(query.status || 'open').toUpperCase()}</span>
                        </p>
                        <p><strong>Created:</strong> ${createdAt}</p>
                        ${retailerName !== 'N/A' ? `<p><strong>Retailer:</strong> ${retailerName}</p>` : ''}
                        ${wholesalerName ? `<p><strong>Wholesaler:</strong> ${wholesalerName}</p>` : ''}
                        ${orderNumber ? `<p><strong>Order:</strong> #${orderNumber}</p>` : ''}
                        ${productName ? `<p><strong>Product:</strong> ${productName}</p>` : ''}
                    </div>
                </div>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                    <p><strong>Message:</strong></p>
                    <p style="background: #f5f5f5; padding: 1rem; border-radius: 5px; margin: 0.5rem 0;">${query.message || 'No message'}</p>
                    ${query.response ? `
                        <div style="margin-top: 1rem; padding: 1rem; background: #e3f2fd; border-radius: 5px; border-left: 4px solid var(--primary-color);">
                            <p><strong>Response (${respondedAt || 'N/A'}):</strong></p>
                            <p>${query.response}</p>
                            ${query.respondedBy?.name ? `<p style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">- ${query.respondedBy.name}</p>` : ''}
                        </div>
                    ` : '<p style="color: #666; font-style: italic;">No response yet...</p>'}
                </div>
            </div>
        `;
    }).join('');
}

function showNewQueryForm() {
    const content = document.getElementById('queriesContent');
    if (!content) return;

    // Load orders for selection
    fetch(`${API_BASE}/orders`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(orders => {
        const ordersOptions = orders.map(order => {
            const orderId = (order._id || order.id || '').toString();
            return `<option value="${orderId}">Order #${orderId.substring(0, 8)} - ₹${(order.totalAmount || 0).toFixed(2)}</option>`;
        }).join('');

        content.innerHTML = `
            <div class="order-card" style="max-width: 600px;">
                <h3>Raise New Query/Help Request</h3>
                <form id="newQueryForm" onsubmit="submitQuery(event)">
                    <div class="form-group">
                        <label>Query Type</label>
                        <select id="queryType" required>
                            <option value="query">General Query</option>
                            <option value="help">Help Request</option>
                            <option value="feedback">Feedback</option>
                            <option value="complaint">Complaint</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Subject</label>
                        <input type="text" id="querySubject" required placeholder="Brief subject of your query">
                    </div>
                    <div class="form-group">
                        <label>Related Order (Optional)</label>
                        <select id="queryOrderId">
                            <option value="">None</option>
                            ${ordersOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Message</label>
                        <textarea id="queryMessage" rows="5" required placeholder="Describe your query or issue in detail..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Priority</label>
                        <select id="queryPriority">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button type="submit" class="btn-primary">Submit Query</button>
                        <button type="button" class="btn-secondary" onclick="loadQueries()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
    })
    .catch(error => {
        console.error('Error loading orders:', error);
        // Show form without orders
        content.innerHTML = `
            <div class="order-card" style="max-width: 600px;">
                <h3>Raise New Query/Help Request</h3>
                <form id="newQueryForm" onsubmit="submitQuery(event)">
                    <div class="form-group">
                        <label>Query Type</label>
                        <select id="queryType" required>
                            <option value="query">General Query</option>
                            <option value="help">Help Request</option>
                            <option value="feedback">Feedback</option>
                            <option value="complaint">Complaint</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Subject</label>
                        <input type="text" id="querySubject" required placeholder="Brief subject of your query">
                    </div>
                    <div class="form-group">
                        <label>Related Order (Optional)</label>
                        <input type="text" id="queryOrderId" placeholder="Order ID (optional)">
                    </div>
                    <div class="form-group">
                        <label>Message</label>
                        <textarea id="queryMessage" rows="5" required placeholder="Describe your query or issue in detail..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Priority</label>
                        <select id="queryPriority">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 1rem;">
                        <button type="submit" class="btn-primary">Submit Query</button>
                        <button type="button" class="btn-secondary" onclick="loadQueries()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
    });
}

async function submitQuery(e) {
    e.preventDefault();
    
    const type = document.getElementById('queryType').value;
    const subject = document.getElementById('querySubject').value;
    const message = document.getElementById('queryMessage').value;
    const priority = document.getElementById('queryPriority').value;
    const orderId = document.getElementById('queryOrderId').value || null;

    try {
        const res = await fetch(`${API_BASE}/queries`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                type,
                subject,
                message,
                priority,
                orderId: orderId || undefined
            })
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Query submitted successfully!');
            loadQueries();
        } else {
            showToast(data.error || 'Failed to submit query');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

// Dashboard Queries (Retailer/Wholesaler)
async function loadDashboardQueries() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;

    try {
        const endpoint = currentUser.role === 'retailer' ? '/queries/retailer' : '/queries/wholesaler';
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const queries = await res.json();

        if (!queries || queries.length === 0) {
            content.innerHTML = '<p style="text-align: center; padding: 2rem;">No queries yet.</p>';
            return;
        }

        content.innerHTML = queries.map(query => {
            const queryId = (query._id || query.id || '').toString();
            const createdAt = query.createdAt ? new Date(query.createdAt).toLocaleString() : 'N/A';
            const customerName = query.customerId?.name || 'Customer';
            const customerEmail = query.customerId?.email || '';
            const orderNumber = query.orderId?.orderNumber || query.orderId?._id?.toString().substring(0, 8) || null;
            const productName = query.productId?.name || null;

            return `
                <div class="order-card" style="margin-bottom: 1.5rem;">
                    <div class="order-header">
                        <div>
                            <h3>${query.subject || 'Query'}</h3>
                            <p><strong>From:</strong> ${customerName} ${customerEmail ? `(${customerEmail})` : ''}</p>
                            <p><strong>Type:</strong> ${query.type || 'query'} | <strong>Priority:</strong> 
                                <span class="order-status ${query.priority || 'medium'}">${(query.priority || 'medium').toUpperCase()}</span>
                            </p>
                            <p><strong>Status:</strong> <span class="order-status ${query.status || 'open'}">${(query.status || 'open').toUpperCase()}</span></p>
                            <p><strong>Created:</strong> ${createdAt}</p>
                            ${orderNumber ? `<p><strong>Order:</strong> #${orderNumber}</p>` : ''}
                            ${productName ? `<p><strong>Product:</strong> ${productName}</p>` : ''}
                        </div>
                    </div>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                        <p><strong>Message:</strong></p>
                        <p style="background: #f5f5f5; padding: 1rem; border-radius: 5px; margin: 0.5rem 0;">${query.message || 'No message'}</p>
                        ${query.response ? `
                            <div style="margin-top: 1rem; padding: 1rem; background: #e3f2fd; border-radius: 5px;">
                                <p><strong>Your Response:</strong></p>
                                <p>${query.response}</p>
                            </div>
                        ` : ''}
                        <div style="margin-top: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Response:</label>
                            <textarea id="response-${queryId}" rows="3" style="width: 100%; padding: 0.5rem; border-radius: 5px; border: 1px solid var(--border-color);" 
                                placeholder="Type your response here...">${query.response || ''}</textarea>
                            <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
                                <select id="status-${queryId}" style="padding: 0.5rem; border-radius: 5px;">
                                    <option value="open" ${query.status === 'open' ? 'selected' : ''}>Open</option>
                                    <option value="in_progress" ${query.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                    <option value="resolved" ${query.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                                    <option value="closed" ${query.status === 'closed' ? 'selected' : ''}>Closed</option>
                                </select>
                                <button class="btn-primary" onclick="respondToQuery('${queryId}')">Submit Response</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading dashboard queries:', error);
        content.innerHTML = '<p style="color: red;">Error loading queries. Please refresh.</p>';
    }
}

async function respondToQuery(queryId) {
    const response = document.getElementById(`response-${queryId}`).value;
    const status = document.getElementById(`status-${queryId}`).value;

    if (!response.trim()) {
        showToast('Please enter a response');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/queries/${queryId}/respond`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ response, status })
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Response submitted successfully!');
            loadDashboardQueries();
        } else {
            showToast(data.error || 'Failed to submit response');
        }
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

async function loadWholesalersForProxy() {
    try {
        const res = await fetch(`${API_BASE}/products?wholesalerId=all`);
        const allProducts = await res.json();
        const wholesalerIds = [...new Set(allProducts.map(p => p.wholesalerId).filter(id => id))];
        
        const select = document.getElementById('proxyWholesalerId');
        if (select) {
            select.innerHTML = '<option value="">Select Wholesaler</option>' +
                wholesalerIds.map(id => `<option value="${id}">Wholesaler ${id.substring(0, 8)}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading wholesalers');
    }
}

async function loadProxyProducts() {
    try {
        const res = await fetch(`${API_BASE}/products/proxy/${currentUser._id || currentUser.id}`);
        const products = await res.json();
        
        const list = document.getElementById('proxyProductsList');
        if (!list) return;

        if (products.length === 0) {
            list.innerHTML = '<p>No proxy products available</p>';
            return;
        }

        list.innerHTML = products.map(product => `
            <div class="inventory-item">
                <div>
                    <h4>${product.name} <span style="font-size: 0.8rem; color: var(--secondary-color);">(Proxy)</span></h4>
                    <p>₹${product.price.toFixed(2)} | Stock: ${product.stock}</p>
                    <p style="font-size: 0.9rem; color: #666;">Available via Wholesaler</p>
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast('Error loading proxy products');
    }
}

// Profile
async function loadProfile() {
    if (!currentUser) {
        showToast('Please login');
        return;
    }

    const content = document.getElementById('profileContent');
    content.innerHTML = `
        <div class="auth-container">
            <h3>Profile Information</h3>
            <p><strong>Name:</strong> ${currentUser.name}</p>
            <p><strong>Email:</strong> ${currentUser.email}</p>
            <p><strong>Role:</strong> ${currentUser.role}</p>
            <p><strong>Phone:</strong> ${currentUser.phone || 'Not set'}</p>
            <p><strong>Address:</strong> ${currentUser.address || 'Not set'}</p>
        </div>
    `;
}

// Leaflet.js Map Integration (OpenStreetMap - Free, No API key required)
let map = null;
let locationMarker = null;
let userLocation = null;
let locationPickerContext = 'register'; // 'register' or 'order'

// Reverse geocoding function to convert lat/lng to address
async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: {
                'User-Agent': 'LiveMart/1.0' // Required by Nominatim
            }
        });
        const data = await response.json();
        
        if (data && data.address) {
            const addr = data.address;
            const addressParts = [];
            
            // Build address from available components
            if (addr.house_number) addressParts.push(addr.house_number);
            if (addr.road) addressParts.push(addr.road);
            if (addr.neighbourhood || addr.suburb) addressParts.push(addr.neighbourhood || addr.suburb);
            if (addr.city || addr.town || addr.village) addressParts.push(addr.city || addr.town || addr.village);
            if (addr.state) addressParts.push(addr.state);
            if (addr.postcode) addressParts.push(addr.postcode);
            if (addr.country) addressParts.push(addr.country);
            
            return addressParts.join(', ') || data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

function openLocationPicker(context = 'register') {
    locationPickerContext = context;
    
    // Check if there's already a selected location
    let initialLat, initialLng;
    let useExistingLocation = false;
    
    if (context === 'register') {
        const registerLocationInput = document.getElementById('registerLocation');
        if (registerLocationInput && registerLocationInput.value) {
            try {
                const existingLocation = JSON.parse(registerLocationInput.value);
                if (existingLocation.lat && existingLocation.lng) {
                    initialLat = existingLocation.lat;
                    initialLng = existingLocation.lng;
                    useExistingLocation = true;
                }
            } catch (e) {
                // Invalid location data, will use geolocation
            }
        }
    } else if (context === 'order') {
        const orderLocationInput = document.getElementById('orderLocation');
        if (orderLocationInput && orderLocationInput.value) {
            try {
                const existingLocation = JSON.parse(orderLocationInput.value);
                if (existingLocation.lat && existingLocation.lng) {
                    initialLat = existingLocation.lat;
                    initialLng = existingLocation.lng;
                    useExistingLocation = true;
                }
            } catch (e) {
                // Invalid location data, will use geolocation
            }
        }
    }
    
    // If we have an existing location, use it directly
    if (useExistingLocation) {
        userLocation = { lat: initialLat, lng: initialLng };
        showMapWithLocation(initialLat, initialLng, context);
        return;
    }
    
    // Otherwise, get current geolocation
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            userLocation = { lat, lng };
            showMapWithLocation(lat, lng, context);
        },
        (error) => {
            showToast('Error getting location: ' + error.message);
        }
    );
}

function showMapWithLocation(lat, lng, context) {
    // Set user location
    userLocation = { lat, lng };
    
    // Determine where to append the map based on context
    let parentElement;
    let locationDisplayElement;
    
    if (context === 'register') {
        locationDisplayElement = document.getElementById('locationDisplay');
        parentElement = locationDisplayElement ? locationDisplayElement.parentElement : null;
    } else if (context === 'order') {
        locationDisplayElement = document.getElementById('orderLocationDisplay');
        parentElement = locationDisplayElement ? locationDisplayElement.parentElement : null;
        
        // Fallback: if orderLocationDisplay doesn't exist, find the delivery address parent
        if (!parentElement) {
            const deliveryAddress = document.getElementById('deliveryAddress');
            if (deliveryAddress && deliveryAddress.parentElement) {
                parentElement = deliveryAddress.parentElement;
            }
        }
    }
    
    if (!parentElement) {
        showToast('Could not find location display element');
        return;
    }
    
    // Remove existing map container if it exists
    const existingContainer = document.getElementById('locationPickerContainer');
    if (existingContainer) {
        existingContainer.remove();
        if (map) {
            map.remove();
            map = null;
        }
    }
    
    // Create container for map and button
    const mapContainer = document.createElement('div');
    mapContainer.id = 'locationPickerContainer';
    mapContainer.style.marginTop = '1rem';
    
    // Initialize Leaflet map div
    const mapDiv = document.createElement('div');
    mapDiv.id = 'locationPickerMap';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '400px';
    mapDiv.style.borderRadius = '10px';
    mapDiv.style.marginBottom = '0.5rem';
    
    // Create confirm location button
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn-primary';
    confirmButton.innerHTML = '<i class="fas fa-check"></i> Confirm Location';
    confirmButton.style.width = '100%';
    confirmButton.style.marginTop = '0.5rem';
    confirmButton.onclick = async () => {
        if (userLocation) {
            // Show loading state
            confirmButton.disabled = true;
            confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting address...';
            
            try {
                await updateLocationDisplay();
                showToast('Location confirmed! Address updated.');
                
                // Hide the map after confirmation so user can proceed
                mapContainer.style.display = 'none';
            } catch (error) {
                showToast('Error getting address. Please try again.');
                console.error('Error updating location:', error);
            } finally {
                // Reset button
                confirmButton.disabled = false;
                confirmButton.innerHTML = '<i class="fas fa-check"></i> Confirm Location';
            }
        } else {
            showToast('Please select a location on the map first');
        }
    };
    
    mapContainer.appendChild(mapDiv);
    mapContainer.appendChild(confirmButton);
    parentElement.appendChild(mapContainer);
    
    // Initialize Leaflet map with OpenStreetMap tiles
    map = L.map('locationPickerMap').setView([lat, lng], 15);
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Add draggable marker
    locationMarker = L.marker([lat, lng], {
        draggable: true,
        title: 'Your Location'
    }).addTo(map);

    // Handle map click - just move marker, don't update address yet
    map.on('click', (e) => {
        const newLocation = { lat: e.latlng.lat, lng: e.latlng.lng };
        locationMarker.setLatLng([newLocation.lat, newLocation.lng]);
        userLocation = newLocation;
        // Update only the coordinates display, not the address
        updateLocationCoordinates();
    });

    // Handle marker drag - just update position, don't update address yet
    locationMarker.on('dragend', (e) => {
        const pos = locationMarker.getLatLng();
        userLocation = { lat: pos.lat, lng: pos.lng };
        // Update only the coordinates display, not the address
        updateLocationCoordinates();
    });

    // Initial display of coordinates
    updateLocationCoordinates();
    showToast('Click on map or drag marker to set your location, then click "Confirm Location"');
}

// Update only the coordinates display without reverse geocoding
function updateLocationCoordinates() {
    if (!userLocation) return;
    
    const lat = userLocation.lat;
    const lng = userLocation.lng;
    
    if (locationPickerContext === 'register') {
        const locationDisplay = document.getElementById('locationDisplay');
        if (locationDisplay) {
            locationDisplay.innerHTML = 
                `<i class="fas fa-map-marker-alt"></i> Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)} - Click "Confirm Location" to update address`;
        }
    } else if (locationPickerContext === 'order') {
        const orderLocationDisplay = document.getElementById('orderLocationDisplay');
        if (orderLocationDisplay) {
            orderLocationDisplay.innerHTML = 
                `<i class="fas fa-map-marker-alt"></i> Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)} - Click "Confirm Location" to update address`;
        }
    }
}

// Update location display with reverse geocoded address (called when Confirm button is clicked)
async function updateLocationDisplay() {
    if (!userLocation) return;
    
    const lat = userLocation.lat;
    const lng = userLocation.lng;
    
    // Get reverse geocoded address
    const address = await reverseGeocode(lat, lng);
    
    if (locationPickerContext === 'register') {
        const registerLocationInput = document.getElementById('registerLocation');
        const locationDisplay = document.getElementById('locationDisplay');
        const registerAddress = document.getElementById('registerAddress');
        
        if (registerLocationInput) {
            registerLocationInput.value = JSON.stringify(userLocation);
        }
        if (locationDisplay) {
            locationDisplay.innerHTML = 
                `<i class="fas fa-check-circle" style="color: #4caf50;"></i> Location confirmed: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
        // Update the address field with reverse geocoded address
        if (registerAddress) {
            registerAddress.value = address;
        }
    } else if (locationPickerContext === 'order') {
        const orderLocationInput = document.getElementById('orderLocation');
        const orderLocationDisplay = document.getElementById('orderLocationDisplay');
        const deliveryAddress = document.getElementById('deliveryAddress');
        
        if (orderLocationInput) {
            orderLocationInput.value = JSON.stringify(userLocation);
        }
        if (orderLocationDisplay) {
            orderLocationDisplay.innerHTML = 
                `<i class="fas fa-check-circle" style="color: #4caf50;"></i> Location confirmed: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
        // Update the delivery address field with reverse geocoded address
        if (deliveryAddress) {
            deliveryAddress.value = address;
        }
    }
}

function showNearbyShopsMap() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            try {
                const res = await fetch(`${API_BASE}/search/shops/nearby?lat=${lat}&lng=${lng}&maxDistance=50`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const shops = await res.json();

                showSection('map-section');
                
                // Initialize Leaflet map
                const mapDiv = document.getElementById('map');
                if (map) {
                    map.remove();
                }
                
                map = L.map('map').setView([lat, lng], 12);
                
                // Add OpenStreetMap tile layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);

                // Add user location marker with custom icon
                const userIcon = L.divIcon({
                    className: 'custom-marker',
                    html: '<div style="background-color: #4285f4; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                
                L.marker([lat, lng], { icon: userIcon })
                    .addTo(map)
                    .bindPopup('<b>Your Location</b>');

                // Add shop markers
                shops.forEach(shop => {
                    const shopIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background-color: ${shop.role === 'retailer' ? '#ea4335' : '#34a853'}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    
                    const marker = L.marker([shop.location.lat, shop.location.lng], { 
                        icon: shopIcon,
                        title: shop.name
                    }).addTo(map);

                    const popupContent = `
                        <div style="padding: 0.5rem;">
                            <h3 style="margin: 0 0 0.5rem 0;">${shop.name}</h3>
                            <p style="margin: 0.25rem 0;"><strong>Type:</strong> ${shop.role}</p>
                            <p style="margin: 0.25rem 0;"><strong>Address:</strong> ${shop.address || 'No address'}</p>
                            <p style="margin: 0.25rem 0;"><strong>Distance:</strong> ${shop.distance} km</p>
                        </div>
                    `;
                    
                    marker.bindPopup(popupContent);
                });

                // Display shops list
                const listDiv = document.getElementById('nearbyShopsList');
                listDiv.innerHTML = shops.map(shop => `
                    <div class="feature-card" style="margin: 1rem 0;">
                        <h3>${shop.name}</h3>
                        <p><strong>Type:</strong> ${shop.role}</p>
                        <p><strong>Distance:</strong> ${shop.distance} km</p>
                        <p><strong>Address:</strong> ${shop.address || 'No address'}</p>
                        <button class="btn-primary" onclick="viewShopProducts('${shop.id}')">View Products</button>
                    </div>
                `).join('');

            } catch (error) {
                showToast('Error loading nearby shops');
            }
        },
        (error) => {
            showToast('Error getting location');
        }
    );
}

async function viewShopProducts(shopId) {
    try {
        const role = shopId.includes('retailer') ? 'retailer' : 'wholesaler';
        const res = await fetch(`${API_BASE}/products?${role}Id=${shopId}`);
        const products = await res.json();
        
        if (products.length === 0) {
            showToast('No products available from this shop');
            return;
        }

        showSection('products');
        displayProducts(products);
        showToast(`Showing ${products.length} products from this shop`);
    } catch (error) {
        showToast('Error loading shop products');
    }
}

// Toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

