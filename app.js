

const API = 'https://boarding-finder-backend-production.up.railway.app/api';

let allListings    = [];
let currentListing = null;
let currentRating  = 0;
let currentReviewsPageRating = 0;
let reviewsOffset  = 0;
let savedIds       = new Set();
let signupRole     = 'student';

function getSavedStorageKey() {
  const role = localStorage.getItem('userRole') || '';
  const userId = localStorage.getItem('userId') || '';
  if (role === 'student' && userId) return `saved_${userId}`;
  return 'saved_guest';
}
function loadSavedIdsFromStorage() {
  try {
    savedIds = new Set(JSON.parse(localStorage.getItem(getSavedStorageKey()) || '[]'));
  } catch {
    savedIds = new Set();
  }
}
function persistSavedIds() {
  localStorage.setItem(getSavedStorageKey(), JSON.stringify([...savedIds]));
}

// Media state
let alSelectedFiles    = [];   
let modalSelectedFiles = [];   
let modalListingId     = null; 
let lightboxMedia      = [];   
let lightboxIndex      = 0;

// ── Toast 
function showToast(msg, type = '') {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;z-index:9999;transform:translateY(100px);transition:transform .3s;pointer-events:none;max-width:320px;';
    document.body.appendChild(t);
  }

  t.textContent = msg;
  t.style.background = type==='success'?'#018790':type==='error'?'#EF4444':type==='warning'?'#F59E0B':'#1F2937';
  t.style.color = type==='warning'?'#1F2937':'white';
  t.style.transform = 'translateY(0)';
  setTimeout(() => t.style.transform = 'translateY(100px)', 3500);
}

function showMsg(el, text, type) {
  if (!el) return;
  el.style.display = 'block';
  el.style.background = type==='success'?'#D1FAE5':type==='error'?'#FEE2E2':'#E0F5F5';
  el.style.color = type==='success'?'#065F46':type==='error'?'#DC2626':'#005461';
  el.textContent = text;

}

// ── Page navigation 

const PAGE_FILE_MAP = {
  home: 'index.html',
  results: 'search.html',
  detail: 'search.html',
  booking: 'search.html',
  reviews: 'search.html',
  dashboard: 'dashboard.html',
  allbookings: 'my-bookings.html',
  'add-listing': 'dashboard.html',
  saved: 'saved.html',
  auth: 'auth.html',
  login: 'auth.html',
  signup: 'auth.html'
};

function getCurrentPageId() {
  if (document.body?.dataset?.page) return document.body.dataset.page;
  const activePage = document.querySelector('.page');
  if (activePage?.id?.startsWith('page-')) return activePage.id.replace('page-', '');
  return 'home';
}

function getSearchView() {
  return new URLSearchParams(window.location.search).get('view') || '';
}

function getAuthView() {
  return new URLSearchParams(window.location.search).get('auth') === 'signup' ? 'signup' : 'login';
}

function setActiveNav(pageId) {
  document.querySelectorAll('.nav-links a, .mobile-nav-links a').forEach(a => a.classList.remove('active'));
  const navMap = {
    home: 'home',
    results: 'results',
    detail: 'results',
    booking: 'results',
    reviews: 'results',
    dashboard: 'dashboard',
    allbookings: 'dashboard',
    'add-listing': 'dashboard',
    saved: null,
    auth: null,
    login: null,
    signup: null
    

  };
  const navKey = navMap[pageId];
  if (!navKey) return;
  document.getElementById(`nav-${navKey}`)?.classList.add('active');
  document.getElementById(`mobile-nav-${navKey}`)?.classList.add('active');
}

function buildPageUrl(pageId, options = {}) {
  const resolvedPage = pageId === 'auth' ? (options.authMode || getAuthView()) : pageId;
  const file = PAGE_FILE_MAP[resolvedPage] || PAGE_FILE_MAP.home;
  const url = new URL(file, window.location.href);

  if (['detail', 'booking', 'reviews'].includes(resolvedPage)) {
    url.searchParams.set('view', resolvedPage);
  }
  if (resolvedPage === 'login') url.searchParams.set('auth', 'login');
  if (resolvedPage === 'signup') url.searchParams.set('auth', 'signup');
  if (resolvedPage === 'auth') url.searchParams.set('auth', options.authMode || 'login');
  if (resolvedPage === 'add-listing' || options.section === 'add') url.searchParams.set('section', 'add');
  if (options.listingId) url.searchParams.set('id', options.listingId);

  return url.toString();
}

function navigateToPage(pageId, options = {}) {
  window.location.href = buildPageUrl(pageId, options);
}

function persistCurrentListing(listing) {
  if (!listing) return;
  try {
    sessionStorage.setItem('currentListing', JSON.stringify(listing));
    if (listing._id) sessionStorage.setItem('currentListingId', listing._id);
  } catch {}
}

function restoreCurrentListing() {
  if (currentListing) return currentListing;
  try {
    const raw = sessionStorage.getItem('currentListing');
    if (raw) currentListing = JSON.parse(raw);
  } catch {}
  return currentListing;
}

function getCurrentListingId() {
  const urlId = new URLSearchParams(window.location.search).get('id');
  if (urlId) return urlId;
  try {
    const stored = sessionStorage.getItem('currentListingId');
    if (stored) return stored;
  } catch {}
  return restoreCurrentListing()?._id || '';
}

async function ensureCurrentListingLoaded(id = '') {
  const targetId = id || getCurrentListingId();
  const restored = restoreCurrentListing();
  if (restored && (!targetId || restored._id === targetId)) {
    currentListing = restored;
    return currentListing;
  }
  if (!targetId) return currentListing;
  try {
    const headers = getToken() ? { 'Authorization': 'Bearer ' + getToken() } : {};
    const res = await fetch(`${API}/listings/${targetId}`, { headers });
    currentListing = await res.json();
    persistCurrentListing(currentListing);
    return currentListing;
  } catch {
    return null;
  }
}

async function initCurrentPage() {
  loadSavedIdsFromStorage();
  updateNav();
  const pageId = getCurrentPageId();
  setActiveNav(pageId === 'auth' ? getAuthView() : pageId);

  if (pageId === 'home') {
    await loadHomeListings();
    await loadHomeStats();
  }

  if (pageId === 'results') {
    await applyFilters();
    const view = getSearchView();
    if (view === 'detail') {
      const listing = await ensureCurrentListingLoaded();
      if (listing) {
        await renderCurrentDetailPage();
        openSearchModal('detail', false);
      }
    }
    if (view === 'booking') {
      if (!isLoggedIn()) { showToast('Please sign in to make a booking', 'warning'); navigateToPage('login'); return; }
      const listing = await ensureCurrentListingLoaded();
      if (listing) {
        hydrateBookingPage(listing);
        openSearchModal('booking', false);
      }
    }
    if (view === 'reviews') {
      const listing = await ensureCurrentListingLoaded();
      if (listing) {
        await loadReviewsPage();
        openSearchModal('reviews', false);
      }
    }
  }

  if (pageId === 'dashboard') {
    if (!isLoggedIn()) { showToast('Please sign in to view your dashboard', 'warning'); navigateToPage('login'); return; }
    await loadDashboard();
    syncDashboardAddSection();
    if (new URLSearchParams(window.location.search).get('section') === 'add') {
      setTimeout(() => focusDashboardAddSection(), 120);
    }
  }

  if (pageId === 'allbookings') {
    if (!isLoggedIn()) { showToast('Please sign in to view your bookings', 'warning'); navigateToPage('login'); return; }
    await openAllBookings();
  }

  if (pageId === 'saved') {
    await loadSavedPage();
  }

  if (pageId === 'auth') {
    showAuthMode(getAuthView(), false);
    if (document.getElementById('login-tab-student')) switchLoginRole('student');
    if (document.getElementById('signup-tab-student')) switchSignupRole(signupRole || 'student');
  }
}

function showPage(id) {
  closeMobileMenu();
  const currentPage = getCurrentPageId();
  const listingId = ['detail', 'booking', 'reviews'].includes(id) ? (currentListing?._id || getCurrentListingId()) : undefined;

  if (currentPage === 'results' && ['detail', 'booking', 'reviews'].includes(id) && listingId) {
    if (id === 'detail') { openDetail(listingId); return; }
    if (id === 'booking') { goToBooking(); return; }
    if (id === 'reviews') { loadReviewsPage().then(() => openSearchModal('reviews')); return; }
    navigateToPage(id, { listingId });
    return;
  }

  if ((currentPage === 'auth' && ['login', 'signup'].includes(id)) || (currentPage === id)) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveNav(id);
    if (currentPage === 'auth' && ['login', 'signup'].includes(id)) {
      showAuthMode(id);
      return;
    }
    if (id === 'home') { loadHomeListings(); loadHomeStats(); }
    if (id === 'results') applyFilters();
    if (id === 'dashboard' && isLoggedIn()) { loadDashboard().then(syncDashboardAddSection); }
    if (id === 'saved') loadSavedPage();
    if (id === 'allbookings' && isLoggedIn()) openAllBookings();
    return;
  }

  navigateToPage(id, { listingId });
}

function selectRoom(el) {

  document.querySelectorAll('.room-type-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}
function selectPayment(el) {
  document.querySelectorAll('.payment-option').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}
function switchLoginRole(role) {
  document.getElementById('login-tab-student').classList.toggle('active', role==='student');
  document.getElementById('login-tab-owner').classList.toggle('active', role==='owner');
  document.getElementById('login-owner-extra').style.display = role==='owner'?'block':'none';
}
function switchSignupRole(role) {
  signupRole = role;
  document.getElementById('signup-tab-student').classList.toggle('active', role==='student');
  document.getElementById('signup-tab-owner').classList.toggle('active', role==='owner');
  document.getElementById('signup-student-fields').style.display = role==='student'?'block':'none';
  document.getElementById('signup-owner-fields').style.display   = role==='owner'?'block':'none';
}

// ── Nav 

function toggleMobileMenu() {
  document.getElementById('mobile-nav-menu')?.classList.toggle('open');
}
function closeMobileMenu() {
  document.getElementById('mobile-nav-menu')?.classList.remove('open');
}
window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMobileMenu(); });
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobile-nav-menu');
  const toggle = document.querySelector('.mobile-nav-toggle');
  if (!menu || !toggle) return;
  if (menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) closeMobileMenu();
});


function showAuthMode(mode = 'login', push = true) {
  const loginPanel = document.getElementById('auth-login-panel');
  const signupPanel = document.getElementById('auth-signup-panel');
  const loginBtn = document.getElementById('auth-mode-login-btn');
  const signupBtn = document.getElementById('auth-mode-signup-btn');
  if (!loginPanel || !signupPanel) return;

  loginPanel.classList.toggle('active', mode === 'login');
  signupPanel.classList.toggle('active', mode === 'signup');
  loginBtn?.classList.toggle('active', mode === 'login');
  signupBtn?.classList.toggle('active', mode === 'signup');

  if (push) {
    const nextUrl = buildPageUrl(mode);
    window.history.replaceState({}, '', nextUrl);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSearchModal(view, push = true) {
  ['detail', 'booking', 'reviews'].forEach(v => {
    document.getElementById(`overlay-${v}`)?.classList.remove('open');
  });
  const shell = document.getElementById(`overlay-${view}`);
  if (!shell) return;
  shell.classList.add('open');
  document.body.classList.add('modal-open');
  if (push) {
    const listingId = currentListing?._id || getCurrentListingId();
    window.history.pushState({}, '', buildPageUrl(view, { listingId }));
  }
}

function closeSearchModal(push = true) {
  ['detail', 'booking', 'reviews'].forEach(v => {
    document.getElementById(`overlay-${v}`)?.classList.remove('open');
  });
  document.body.classList.remove('modal-open');
  if (push && getCurrentPageId() === 'results' && getSearchView()) {
    window.history.pushState({}, '', buildPageUrl('results'));
  }
}

function focusDashboardAddSection() {
  const section = document.getElementById('dashboard-add-section');
  if (!section) return;
  section.style.display = '';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toggleFutureVacancyFields('al');
}

function syncDashboardAddSection() {
  const section = document.getElementById('dashboard-add-section');
  if (!section) return;
  const role = getUserRole();
  section.style.display = role === 'landlord' ? '' : 'none';
}

function updateNav() {
  const name = localStorage.getItem('userName');
  const role = localStorage.getItem('userRole');
  const navEnd = document.querySelector('.nav-end');
  const navDashLink = document.getElementById('nav-dashboard');
  const mobileDashLink = document.getElementById('mobile-nav-dashboard');
  const mobileActions = document.getElementById('mobile-nav-actions');
  const mobileUser = document.getElementById('mobile-nav-user');

  if (navDashLink) {
    if (role === 'landlord') {
      navDashLink.style.display = '';
      navDashLink.textContent = 'Owner Portal';
      navDashLink.onclick = function() { showPage('dashboard'); closeMobileMenu(); };
    } else if (name) {
      navDashLink.style.display = '';
      navDashLink.textContent = 'My Bookings';
      navDashLink.onclick = function() { showPage('allbookings'); closeMobileMenu(); };
    } else {
      navDashLink.style.display = 'none';
    }
  }

  if (mobileDashLink) {
    if (role === 'landlord') {
      mobileDashLink.style.display = '';
      mobileDashLink.textContent = 'Dashboard';
      mobileDashLink.onclick = function() { showPage('dashboard'); closeMobileMenu(); };
    } else if (name) {
      mobileDashLink.style.display = '';
      mobileDashLink.textContent = 'My Bookings';
      mobileDashLink.onclick = function() { showPage('allbookings'); closeMobileMenu(); };
    } else {
      mobileDashLink.style.display = 'none';
    }
  }

  if (mobileUser) mobileUser.textContent = name ? `👤 ${name}` : 'Menu';
  if (!navEnd) return;

  if (name) {
    navEnd.innerHTML = `
      <span style="font-size:13px;color:var(--gray-600);font-weight:500;">👤 ${name}</span>
      ${role==='landlord'
        ? '<button class="btn btn-ghost" onclick="showPage(\'dashboard\')">Dashboard</button>'
        : '<button class="btn btn-ghost" onclick="showPage(\'saved\')">♥ Saved</button>'}
      <button class="btn btn-ghost" onclick="logoutUser()">Sign Out</button>`;
    if (mobileActions) mobileActions.innerHTML = `
      ${role==='landlord'
        ? '<button onclick="showPage(\'dashboard\'); closeMobileMenu();">Dashboard</button>'
        : '<button onclick="showPage(\'saved\'); closeMobileMenu();">♥ Saved</button><button onclick="showPage(\'allbookings\'); closeMobileMenu();">📘 My Bookings</button>'}
      <button onclick="logoutUser(); closeMobileMenu();">Sign Out</button>`;
  } else {
    navEnd.innerHTML = `
      <button class="btn btn-ghost" onclick="goToAddListing()">List Property</button>
      <button class="btn btn-ghost" onclick="showPage('login')">Sign In</button>
      <button class="btn btn-primary" onclick="showPage('signup')">Sign Up</button>`;
    if (mobileActions) mobileActions.innerHTML = `
      <button onclick="goToAddListing(); closeMobileMenu();">List Property</button>
      <button onclick="showPage('login'); closeMobileMenu();">Sign In</button>
      <button onclick="showPage('signup'); closeMobileMenu();">Sign Up</button>`;
  }

  setActiveNav(getCurrentPageId());
}


// ── Auth helpers 
const getToken    = () => localStorage.getItem('token');
const getUserRole = () => localStorage.getItem('userRole');
const isLoggedIn  = () => !!getToken();

async function signupUser() {
  const fname    = document.getElementById('signup-fname')?.value.trim();
  const lname    = document.getElementById('signup-lname')?.value.trim();
  const email    = document.getElementById('signup-email')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  if (!fname || !email || !password) { showToast('Please fill all required fields', 'error'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
  try {
    const res  = await fetch(`${API}/auth/signup`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name:`${fname} ${lname}`, email, password, role:signupRole==='owner'?'landlord':'student' })
    });
    const data = await res.json();
    if (data.message) {
      showToast('Account created! Please sign in.', 'success');
      document.getElementById('login-email').value = email;
      showPage('login');
    } else { showToast(data.error||'Signup failed', 'error'); }
  } catch { showToast('Connection error — is the server running?', 'error'); }
}

async function loginUser() {
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  if (!email || !password) { showToast('Please enter email and password', 'error'); return; }
  try {
    const res  = await fetch(`${API}/auth/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token',         data.token);
      localStorage.setItem('userName',      data.name);
      localStorage.setItem('userRole',      data.role);
      localStorage.setItem('userId',        data.userId||'');
      localStorage.setItem('phoneVerified', data.phoneVerified ? '1' : '0');
      localStorage.setItem('userPhone',     data.phone || '');
      loadSavedIdsFromStorage();
      updateNav();
      showToast(`Welcome back, ${data.name}! 👋`, 'success');
      setTimeout(() => { showPage('home'); loadHomeListings(); }, 800);
    } else { showToast(data.error||'Login failed — check your credentials', 'error'); }
  } catch { showToast('Connection error — is the server running?', 'error'); }
}

function logoutUser() {
  ['token','userName','userRole','userId','phoneVerified','userPhone'].forEach(k => localStorage.removeItem(k));
  loadSavedIdsFromStorage();
  allListings = [];
  updateNav();
  showToast('Signed out successfully', 'success');
  showPage('home');
  loadHomeListings();
}

// ── Listings
async function fetchListings() {
  try {
    const headers = getToken() ? { 'Authorization':'Bearer '+getToken() } : {};
    const res = await fetch(`${API}/listings`, { headers });
    allListings = await res.json();
    if (!Array.isArray(allListings)) allListings = [];
  } catch { allListings = []; }
}

const GRADS = ['linear-gradient(135deg,#80DBD9,#5CCFCD)','linear-gradient(135deg,#A8E6E5,#5CCFCD)','linear-gradient(135deg,#80CECE,#018790)','linear-gradient(135deg,#4ABFBE,#005461)','linear-gradient(135deg,#A8E6E5,#66CFCE)'];
const ICONS = ['🏘️','🏠','🏡','🏢','🏗️'];
function gradFor(id) { const n=parseInt(id.slice(-4),16)%GRADS.length; return GRADS[isNaN(n)?0:n]; }
function iconFor(id) { const n=parseInt(id.slice(-4),16)%ICONS.length; return ICONS[isNaN(n)?0:n]; }

// Get first image URL
function firstImage(l) {
  if (l.media && l.media.length) {
    const img = l.media.find(m => m.type === 'image');
    
    if (img) return img.url.startsWith('http') ? img.url : `${API.replace('/api','')}${img.url}`;
  }
  return null;
}

function mediaThumb(l, size='100%') {
  const img = firstImage(l);
  if (img) return `<img src="${img}" style="width:${size};height:100%;object-fit:cover;" onerror="this.style.display='none'">`;
  return iconFor(l._id);
}

function isFutureVacancy(l) { return !l.available && Number(l.futureVacancyMonths || 0) > 0; }
function isBookedListing(l) { return !l.available && !isFutureVacancy(l); }
function availabilityMeta(l) {
  if (l.available) return { badgeClass:'badge-available', badgeText:'✓ Available Now', shortText:'✓ Now', footerText:'✅ Available Now', detailText:'Available Now' };
  if (isFutureVacancy(l)) {
    const months = Number(l.futureVacancyMonths || 0);
    const label = months === 1 ? '1 month' : `${months} months`;
    return { badgeClass:'badge-soon', badgeText:`📅 Coming Soon · ${label}`, shortText:'📅 Soon', footerText:`📅 Future Vacancy in ${label}`, detailText:`Coming Soon · Available in ${label}` };
  }
  return { badgeClass:'badge-soon', badgeText:'🚫 Booked', shortText:'🚫 Booked', footerText:'🚫 Booked', detailText:'Booked' };
}

function isActivelyBookedListing(listing) {
  return !!listing && !listing.available && !isFutureVacancy(listing);
}


function genderBadgeClass(v) {
  if (!v) return '';
  const s = String(v).toLowerCase();
  if (s.includes('gent')) return 'gender-gents';
  if (s.includes('lad')) return 'gender-ladies';
  return '';
}
function genderBadgeHTML(v, extraStyle='') {
  if (!v) return '';
  const styleAttr = extraStyle ? ` style="${extraStyle}"` : '';
  return `<span class="badge gender-badge ${genderBadgeClass(v)}"${styleAttr}>${v}</span>`;
}


function hydrateBookingPage(listing = currentListing) {
  if (!listing) return;
  const meta = availabilityMeta(listing);
  const img = firstImage(listing);
  const mediaEl = document.getElementById('bk-card-media');
  const titleEl = document.getElementById('bk-card-title');
  const subEl = document.getElementById('bk-card-sub');
  const badgesEl = document.getElementById('bk-card-badges');
  const priceEl = document.getElementById('bk-card-price');
  const crumbEl = document.querySelector('#page-booking .breadcrumb a:nth-of-type(2)');

  if (crumbEl) crumbEl.textContent = listing.title || 'Listing';
  if (mediaEl) {
    if (img) {
      mediaEl.style.background = 'transparent';
      mediaEl.innerHTML = `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.parentElement.style.background='linear-gradient(135deg,#80DBD9,#5CCFCD)';this.parentElement.textContent='🏘️'">`;
    } else {
      mediaEl.style.background = gradFor(listing._id || '0');
      mediaEl.textContent = iconFor(listing._id || '0');
    }
  }
  if (titleEl) titleEl.textContent = listing.title || '—';
  if (subEl) subEl.textContent = `${listing.roomType || 'Room'} · ${listing.city || '—'}${listing.boardingFor ? ' · ' + listing.boardingFor : ''}`;
  if (badgesEl) badgesEl.innerHTML = `<span class="badge ${meta.badgeClass}">${meta.badgeText}</span>${genderBadgeHTML(listing.boardingFor, 'margin-left:6px;')}`;
  if (priceEl) priceEl.textContent = `LKR ${Number(listing.price || 0).toLocaleString()}`;

  const sumTitle = document.getElementById('bk-sum-title');
  const sumRoom = document.getElementById('bk-sum-room');
  const sumDep = document.getElementById('bk-sum-deposit');
  const sumRent = document.getElementById('bk-sum-rent');
  const sumAdv = document.getElementById('bk-sum-advance');
  const sumTotal = document.getElementById('bk-sum-total');
  const dep = Number(listing.deposit || 0);
  const rent = Number(listing.price || 0);
  const adv = Number(listing.advance || 0);
  if (sumTitle) sumTitle.textContent = listing.title || '—';
  if (sumRoom) {
    const futureText = isFutureVacancy(listing)
      ? ` · ${Number(listing.futureVacancyMonths || 0)} month${Number(listing.futureVacancyMonths || 0) === 1 ? '' : 's'} ahead`
      : ' · Available now';
    sumRoom.textContent = `${listing.roomType || 'Room'}${futureText}`;
  }
  if (sumDep) sumDep.textContent = `LKR ${dep.toLocaleString()}`;
  if (sumRent) sumRent.textContent = `LKR ${rent.toLocaleString()}`;
  if (sumAdv) sumAdv.textContent = `LKR ${adv.toLocaleString()}`;
  if (sumTotal) sumTotal.textContent = `LKR ${adv.toLocaleString()}`;
}

function toggleFutureVacancyFields(prefix) {
  const mode = document.getElementById(`${prefix}-available`)?.value;
  const wrap = document.getElementById(`${prefix}-future-wrap`);
  if (wrap) wrap.style.display = mode === 'future' ? 'block' : 'none';
}

async function loadHomeListings() {
  if (!allListings.length) await fetchListings();
  const grid = document.getElementById('home-listings-grid');
  if (!grid) return;
  const available = allListings.filter(l => l.available || isFutureVacancy(l)).slice(0, 6);
  if (!available.length) {
    grid.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:40px;grid-column:1/-1;">No listings yet. Be the first to add one!</p>';
    return;
  }
  grid.innerHTML = available.map(l => homeCardHTML(l)).join('');
}

function homeCardHTML(l) {
  const saved = savedIds.has(l._id);
  const img   = firstImage(l);
  const meta  = availabilityMeta(l);
  return `
  <div class="boarding-card" onclick="openDetail('${l._id}')" style="cursor:pointer;">
    <div class="card-img" style="background:${gradFor(l._id)};">
      ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove()">` : `<div class="card-img-placeholder">${iconFor(l._id)}</div>`}
      <div class="card-badges">
        <span class="badge ${meta.badgeClass}">${meta.badgeText}</span>
        ${l.media&&l.media.length?`<span class="badge" style="background:rgba(0,0,0,.5);color:white;">📷 ${l.media.length}</span>`:''}
      </div>
      <button class="fav-btn ${saved?'active':''}" onclick="event.stopPropagation();toggleSave('${l._id}',this)">${saved?'♥':'♡'}</button>
    </div>
    <div class="card-body">
      <div class="card-title">${l.title}</div>
      <div class="card-location">📍 ${l.city}${l.roomType?' · 🛏 '+l.roomType:''}${l.boardingFor?' · '+l.boardingFor:''}</div>
      <div class="card-meta">
        <div class="card-price">LKR ${Number(l.price).toLocaleString()}<span>/mo</span></div>
        <div class="card-dist" ${l.available? 'style="background:#C0EDED;color:#065F46;"' : ''}>${meta.shortText}</div>
      </div>
      <div class="card-tags">${genderBadgeHTML(l.boardingFor)}${(l.amenities||[]).slice(0,4).map(a=>`<span class="tag">${a}</span>`).join('')}</div>
    </div>
  </div>`;
}

function resultCardHTML(l) {
  const saved = savedIds.has(l._id);
  const img   = firstImage(l);
  const meta  = availabilityMeta(l);
  return `
  <div class="result-card" onclick="openDetail('${l._id}')" style="cursor:pointer;">
    <div class="result-img" style="background:${gradFor(l._id)};overflow:hidden;">
      ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove()">` : `<div class="result-img-placeholder">${iconFor(l._id)}</div>`}
    </div>
    <div class="result-body">
      <div>
        <div class="result-header">
          <div>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
              <span class="badge ${meta.badgeClass}">${meta.badgeText}</span>
              ${l.roomType?`<span class="badge" style="background:var(--gray-100);color:var(--gray-600);">🛏 ${l.roomType}</span>`:''}
              ${genderBadgeHTML(l.boardingFor)}
              ${l.media&&l.media.length?`<span class="badge" style="background:var(--gray-100);color:var(--gray-600);">📷 ${l.media.length} photos</span>`:''}
            </div>
            <div class="result-title">${l.title}</div>
          </div>
          <div class="result-price">LKR ${Number(l.price).toLocaleString()}<br><small>/month</small></div>
        </div>
        <div class="result-loc">📍 ${l.city}</div>
        <div class="result-tags">${(l.amenities||[]).slice(0,5).map(a=>`<span class="tag">${a}</span>`).join('')}</div>
      </div>
      <div class="result-footer">
        <div style="font-size:13px;color:var(--gray-400);">${meta.footerText}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();toggleSave('${l._id}',this)" id="save-res-${l._id}">${saved?'♥ Saved':'♡ Save'}</button>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openDetail('${l._id}')">View Details</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Save / favourite 
function toggleSave(id, btn) {
  id = id || currentListing?._id;
  if (!id) return;
  if (!isLoggedIn()) {
    showToast('Please sign in to save boarding places', 'warning');
    showPage('login');
    return;
  }
  if (savedIds.has(id)) {
    savedIds.delete(id);
    if (btn) { btn.textContent = btn.classList.contains('fav-btn')?'♡':'♡ Save'; btn.classList.remove('active'); }
  } else {
    savedIds.add(id);
    if (btn) { btn.textContent = btn.classList.contains('fav-btn')?'♥':'♥ Saved'; btn.classList.add('active'); }
  }
  persistSavedIds();
  // If saved page is currently open, refresh it
  const savedPage = document.getElementById('page-saved');
  if (savedPage && savedPage.classList.contains('active')) loadSavedPage();
}

// ── Home search 
function doHomeSearch() {
  const price  = document.getElementById('home-price')?.value || '';
  const room   = document.getElementById('home-room')?.value || '';
  const gender = document.getElementById('home-gender')?.value || '';
  const future = document.getElementById('home-future')?.value || '';

  const priceEl  = document.getElementById('search-price');
  const roomEl   = document.getElementById('search-room');
  const genderEl = document.getElementById('search-gender');
  const futureEl = document.getElementById('search-future');
  if (priceEl)  priceEl.value  = price;
  if (roomEl)   roomEl.value   = room;
  if (genderEl) genderEl.value = gender;
  if (futureEl) futureEl.value = future;

  const roomRadio = document.querySelector(`input[name="room"][value="${room}"]`) || document.querySelector('input[name="room"][value=""]');
  const genderRadio = document.querySelector(`input[name="gender"][value="${gender}"]`) || document.querySelector('input[name="gender"][value=""]');
  const futureRadio = document.querySelector(`input[name="future"][value="${future}"]`) || document.querySelector('input[name="future"][value=""]');
  if (roomRadio) roomRadio.checked = true;
  if (genderRadio) genderRadio.checked = true;
  if (futureRadio) futureRadio.checked = true;

  showPage('results');
  applyFilters();
}
function quickFilter(type) {
  resetFilters(true);
  if (type==='available') { const r=document.querySelector('input[name="avail"][value="now"]');    if(r) r.checked=true; }
  if (type==='future')    { const r=document.querySelector('input[name="avail"][value="future"]'); if(r) r.checked=true; }
  showPage('results');
}
function resetFilters(silent) {
  ['search-city','search-price','search-room','search-gender','search-future'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const fp = document.getElementById('filter-price');
  if (fp) { fp.value=60000; const d=document.getElementById('price-display'); if(d) d.textContent='Any Price'; }
  document.querySelectorAll('input[name="avail"]').forEach(r => r.checked = r.value==='');
  document.querySelectorAll('input[name="room"]').forEach(r  => r.checked = r.value==='');
  document.querySelectorAll('input[name="gender"]').forEach(r => r.checked = r.value==='');
  document.querySelectorAll('input[name="future"]').forEach(r => r.checked = r.value==='');
  document.querySelectorAll('#facilities-filter input').forEach(c => c.checked=false);
  if (!silent) applyFilters();
}

async function applyFilters() {
  if (!allListings.length) await fetchListings();
  const city      = (document.getElementById('search-city')?.value||'').trim().toLowerCase();

  // Slider upper bound
  const sliderMax = parseInt(document.getElementById('filter-price')?.value)||60000;

  // Dropdown: encode as "min:max" so ranges work correctly
  // "15000" = under 15k (0–15000), "25000" = 15k–25k, "40000" = 25k–40k, "" = any
  const dropVal   = document.getElementById('search-price')?.value || '';
  let dropMin = 0, dropMax = 60000;
  if (dropVal === '15000') { dropMin = 0;     dropMax = 15000; }
  if (dropVal === '25000') { dropMin = 15001; dropMax = 25000; }
  if (dropVal === '40000') { dropMin = 25001; dropMax = 40000; }
  if (dropVal === '40001') { dropMin = 40001; dropMax = Number.MAX_SAFE_INTEGER; }

  // Effective price window = intersection of slider and dropdown
  const priceMin = dropVal ? dropMin : 0;
  const priceMax = dropVal ? Math.min(dropMax, sliderMax) : sliderMax;

  const roomSel   = document.getElementById('search-room')?.value || document.querySelector('input[name="room"]:checked')?.value || '';
  const genderSel = document.getElementById('search-gender')?.value || document.querySelector('input[name="gender"]:checked')?.value || '';
  const futureSel = document.getElementById('search-future')?.value || document.querySelector('input[name="future"]:checked')?.value || '';
  const availSel  = document.querySelector('input[name="avail"]:checked')?.value||'';
  const amenReq  = [...document.querySelectorAll('#facilities-filter input:checked')].map(c=>c.value.toLowerCase());
  const sort     = document.getElementById('sort-select')?.value||'newest';

  let filtered = allListings.filter(l => {
    if (isBookedListing(l)) return false;
    if (city && !l.city.toLowerCase().includes(city) && !l.title.toLowerCase().includes(city)) return false;
   
    if (l.price < priceMin || l.price > priceMax) return false;
    if (roomSel && l.roomType !== roomSel) return false;
    if (genderSel && l.boardingFor !== genderSel) return false;
    if (futureSel && Number(l.futureVacancyMonths || 0) !== Number(futureSel)) return false;
    if (availSel==='now'    && !l.available) return false;
    if (availSel==='future' && !isFutureVacancy(l)) return false;
    if (amenReq.length) {
      const lAm = (l.amenities||[]).map(a=>a.toLowerCase());
      if (!amenReq.every(req => lAm.some(a=>a.includes(req)))) return false;
    }
    return true;
  });
  if (sort==='price-asc')  filtered.sort((a,b)=>a.price-b.price);
  if (sort==='price-desc') filtered.sort((a,b)=>b.price-a.price);
  if (sort==='newest')     filtered.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

  const list  = document.getElementById('results-list');
  const count = document.getElementById('results-count');
  if (count) count.innerHTML = `<strong>${filtered.length} boarding${filtered.length!==1?'s':''}</strong> found near UoM`;
  if (list)  list.innerHTML  = filtered.length
    ? filtered.map(l=>resultCardHTML(l)).join('')
    : '<div style="grid-column:1/-1;text-align:center;padding:60px 24px;color:var(--gray-400);">😕 No listings match your filters. <a onclick="resetFilters()" style="color:var(--brand);cursor:pointer;font-weight:600;">Reset filters</a></div>';
}

// ── Gallery helpers 
function buildGallery(media) {
  const gallery = document.getElementById('detail-gallery');
  if (!gallery) return;

  lightboxMedia = [];

  if (!media || !media.length) {
    // Show default placeholder gallery
    gallery.innerHTML = `
      <div class="gallery-cell gallery-main" style="background:linear-gradient(135deg,#80DBD9,#5CCFCD);">🏘️</div>
      <div class="gallery-cell gallery-thumb" style="background:linear-gradient(135deg,#A8E6E5,#5CCFCD);">🛏️</div>
      <div class="gallery-cell gallery-thumb" style="background:linear-gradient(135deg,#80CECE,#018790);">🍳</div>
      <div class="gallery-cell gallery-thumb" style="background:linear-gradient(135deg,#4ABFBE,#005461);">🚿</div>
      <div class="gallery-cell gallery-thumb has-more" style="background:linear-gradient(135deg,#A8E6E5,#66CFCE);">🏡</div>`;
    return;
  }

  const baseUrl = API.replace('/api', '');
  
  function resolveUrl(url) { return url.startsWith('http') ? url : baseUrl + url; }

  media.forEach(m => {
    lightboxMedia.push({ url: resolveUrl(m.url), isVideo: m.type === 'video' });
  });

  const cells = media.slice(0, 5).map((m, i) => {
    const url     = resolveUrl(m.url);
    const isVideo = m.type === 'video';
    const isMain  = i === 0;
    const hasMore = i === 4 && media.length > 5;
    const extra   = hasMore ? `<div class="gallery-cell-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.5);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;">+${media.length-4} more</div>` : '';
    return `
      <div class="gallery-cell ${isMain?'gallery-main':'gallery-thumb'}" style="cursor:pointer;position:relative;" onclick="openLightbox(${i})">
        ${isVideo
          ? `<video src="${url}" muted style="width:100%;height:100%;object-fit:cover;"></video><div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.6);color:white;padding:3px 8px;border-radius:6px;font-size:11px;">▶ Video</div>`
          : `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`}
        ${extra}
      </div>`;
  });

  // Fill to 5 cells if fewer media items
  while (cells.length < 5) {
    const placeholders = ['linear-gradient(135deg,#A8E6E5,#5CCFCD)','linear-gradient(135deg,#80CECE,#018790)','linear-gradient(135deg,#4ABFBE,#005461)','linear-gradient(135deg,#A8E6E5,#66CFCE)'];
    const emojis = ['🛏️','🍳','🚿','🏡'];
    const idx = cells.length - 1;
    cells.push(`<div class="gallery-cell gallery-thumb" style="background:${placeholders[idx%4]};">${emojis[idx%4]}</div>`);
  }

  gallery.innerHTML = cells.join('');
}

// ── Lightbox 
let _lbTouchStartX = 0;

function openLightbox(index) {
  if (!lightboxMedia.length) return;
  lightboxIndex = index;
  renderLightbox();
  const lb = document.getElementById('gallery-lightbox');
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
 
  lb.addEventListener('touchstart', _lbTouchStart, { passive: true });
  lb.addEventListener('touchend',   _lbTouchEnd,   { passive: true });
}
function _lbTouchStart(e) { _lbTouchStartX = e.changedTouches[0].screenX; }
function _lbTouchEnd(e) {
  const dx = e.changedTouches[0].screenX - _lbTouchStartX;
  if (Math.abs(dx) > 50) lightboxNav(dx < 0 ? 1 : -1);
}
function closeLightbox() {
  const lb = document.getElementById('gallery-lightbox');
  lb.style.display = 'none';
  lb.removeEventListener('touchstart', _lbTouchStart);
  lb.removeEventListener('touchend',   _lbTouchEnd);
  document.body.style.overflow = '';
  // Pause any playing video
  const vid = lb.querySelector('video');
  if (vid) vid.pause();
}
function handleLightboxClick(e) {
  // Click backdrop (not content/buttons) to close
  if (e.target === document.getElementById('gallery-lightbox')) closeLightbox();
}
function lightboxNav(dir) {
  if (!lightboxMedia.length) return;
  lightboxIndex = (lightboxIndex + dir + lightboxMedia.length) % lightboxMedia.length;
  renderLightbox();
}
function renderLightbox() {
  const item    = lightboxMedia[lightboxIndex];
  const content = document.getElementById('lightbox-content');
  const counter = document.getElementById('lightbox-counter');
  if (!content) return;
  content.innerHTML = item.isVideo
    ? `<video src="${item.url}" controls autoplay style="max-width:90vw;max-height:85vh;border-radius:var(--radius-md);"></video>`
    : `<img src="${item.url}" style="max-width:90vw;max-height:85vh;border-radius:var(--radius-md);object-fit:contain;">`;
  if (counter) counter.textContent = `${lightboxIndex + 1} / ${lightboxMedia.length}`;
}
// Keyboard nav for lightbox
document.addEventListener('keydown', e => {
  const lb = document.getElementById('gallery-lightbox');
  if (!lb || lb.style.display==='none') return;
  if (e.key==='Escape')      closeLightbox();
  if (e.key==='ArrowRight')  lightboxNav(1);
  if (e.key==='ArrowLeft')   lightboxNav(-1);
});

// ── Detail page
async function renderCurrentDetailPage() {
  const listing = await ensureCurrentListingLoaded();
  if (!listing) { showToast('Could not load listing details', 'error'); return; }
  persistCurrentListing(listing);
  const l = currentListing;

    // Gallery with real media
    buildGallery(l.media);

    // Title + breadcrumb
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = l.title;
    document.querySelectorAll('.breadcrumb span:last-child').forEach(s => { if(s.closest('#page-detail')) s.textContent = l.title; });

    // Meta
    const cityEl   = document.getElementById('detail-city');
    const distEl   = document.getElementById('detail-dist');
    const ratingEl = document.getElementById('detail-rating');
    if (cityEl)   cityEl.innerHTML   = `📍 ${l.city}`;
    if (distEl)   distEl.innerHTML   = `🛏 ${l.roomType||'Room'}${l.boardingFor ? ' · 🚻 '+l.boardingFor : ''} · LKR ${Number(l.price).toLocaleString()}/mo`;
    if (ratingEl) ratingEl.innerHTML = `<span class="rating-stars">★★★★☆</span> Loading...`;

    // Description
    const descEl = document.querySelector('#page-detail .detail-content > p');
    if (descEl) descEl.textContent = l.description || 'A comfortable boarding place near campus with great facilities.';

    // Badges
    const badgesDiv = document.querySelector('#page-detail .detail-content .badge:first-of-type')?.parentElement;
    if (badgesDiv) {
      badgesDiv.innerHTML = `
        <span class="badge ${l.available?'badge-available':'badge-soon'}" style="font-size:12px;padding:5px 12px">${l.available?'✓ Available Now':'🕐 Coming Soon'}</span>
        ${l.roomType?`<span class="badge" style="background:var(--gray-100);color:var(--gray-600);font-size:12px;padding:5px 12px">🛏 ${l.roomType}</span>`:''}
        ${genderBadgeHTML(l.boardingFor, 'font-size:12px;padding:5px 12px')}
        ${l.media&&l.media.length?`<span class="badge" style="background:var(--gray-100);color:var(--gray-600);font-size:12px;padding:5px 12px">📷 ${l.media.length} photos</span>`:''}`;
    }

    // Amenities
    const facGrid     = document.querySelector('#page-detail .facilities-grid');
    const facSection  = document.querySelector('#page-detail .facilities-grid')?.closest('div.divider + div') || null;
    const facHeading  = document.querySelector('#page-detail h3.fac-heading');

    if (facGrid) {
      const validAmenities = (l.amenities || []).filter(a => a && a.trim());
      if (validAmenities.length) {
        const em = {WiFi:'📶',Kitchen:'🍳',Parking:'🚗',Laundry:'🧺',Security:'🛡️',AC:'❄️',Meals:'🍽','TV Room':'📺',Garden:'🌿'};
        facGrid.innerHTML = validAmenities.map(a => {
          const icon = em[a] ? `<span class="facility-icon">${em[a]}</span> ` : '';
          return `<div class="facility-chip">${icon}${a}</div>`;
        }).join('');
        // Show the heading + grid
        const h = document.querySelector('#page-detail .fac-heading');
        if (h) h.style.display = '';
        facGrid.style.display = '';
      } else {

        // Hide heading and grid when no amenities
        const h = document.querySelector('#page-detail .fac-heading');
        if (h) h.style.display = 'none';
        facGrid.style.display = 'none';
        facGrid.innerHTML = '';
      }
    }


    // House Rules — show only if owner set them   
    const rulesSection = document.getElementById('detail-rules-section');
    const rulesGrid    = document.getElementById('detail-rules-grid');
    if (rulesSection && rulesGrid) {
      if (l.rules && l.rules.length) {
        rulesGrid.innerHTML = l.rules.map(r => `<div>✅ ${r}</div>`).join('');
        rulesSection.style.display = '';
      } else {
        rulesSection.style.display = 'none';
      }
    }

    // Room type card   
    const roomGrid = document.querySelector('#page-detail .room-types-grid');
    if (roomGrid) {
      roomGrid.innerHTML = `
        <div class="room-type-card selected" onclick="selectRoom(this)">
          <div class="type-icon">🛏️</div>
          <div class="type-name">${l.roomType||'Room'}</div>
          <div class="type-price">LKR ${Number(l.price).toLocaleString()}</div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:2px;">${l.available?'Available':'Unavailable'}</div>
        </div>`;
    }

    // Booking panel  
    const priceBig   = document.querySelector('#page-detail .price-big');
    const priceSub   = document.querySelector('#page-detail .price-sub');
    const availBadge = document.querySelector('#page-detail .avail-badge');
    if (priceBig) priceBig.textContent = `LKR ${Number(l.price).toLocaleString()}`;
    if (priceSub) priceSub.textContent = `per month · ${l.roomType||'Room'}${l.boardingFor ? ' · '+l.boardingFor : ''} · Bills may vary`;

    if (availBadge) {
      const meta = availabilityMeta(l);
      availBadge.style.background = l.available ? '#D1FAE5' : '#FEF3C7';
      availBadge.style.color      = l.available ? '#065F46' : '#92400E';
      availBadge.innerHTML = l.available ? '<span class="dot"></span> Available Now' : meta.detailText;
    }

    // Booking panel price breakdown — use owner-set values if available
    const depositAmt = l.deposit  || l.price;   
    const advanceAmt = l.advance  || 5000;       
    const payToBook  = advanceAmt;

    const panelRent    = document.getElementById('panel-monthly-rent');
    const panelDep     = document.getElementById('panel-deposit');
    const panelAdv     = document.getElementById('panel-advance');
    const panelPay     = document.getElementById('panel-pay-to-book');
    if (panelRent) panelRent.textContent = `LKR ${Number(l.price).toLocaleString()}`;
    if (panelDep)  panelDep.textContent  = depositAmt ? `LKR ${Number(depositAmt).toLocaleString()}` : '—';
    if (panelAdv)  panelAdv.textContent  = advanceAmt ? `LKR ${Number(advanceAmt).toLocaleString()}` : '—';
    if (panelPay)  panelPay.textContent  = `LKR ${Number(payToBook).toLocaleString()}`;

    // Book Now button
    const bookBtn = document.getElementById('book-now-btn');
    if (bookBtn) {
      const canBook = l.available || isFutureVacancy(l);
      bookBtn.disabled    = !canBook;
      bookBtn.textContent = canBook ? (isFutureVacancy(l) ? '📅 Book Future Vacancy' : '🏠 Book Now') : '🚫 Not Available';
      bookBtn.style.opacity = canBook ? '1' : '0.5';
      bookBtn.style.cursor  = canBook ? 'pointer' : 'not-allowed';
    }

    // Owner details — keep inside the description section
    const ownerInline = document.getElementById('detail-owner-inline');
    if (ownerInline) {
      const ownerName = l.ownerName || l.owner?.name || 'Property Owner';
      const ownerSub  = l.ownerVerified ? '✅ Verified Owner' : 'Owner';
      ownerInline.innerHTML = `
        <div class="detail-owner-chip">
          <div class="detail-owner-avatar">🏠</div>
          <div>
            <div class="detail-owner-title">Owner Details</div>
            <div class="detail-owner-name">${ownerName}</div>
            <div class="detail-owner-sub">${ownerSub}</div>
          </div>
        </div>`;
    }


    // Save button
    const saveBtn = document.getElementById('detail-save-btn');
    if (saveBtn) saveBtn.textContent = savedIds.has(l._id)?'♥ Saved':'♡ Save';

    hydrateBookingPage(l);

    await loadReviewsPreview();
    reviewsOffset = 0;
}

async function openDetail(id) {
  if (id) {
    try { sessionStorage.setItem('currentListingId', id); } catch {}
  }
  await ensureCurrentListingLoaded(id);
  if (getCurrentPageId() === 'results') {
    await renderCurrentDetailPage();
    openSearchModal('detail');
    return;
  }
  navigateToPage('detail', { listingId: id || currentListing?._id || getCurrentListingId() });
}

// ── Reviews
function reviewCardHTML(r) {
  const name  = r.student?.name||'Anonymous';
  const init  = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const date  = new Date(r.createdAt).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  const stars = '★'.repeat(r.rating)+'☆'.repeat(5-r.rating);
  return `<div class="review-card" style="margin-top:14px;">
    <div class="review-header">
      <div class="reviewer-avatar">${init}</div>
      <div class="reviewer-info"><div class="name">${name}</div><div class="date">${date}</div></div>
      <div class="review-stars">${stars}</div>
    </div>
    <p class="review-text">"${r.comment||''}"</p>
  </div>`;
}
function reviewCardFullHTML(r) {
  const name  = r.student?.name||'Anonymous';
  const init  = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const date  = new Date(r.createdAt).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const stars = '★'.repeat(r.rating)+'☆'.repeat(5-r.rating);
  return `<div class="review-card-full">
    <div class="review-header">
      <div class="reviewer-avatar">${init}</div>
      <div class="reviewer-info"><div class="name">${name}</div><div class="date">${date}</div></div>
      <div class="review-stars" style="font-size:16px;">${stars}</div>
    </div>
    <p class="review-text" style="margin-bottom:10px;">"${r.comment||''}"</p>
  </div>`;
}

async function loadReviewsPreview() {
  if (!currentListing) return;
  const extra = document.getElementById('detail-reviews-extra');
  try {
    const res     = await fetch(`${API}/reviews/${currentListing._id}`);
    const reviews = await res.json();
    if (reviews.length) {
      const avg = (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1);
      const rEl = document.getElementById('detail-rating');
      if (rEl) rEl.innerHTML = `<span class="rating-stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</span> ${avg} (${reviews.length} reviews)`;
      if (extra) { extra.innerHTML = reviews.slice(0,3).map(r=>reviewCardHTML(r)).join(''); }
      const seeAll = document.querySelector('#page-detail .see-all');
      if (seeAll) seeAll.textContent = `All ${reviews.length} reviews →`;
    } else {
      const rEl = document.getElementById('detail-rating');
      if (rEl) rEl.innerHTML = `<span style="color:var(--gray-300);">☆☆☆☆☆</span> No ratings yet`;
      if (extra) extra.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">No reviews yet for this boarding. Be the first!</p>';
    }
  } catch {
    if (extra) extra.innerHTML = '';
  }
}



function setRating(val) {
  currentRating = val;
  document.querySelectorAll('#detail-stars span').forEach(s => {
    s.style.color = parseInt(s.dataset.val)<=val?'#F59E0B':'#D1D5DB';
  });
}

async function submitDetailReview() {
  if (!isLoggedIn()) { showToast('Please sign in to write a review','warning'); showPage('login'); return; }
  if (!currentListing) return;
  if (!currentRating)  { showToast('Please select a star rating','error'); return; }
  const comment = document.getElementById('detail-review-comment')?.value.trim();
  const msg     = document.getElementById('detail-review-msg');
  if (!comment) return showMsg(msg, '⚠️ Please write a comment.', 'error');
  try {
    const res  = await fetch(`${API}/reviews`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},
      body: JSON.stringify({ listing:currentListing._id, rating:currentRating, comment })
    });
    const data = await res.json();
    if (data.review) {
      showMsg(msg,'✅ Review submitted! Thank you 🙏','success');
      document.getElementById('detail-review-comment').value='';
      setRating(0);
      await loadReviewsPreview();
    } else { showMsg(msg,'❌ '+(data.error||'Could not submit'),'error'); }
  } catch { showMsg(document.getElementById('detail-review-msg'),'❌ Connection error','error'); }
}



async function loadReviewsPage() {
  if (!currentListing) return;
  const titleEl = document.getElementById('reviews-title');
  const subEl   = document.getElementById('reviews-sub');
  if (titleEl) titleEl.textContent = `Reviews — ${currentListing.title}`;
  if (subEl)   subEl.textContent   = `${currentListing.title} · ${currentListing.city}`;
  currentReviewsPageRating = 0;
  const writeMsg = document.getElementById('reviews-write-msg');
  if (writeMsg) writeMsg.style.display = 'none';
  const writeComment = document.getElementById('reviews-write-comment');
  if (writeComment) writeComment.value = '';
  if (document.getElementById('reviews-write-stars')) setReviewsPageRating(0);
  try {
    const res     = await fetch(`${API}/reviews/${currentListing._id}`);
    const reviews = await res.json();
    reviewsOffset = 0;
    const numEl   = document.getElementById('reviews-avg-num');
    const starsEl = document.getElementById('reviews-avg-stars');
    const cntEl   = document.getElementById('reviews-total-count');
    const list    = document.getElementById('reviews-dynamic-list');
    if (!reviews.length) {
      if (numEl)   numEl.textContent   = '—';
      if (starsEl) starsEl.textContent = '☆☆☆☆☆';
      if (cntEl)   cntEl.textContent   = '0 reviews';
      if (list)    list.innerHTML      = '<p style="color:var(--gray-400);text-align:center;padding:20px;">No reviews yet. Be the first!</p>';
      return;
    }
    const avg = reviews.reduce((s,r)=>s+r.rating,0)/reviews.length;
    if (numEl)   numEl.textContent   = avg.toFixed(1);
    if (starsEl) starsEl.textContent = '★'.repeat(Math.round(avg))+'☆'.repeat(5-Math.round(avg));
    if (cntEl)   cntEl.textContent   = `${reviews.length} reviews`;
    [1,2,3,4,5].forEach(n => {
      const cnt  = reviews.filter(r=>r.rating===n).length;
      const fill = document.querySelectorAll('#page-reviews .bar-fill')[5-n];
      const span = document.querySelectorAll('#page-reviews .rating-bar-row span:last-child')[5-n];
      if (fill) fill.style.width = (cnt/reviews.length*100)+'%';
      if (span) span.textContent = cnt;
    });
    if (list) { list.innerHTML = reviews.slice(0,10).map(r=>reviewCardFullHTML(r)).join(''); reviewsOffset=10; }
  } catch {}
}



function loadMoreReviews() {
  if (!currentListing) return;
  fetch(`${API}/reviews/${currentListing._id}`).then(r=>r.json()).then(reviews => {
    const list = document.getElementById('reviews-dynamic-list');
    if (!list) return;
    const more = reviews.slice(reviewsOffset, reviewsOffset+10);
    more.forEach(r => list.insertAdjacentHTML('beforeend',reviewCardFullHTML(r)));
    reviewsOffset += more.length;
    if (reviewsOffset>=reviews.length) showToast('All reviews loaded!','success');
  }).catch(()=>{});
}


// Write review from reviews page
function setReviewsPageRating(val) {
  currentReviewsPageRating = val;
  document.querySelectorAll('#reviews-write-stars span').forEach((s, idx) => {
    s.textContent = idx < val ? '★' : '☆';
    s.style.color = idx < val ? '#F59E0B' : '#9CA3AF';
  });
}

async function submitReviewsPageReview() {
  if (!isLoggedIn()) { showToast('Please sign in to write a review','warning'); showPage('login'); return; }
  if (!currentListing) await ensureCurrentListingLoaded();
  if (!currentListing) { showToast('Please select a listing first','error'); return; }
  if (!currentReviewsPageRating) { showToast('Please select a star rating','error'); return; }

  const textarea = document.getElementById('reviews-write-comment');
  const msg = document.getElementById('reviews-write-msg');
  const comment = textarea?.value?.trim();
  if (!comment) {
    if (msg) {
      msg.style.display = 'block';
      msg.style.background = 'rgba(239,68,68,.12)';
      msg.style.color = '#b91c1c';
      msg.textContent = 'Please write a short review.';
    }
    return;
  }

  try {
    const res = await fetch(`${API}/reviews`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+getToken()
      },
      body: JSON.stringify({
        listing: currentListing._id,
        rating: currentReviewsPageRating,
        comment
      })
    });
    const data = await res.json();
    if (data.review) {
      if (textarea) textarea.value = '';
      currentReviewsPageRating = 0;
      setReviewsPageRating(0);
      if (msg) {
        msg.style.display = 'block';
        msg.style.background = 'rgba(1,135,144,.12)';
        msg.style.color = '#0f766e';
        msg.textContent = 'Review submitted successfully.';
      }
      await loadReviewsPage();
      await loadReviewsPreview();
    } else {
      if (msg) {
        msg.style.display = 'block';
        msg.style.background = 'rgba(239,68,68,.12)';
        msg.style.color = '#b91c1c';
        msg.textContent = data.error || 'Could not submit review.';
      }
    }
  } catch {
    if (msg) {
      msg.style.display = 'block';
      msg.style.background = 'rgba(239,68,68,.12)';
      msg.style.color = '#b91c1c';
      msg.textContent = 'Connection error.';
    }
  }
}

// ── Booking 

function goToBooking() {
  if (!isLoggedIn()) { showToast('Please sign in to make a booking','warning'); showPage('login'); return; }
  const listing = currentListing || restoreCurrentListing();
  if (!listing) return;
  if (!(listing.available || isFutureVacancy(listing))) { showToast('This listing is currently unavailable','error'); return; }
  currentListing = listing;
  persistCurrentListing(listing);
  if (getCurrentPageId() === 'results') {
    hydrateBookingPage(listing);
    openSearchModal('booking');
    return;
  }
  navigateToPage('booking', { listingId: listing._id });
}

async function submitBooking() {
  if (!isLoggedIn()) { showToast('Please sign in first','warning'); showPage('login'); return; }
  if (!currentListing) { showToast('No listing selected','error'); return; }
  const fname    = document.getElementById('bk-fname')?.value.trim();
  const lname    = document.getElementById('bk-lname')?.value.trim();
  const email    = document.getElementById('bk-email')?.value.trim();
  const phone    = document.getElementById('bk-phone')?.value.trim();
  const date     = document.getElementById('bk-date')?.value;
  const duration = document.getElementById('bk-duration')?.value||'12 months';
  if (!fname||!lname||!email||!date) { showToast('Please fill in your name, email and move-in date','error'); return; }
  try {
    const res  = await fetch(`${API}/bookings`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},body:JSON.stringify({listing:currentListing._id,moveInDate:date,roomType:currentListing.roomType||'Room',duration,message:`${fname} ${lname} | ${email} | ${phone}`})});
    const data = await res.json();
    if (data.booking) {
      showToast('🎉 Booking submitted! Listing marked as booked.','success');
      currentListing.available = false;
      currentListing.futureVacancyMonths = 0;
      allListings = allListings.map(l => l._id===currentListing._id?{...l,available:false,futureVacancyMonths:0}:l);
      loadHomeListings();
      loadHomeStats();
      setTimeout(() => showPage('dashboard'), 2000);
    } else { showToast(data.error||'Booking failed','error'); }
  } catch { showToast('Connection error — is the server running?','error'); }
}


// ── File selection & preview 

function handleFileSelect(input, context) {
  const files = [...input.files];
  if (!files.length) return;
  if (context === 'al') {
    alSelectedFiles = [...alSelectedFiles, ...files].slice(0, 10);
    renderPreviewGrid('al-preview-grid', alSelectedFiles, 'al');
  } else {
    modalSelectedFiles = [...modalSelectedFiles, ...files].slice(0, 10);
    renderPreviewGrid('modal-preview-grid', modalSelectedFiles, 'modal');
  }
}

function handleDrop(event, context) {
  event.preventDefault();
  document.getElementById(context==='al'?'al-drop-zone':'modal-drop-zone').classList.remove('drag-over');
  const files = [...event.dataTransfer.files].filter(f => f.type.startsWith('image/')||f.type.startsWith('video/'));
  if (!files.length) { showToast('Please drop image or video files only','error'); return; }
  if (context === 'al') {
    alSelectedFiles = [...alSelectedFiles, ...files].slice(0, 10);
    renderPreviewGrid('al-preview-grid', alSelectedFiles, 'al');
  } else {
    modalSelectedFiles = [...modalSelectedFiles, ...files].slice(0, 10);
    renderPreviewGrid('modal-preview-grid', modalSelectedFiles, 'modal');
  }
}

function renderPreviewGrid(gridId, files, context) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!files.length) { grid.innerHTML=''; return; }
  grid.innerHTML = files.map((f, i) => {
    const isVideo = f.type.startsWith('video/');
    const url     = URL.createObjectURL(f);
    return `
      <div class="media-thumb">
        ${isVideo
          ? `<video src="${url}" muted style="width:100%;height:100%;object-fit:cover;"></video>`
          : `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`}
        <button class="remove-btn" onclick="removeFile(${i},'${context}')">✕</button>
        <span class="media-type-badge">${isVideo?'▶ VIDEO':'📷 IMG'}</span>
      </div>`;
  }).join('');
}

function removeFile(index, context) {
  if (context === 'al') {
    alSelectedFiles.splice(index, 1);
    renderPreviewGrid('al-preview-grid', alSelectedFiles, 'al');
  } else {
    modalSelectedFiles.splice(index, 1);
    renderPreviewGrid('modal-preview-grid', modalSelectedFiles, 'modal');
  }
}

// ── Upload files to backend 

async function uploadFilesForListing(listingId, files, progressId, barId) {
  if (!files.length) return true;
  const progressEl = document.getElementById(progressId);
  const barEl      = document.getElementById(barId);
  if (progressEl) progressEl.style.display = 'block';

  const formData = new FormData();
  files.forEach(f => formData.append('media', f));

  try {
    // Simulate progress
    let prog = 0;
    const progInterval = setInterval(() => {
      prog = Math.min(prog + 8, 85);
      if (barEl) barEl.style.width = prog + '%';
    }, 150);

    const res  = await fetch(`${API}/listings/${listingId}/media`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    clearInterval(progInterval);
    if (barEl) barEl.style.width = '100%';
    setTimeout(() => { if (progressEl) progressEl.style.display='none'; if (barEl) barEl.style.width='0%'; }, 800);

    const data = await res.json();
    if (data.listing) { allListings = allListings.map(l => l._id===data.listing._id?data.listing:l); return true; }
    showToast(data.error||'Upload failed', 'error'); return false;
  } catch {
    if (progressEl) progressEl.style.display='none';
    showToast('Upload failed — connection error', 'error'); return false;
  }
}

// ── Delete a media item 
async function deleteMedia(listingId, mediaIndex) {
  if (!confirm('Delete this photo/video?')) return;
  try {
    const res  = await fetch(`${API}/listings/${listingId}/media/${mediaIndex}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await res.json();
    if (data.listing) {
      allListings = allListings.map(l => l._id===data.listing._id?data.listing:l);
      showToast('Media deleted','success');
      renderExistingMedia(data.listing);
      // If on detail page for this listing, rebuild gallery
      if (currentListing && currentListing._id===listingId) {
        currentListing = data.listing;
        buildGallery(data.listing.media);
      }
    } else { showToast(data.error||'Delete failed','error'); }
  } catch { showToast('Connection error','error'); }
}


function toggleExclusiveCheckbox(clicked, selector) {
  if (!clicked.checked) return;
  document.querySelectorAll(selector).forEach(cb => {
    if (cb !== clicked) cb.checked = false;
  });
}

// ── Add Listing with media 

function goToAddListing() {
  if (!isLoggedIn()) { showPage('login'); return; }
  if (getUserRole() !== 'landlord') { showToast('Only owners can add listings. Sign up as an Owner.','warning'); return; }
  if (getCurrentPageId() !== 'dashboard') {
    navigateToPage('dashboard', { section: 'add' });
    return;
  }
  focusDashboardAddSection();
}

async function submitListing() {
  const token = getToken();
  const role  = getUserRole();
  const msg   = document.getElementById('al-msg');
  const warn  = document.getElementById('al-auth-warning');

  if (!token || role !== 'landlord') { if(warn) warn.style.display='block'; return; }
  if (warn) warn.style.display = 'none';

  const title       = document.getElementById('al-title')?.value.trim();
  const city        = document.getElementById('al-city')?.value.trim();
  const price       = Number(document.getElementById('al-price')?.value);
  const roomType    = document.querySelector('.al-roomtype:checked')?.value;
  const boardingFor = document.querySelector('.al-boardingfor:checked')?.value;
  const amenities   = [...document.querySelectorAll('.al-amenity:checked')].map(c => c.value);
  const description = document.getElementById('al-description')?.value.trim();
  const availabilityMode = document.getElementById('al-available')?.value || 'true';
  const available   = availabilityMode === 'true';
  const futureVacancyMonths = availabilityMode === 'future' ? Number(document.getElementById('al-future-months')?.value || 1) : 0;
  const deposit     = Number(document.getElementById('al-deposit')?.value) || 0;
  const advance     = Number(document.getElementById('al-advance')?.value) || 0;
  const rules       = [...document.querySelectorAll('.al-rule:checked')].map(c => c.value);

  if (!title||!city||!price) return showMsg(msg,'⚠️ Title, City and Price are required.','error');
  if (!roomType) return showMsg(msg,'⚠️ Please select Single Room or Shared Room.','error');
  if (!boardingFor) return showMsg(msg,'⚠️ Please select Ladies Only or Gents Only.','error');
  if (availabilityMode === 'future' && !futureVacancyMonths) return showMsg(msg,'⚠️ Please select future vacancy months.','error');
  showMsg(msg,'⏳ Creating listing...','info');

  try {
    const res  = await fetch(`${API}/listings`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({title,city,price,roomType,boardingFor,amenities,description,available,deposit,advance,rules,futureVacancyMonths})});
    const data = await res.json();
    if (!data.listing) return showMsg(msg,'❌ '+(data.error||'Failed to create listing.'),'error');

    const listingId = data.listing._id;

    // Upload media if any selected
    if (alSelectedFiles.length) {
      showMsg(msg,`⬆️ Uploading ${alSelectedFiles.length} file(s)...`,'info');
      const ok = await uploadFilesForListing(listingId, alSelectedFiles, 'al-upload-progress', 'al-progress-bar');
      if (!ok) return;
    }

    showMsg(msg,'✅ Listing added successfully!','success');
    ['al-title','al-city','al-price','al-description','al-deposit','al-advance'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.querySelectorAll('.al-amenity, .al-roomtype, .al-boardingfor, .al-rule').forEach(cb => cb.checked = false);
    alSelectedFiles = [];
    renderPreviewGrid('al-preview-grid', [], 'al');
    allListings = [];
    await fetchListings();
    setTimeout(() => { msg.style.display='none'; showPage('results'); }, 1500);
  } catch { showMsg(msg,'❌ Connection error.','error'); }
}

// ── Manage Media Modal (after listing) 

function openManageMedia(listingId, listingTitle) {
  modalListingId = listingId;
  modalSelectedFiles = [];
  renderPreviewGrid('modal-preview-grid', [], 'modal');
  const nameEl = document.getElementById('media-modal-listing-name');
  if (nameEl) nameEl.textContent = listingTitle;
  const input = document.getElementById('modal-media-input');
  if (input) input.value = '';
  const msgEl = document.getElementById('modal-upload-msg');
  if (msgEl) msgEl.style.display = 'none';

  // Load existing media

  const listing = allListings.find(l => l._id === listingId);
  if (listing) renderExistingMedia(listing);

  const modal = document.getElementById('media-modal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeMediaModal() {
  const modal = document.getElementById('media-modal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  modalSelectedFiles = [];
  modalListingId = null;
}

function renderExistingMedia(listing) {
  const container = document.getElementById('modal-existing-media');
  if (!container) return;
  const media = listing.media || [];
  if (!media.length) {
    container.innerHTML = '<p style="color:var(--gray-400);font-size:13px;grid-column:1/-1;">No media uploaded yet.</p>';
    return;
  }

  const baseUrl = API.replace('/api','');
  const resolveMediaUrl = (url) => url.startsWith('http') ? url : baseUrl + url;
  container.innerHTML = media.map((m, i) => {
    const url     = resolveMediaUrl(m.url);
    const isVideo = m.type === 'video';
    return `
      <div class="media-thumb">
        ${isVideo
          ? `<video src="${url}" muted style="width:100%;height:100%;object-fit:cover;"></video>`
          : `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`}
        <button class="remove-btn" onclick="deleteMedia('${listing._id}',${i})" title="Delete">✕</button>
        <span class="media-type-badge">${isVideo?'▶ VIDEO':'📷 IMG'}</span>
      </div>`;
  }).join('');
}


async function uploadModalMedia() {
  if (!modalListingId) return;
  if (!modalSelectedFiles.length) { showToast('Please select files to upload first','error'); return; }
  const msgEl = document.getElementById('modal-upload-msg');
  showMsg(msgEl, `⬆️ Uploading ${modalSelectedFiles.length} file(s)...`, 'info');
  const ok = await uploadFilesForListing(modalListingId, modalSelectedFiles, 'modal-upload-progress', 'modal-progress-bar');
  if (ok) {
    showMsg(msgEl, `✅ ${modalSelectedFiles.length} file(s) uploaded successfully!`, 'success');
    modalSelectedFiles = [];
    renderPreviewGrid('modal-preview-grid', [], 'modal');
    const input = document.getElementById('modal-media-input');
    if (input) input.value = '';
    // Refresh existing media display


    await fetchListings();
    const updated = allListings.find(l => l._id === modalListingId);
    if (updated) renderExistingMedia(updated);

    // If detail page is open for this listing
    if (currentListing && currentListing._id === modalListingId) {
      currentListing = updated;
      buildGallery(updated?.media);
    }
    loadDashboard();
  }
}


function getListingOwnerId(listing) {
  if (!listing || !listing.owner) return '';
  if (typeof listing.owner === 'string') return listing.owner;
  if (typeof listing.owner === 'object') return String(listing.owner._id || listing.owner.id || '');
  return String(listing.owner || '');
}

// ── Dashboard 
async function loadDashboard() {
  const name = localStorage.getItem('userName');
  const role = localStorage.getItem('userRole');
  const welcomeEl = document.getElementById('dash-welcome');
  if (welcomeEl) welcomeEl.textContent = name?`Welcome back, ${name} 👋`:'Welcome 👋';
  const roleEl = document.getElementById('dash-stat-role');
  if (roleEl) roleEl.textContent = role==='landlord'?'Owner':'Student';

  // ── Update dashboard title and header badge based on role 

  const dashTitle = document.querySelector('#page-dashboard .dashboard-header h1');
  const dashBadge = document.querySelector('#page-dashboard .dashboard-header .badge-verified');
  const addBtn    = document.querySelector('#page-dashboard .dashboard-header .btn-primary');
  if (dashTitle) dashTitle.textContent = role==='landlord' ? 'Owner Dashboard' : 'My Bookings Dashboard';
  if (dashBadge) {
    if (role === 'landlord') {
      dashBadge.style.display = 'none';
    } else {
      dashBadge.textContent = '🎓 Student Account';
      dashBadge.style.background = '#D1FAE5';
      dashBadge.style.color = '#065F46';
    }
  }
  // Hide "Add New Listing" button for students
  if (addBtn) addBtn.style.display = role==='landlord' ? '' : 'none';


  // ── Header actions 

  const headerActions = document.getElementById('dash-header-actions');
  if (headerActions && role === 'landlord') {
    headerActions.innerHTML = `<button class="btn btn-primary" onclick="goToAddListing()">+ Add New Listing</button>`;
  } else if (headerActions && role !== 'landlord') {
    headerActions.innerHTML = `<span class="badge" style="font-size:13px;padding:6px 14px;background:#C0EDED;color:#065F46;">🎓 Student Account</span>`;
  }

  // Update stat labels based on role

  const bookingsLabelEl = document.getElementById('dash-stat-bookings-label');
  if (bookingsLabelEl) bookingsLabelEl.textContent = 'Total Bookings';

  if (!isLoggedIn()) { showToast('Please sign in to view your dashboard','warning'); return; }

  if (!allListings.length) await fetchListings();
  const myUserId = localStorage.getItem('userId');
  const myListings = role === 'landlord'
    ? allListings.filter(l => getListingOwnerId(l) === myUserId)
    : [];
  const slEl = document.getElementById('dash-stat-listings');
  if (slEl) slEl.textContent = role==='landlord'?myListings.length:'—';

  const formArea = document.querySelector('#page-dashboard .listing-form');
  if (formArea && role==='landlord') {
    if (!myListings.length) {
      formArea.innerHTML = '<h3>🏠 My Listings</h3><p style="color:var(--gray-400);font-size:14px;margin-top:16px;">No listings yet. Click "+ Add New Listing" above!</p>';
    } else {
      formArea.innerHTML = `<h3>🏠 My Listings (${myListings.length})</h3><div style="display:flex;flex-direction:column;gap:12px;margin-top:16px;">
        ${myListings.map(l => {
          const img = firstImage(l);
          return `
          <div style="padding:14px;background:var(--gray-50);border-radius:var(--radius-md);border:1px solid var(--gray-200);">
            <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
              ${img?`<img src="${img}" style="width:60px;height:60px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0;" onerror="this.remove()">`:
                    `<div style="width:60px;height:60px;border-radius:var(--radius-sm);background:${gradFor(l._id)};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${iconFor(l._id)}</div>`}
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:15px;">${l.title}</div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">📍 ${l.city} · LKR ${Number(l.price).toLocaleString()}/mo · 🛏 ${l.roomType||'—'}${l.boardingFor ? ' · 🚻 '+l.boardingFor : ''}</div>
                <div style="font-size:12px;color:var(--gray-400);margin-top:2px;">📷 ${(l.media||[]).length} photo${(l.media||[]).length!==1?'s':''}</div>
                <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;"><span class="badge ${availabilityMeta(l).badgeClass}">${availabilityMeta(l).badgeText}</span>${genderBadgeHTML(l.boardingFor)}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
              <button onclick="openDetail('${l._id}')" class="btn btn-ghost btn-sm">👁 View</button>
              <button onclick="openEditListing('${l._id}')" class="btn btn-ghost btn-sm">✏️ Edit</button>
              <button onclick="openManageMedia('${l._id}','${l.title.replace(/'/g,"\\'")}')" class="btn btn-ghost btn-sm">📸 Media</button>
              <button onclick="toggleAvailability('${l._id}',${l.available},${Number('${l.futureVacancyMonths || 0}')})" class="btn btn-sm ${(l.available || isFutureVacancy(l))?'btn-outline':'btn-success'}">${(l.available || isFutureVacancy(l))?'🔒 Mark Booked':'✅ Mark Available'}</button>
              <button onclick="markListingComingSoon('${l._id}','${l.title.replace(/'/g,"\\'")}',${Number(l.futureVacancyMonths || 0)})" class="btn btn-ghost btn-sm">📅 Coming Soon</button>
              <button onclick="deleteListing('${l._id}','${l.title.replace(/'/g,"\\'")}')" class="btn btn-sm" style="background:#FEE2E2;color:#DC2626;border:1px solid #018790;">🗑 Delete</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }
  } else if (formArea && role!=='landlord') {
    formArea.innerHTML = '<h3>📋 My Activity</h3><p style="color:var(--gray-400);font-size:14px;margin-top:16px;">Switch to an Owner account to manage listings.</p>';
  }

  try {
    // Students fetch their own bookings; landlords fetch bookings ON their listings

    const bookingUrl = role === 'landlord'
      ? `${API}/bookings/landlord`
      : `${API}/bookings/user/me`;
    const res      = await fetch(bookingUrl, {headers:{'Authorization':'Bearer '+getToken()}});
    const bookings = await res.json();
    const activeBookings = Array.isArray(bookings) ? bookings.filter(b => isActivelyBookedListing(b.listing)) : [];
    const sbEl = document.getElementById('dash-stat-bookings');
    if (sbEl) sbEl.textContent = Array.isArray(bookings) ? activeBookings.length : '—';

    const bPanel = document.getElementById('dash-bookings-panel');
    if (bPanel && Array.isArray(bookings)) {
      bPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3>Bookings</h3>
          <a style="font-size:13px;color:var(--brand);cursor:pointer;font-weight:600;" onclick="openAllBookings()">View all</a>
        </div>`;
      if (!activeBookings.length) {
        bPanel.insertAdjacentHTML('beforeend','<p style="color:var(--gray-400);font-size:13px;padding:8px 0;">No active bookings yet.</p>');
      } else {
        const renderBookingItem = (b) => {
          const displayName = role === 'landlord'
            ? (b.student?.name || 'Student')
            : (b.listing?.title || 'Listing');
          const init = displayName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
          const date = b.moveInDate?new Date(b.moveInDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'—';
          const typeLabel = b.bookingType === 'future' ? `Future Vacancy${b.futureVacancyMonths ? ' · '+b.futureVacancyMonths+' mo' : ''}` : 'Available Vacancy';
          const sub  = role === 'landlord'
            ? `${b.listing?.title||'Listing'} · ${typeLabel} · ${date}`
            : `${b.roomType||'Room'} · ${typeLabel} · ${date}`;
          return `
            <div class="booking-item" style="cursor:pointer;" onclick="openAllBookings()">
              <div class="booking-avatar">${init}</div>
              <div class="booking-info">
                <div class="name">${displayName}</div>
                <div class="date">${sub}</div>
              </div>
              <div class="booking-status status-confirmed">${b.bookingType === 'future' ? 'Booked Future Vacancy' : 'Booked'}</div>
            </div>`;
        };


        if (role === 'landlord') {
          const futureBookings = activeBookings.filter(b => b.bookingType === 'future').slice(0,3);
          const regularBookings = activeBookings.filter(b => b.bookingType !== 'future').slice(0,3);
          if (futureBookings.length) {
            bPanel.insertAdjacentHTML('beforeend', '<div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin:6px 0 8px;">Booked Future Vacancies</div>');
            futureBookings.forEach(b => bPanel.insertAdjacentHTML('beforeend', renderBookingItem(b)));
          }
          if (regularBookings.length) {
            bPanel.insertAdjacentHTML('beforeend', '<div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 8px;">Booked Listings</div>');
            regularBookings.forEach(b => bPanel.insertAdjacentHTML('beforeend', renderBookingItem(b)));
          }
        } else {
          activeBookings.slice(0,5).forEach(b => bPanel.insertAdjacentHTML('beforeend', renderBookingItem(b)));
        }
      }
    }


    // Sidebar listings panel — owner only
    const lPanelWrap    = document.getElementById('dash-listings-panel');
    const lPanelContent = document.getElementById('dash-listings-sidebar-content');
    if (role === 'landlord' && lPanelWrap && lPanelContent) {
      lPanelWrap.style.display = '';
      if (!myListings.length) {
        lPanelContent.innerHTML = '<p style="color:var(--gray-400);font-size:13px;">No listings yet.</p>';
      } else {
        lPanelContent.innerHTML = myListings.map(l => `
          <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-md);border:1px solid var(--gray-200);margin-bottom:8px;cursor:pointer;" onclick="openDetail('${l._id}')">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-weight:600;font-size:14px;">${l.title}</div>
              <span class="badge ${availabilityMeta(l).badgeClass}">${availabilityMeta(l).detailText}</span>
            </div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">📍 ${l.city} · LKR ${Number(l.price).toLocaleString()}/mo</div>
            <div style="font-size:12px;color:var(--gray-400);margin-top:2px;">📷 ${(l.media||[]).length} photo${(l.media||[]).length!==1?'s':''}</div>
          </div>`).join('');
      }
    } else if (lPanelWrap) {
      lPanelWrap.style.display = 'none';
    }

  } catch(e) { console.log('Dashboard error:',e); }
}

// ── All Bookings Page 
let _allBookingsCache = [];

async function openAllBookings() {
  if (getCurrentPageId() !== 'allbookings') {
    navigateToPage('allbookings');
    return;
  }
  const role = localStorage.getItem('userRole');
  const titleEl    = document.getElementById('allbookings-title');
  const subtitleEl = document.getElementById('allbookings-subtitle');
  const bcEl       = document.getElementById('allbookings-breadcrumb');
  const listEl     = document.getElementById('allbookings-list');

  if (titleEl) titleEl.textContent    = role === 'landlord' ? 'Active Bookings on My Listings' : 'My Active Bookings';
  if (bcEl)   bcEl.textContent        = role === 'landlord' ? 'Active Bookings' : 'My Active Bookings';
  if (listEl) listEl.innerHTML        = '<div style="text-align:center;padding:40px;color:var(--gray-400);">Loading bookings...</div>';

  try {
    const url = role === 'landlord'
      ? `${API}/bookings/landlord`
      : `${API}/bookings/user/me`;
    const res      = await fetch(url, { headers:{ 'Authorization':'Bearer '+getToken() } });
    const bookings = await res.json();
    if (!Array.isArray(bookings)) throw new Error('Bad response');
    const activeBookings = bookings.filter(b => isActivelyBookedListing(b.listing));
    _allBookingsCache = activeBookings;
    const futureCount = activeBookings.filter(b => b.bookingType === 'future').length;
    const normalCount = activeBookings.length - futureCount;
    if (subtitleEl) subtitleEl.textContent = `${activeBookings.length} active booking${activeBookings.length!==1?'s':''} · ${normalCount} booked · ${futureCount} booked future vacancies`;
    renderAllBookings(activeBookings, role);
  } catch(e) {
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger);">Could not load bookings. Please try again.</div>';
  }
}

// filterAllBookings removed — no status filtering needed


function renderAllBookings(bookings, role) {
  const listEl = document.getElementById('allbookings-list');
  if (!listEl) return;
  if (!bookings.length) {
    listEl.innerHTML = `
      <div style="text-align:center;padding:60px 24px;">
        <div style="font-size:48px;margin-bottom:16px;">📋</div>
        <div style="font-size:16px;font-weight:600;color:var(--gray-700);margin-bottom:8px;">No active bookings found</div>
        <div style="font-size:14px;color:var(--gray-400);">No bookings match this filter.</div>
      </div>`;
    return;
  }

  listEl.innerHTML = bookings.map(b => {
    const date     = b.moveInDate ? new Date(b.moveInDate).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '—';
    const created  = b.createdAt  ? new Date(b.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';

    // Owner card: show student info + listing
        
    if (role === 'landlord') {
      const studentName  = b.student?.name  || 'Student';
      const studentEmail = b.student?.email || '';
      const init         = studentName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      return `
        <div style="background:white;border:1px solid var(--gray-200);border-radius:var(--radius-lg);padding:20px;margin-bottom:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="booking-avatar" style="width:44px;height:44px;font-size:15px;">${init}</div>
              <div>
                <div style="font-weight:700;font-size:15px;">${studentName}</div>
                <div style="font-size:12px;color:var(--gray-400);">${studentEmail}</div>
              </div>
            </div>
            <div class="booking-status status-confirmed" style="padding:5px 14px;font-size:12px;">${b.bookingType === 'future' ? 'Booked Future Vacancy' : 'Booked'}</div>
          </div>
          <div style="margin-top:14px;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);border:1px solid var(--gray-100);">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;">🏠 ${b.listing?.title||'Listing'}</div>
            <div style="font-size:13px;color:var(--gray-500);">📍 ${b.listing?.city||'—'} · LKR ${b.listing?.price?.toLocaleString()||'—'}/mo · 🛏 ${b.roomType||b.listing?.roomType||'—'} · ${b.bookingType === 'future' ? '📅 Future Vacancy' : '✅ Available Vacancy'}</div>
          </div>
          <div style="display:flex;gap:20px;margin-top:12px;font-size:13px;color:var(--gray-500);flex-wrap:wrap;">
            <span>📅 Move-in: <strong style="color:var(--gray-800);">${date}</strong></span>
            <span>🕐 Booked on: <strong style="color:var(--gray-800);">${created}</strong></span>
          </div>
          ${b.message ? `<div style="margin-top:10px;font-size:13px;color:var(--gray-600);background:var(--brand-light);padding:10px 14px;border-radius:var(--radius-sm);">💬 "${b.message}"</div>` : ''}
        </div>`;
    } else {
      // Student card: show listing info


      const init = (b.listing?.title||'L').slice(0,2).toUpperCase();
      return `
        <div style="background:white;border:1px solid var(--gray-200);border-radius:var(--radius-lg);padding:20px;margin-bottom:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:44px;height:44px;border-radius:50%;background:${gradFor(b.listing?._id||'0')};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${iconFor(b.listing?._id||'0')}</div>
              <div>
                <div style="font-weight:700;font-size:15px;">${b.listing?.title||'Listing'}</div>
                <div style="font-size:12px;color:var(--gray-400);">📍 ${b.listing?.city||'—'}</div>
              </div>
            </div>
            <div class="booking-status status-confirmed" style="padding:5px 14px;font-size:12px;">${b.bookingType === 'future' ? 'Booked Future Vacancy' : 'Booked'}</div>
          </div>
          <div style="margin-top:14px;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);border:1px solid var(--gray-100);">
            <div style="font-size:13px;color:var(--gray-600);">🛏 Room: <strong>${b.roomType||b.listing?.roomType||'—'}</strong> · 💰 LKR <strong>${b.listing?.price?.toLocaleString()||'—'}/mo</strong> · ${b.bookingType === 'future' ? '📅 Future Vacancy' : '✅ Available Vacancy'}</div>
          </div>
          <div style="display:flex;gap:20px;margin-top:12px;font-size:13px;color:var(--gray-500);flex-wrap:wrap;">
            <span>📅 Move-in: <strong style="color:var(--gray-800);">${date}</strong></span>
            <span>🕐 Booked on: <strong style="color:var(--gray-800);">${created}</strong></span>
          </div>
          <div style="margin-top:12px;">
            <button class="btn btn-ghost btn-sm" onclick="openDetail('${b.listing?._id}')">👁 View Listing</button>
          </div>
        </div>`;
    }
  }).join('');
}

// ── Edit Listing Modal 

let editListingId = null;

function openEditListing(id) {
  const listing = allListings.find(l => l._id === id);
  if (!listing) { showToast('Listing not found', 'error'); return; }
  editListingId = id;

  // Pre-fill all fields with current values
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('el-title',       listing.title);
  set('el-city',        listing.city);
  set('el-price',       listing.price);
  set('el-deposit',     listing.deposit || '');
  set('el-advance',     listing.advance || '');
  // Pre-check amenity boxes that match saved listing
  document.querySelectorAll('.el-amenity').forEach(cb => {
    cb.checked = (listing.amenities || []).includes(cb.value);
  });
  set('el-description', listing.description || '');

  // Room type
  document.querySelectorAll('.el-roomtype').forEach(cb => {
    cb.checked = cb.value === (listing.roomType || 'Single Room');
  });
  document.querySelectorAll('.el-boardingfor').forEach(cb => {
    cb.checked = cb.value === (listing.boardingFor || 'Ladies Only');
  });

  // Availability
  const avEl = document.getElementById('el-available');
  const futureEl = document.getElementById('el-future-months');
  if (futureEl) futureEl.value = String(listing.futureVacancyMonths || 1);
  if (avEl) avEl.value = listing.available ? 'true' : ((listing.futureVacancyMonths || 0) > 0 ? 'future' : 'false');
  toggleFutureVacancyFields('el');

  // House rules — check matching boxes
  document.querySelectorAll('.el-rule').forEach(cb => {
    cb.checked = (listing.rules || []).includes(cb.value);
  });

  // Header subtitle
  const titleDisplay = document.getElementById('edit-modal-title-display');
  if (titleDisplay) titleDisplay.textContent = listing.title;

  // Clear message
  const msgEl = document.getElementById('el-msg');
  if (msgEl) msgEl.style.display = 'none';

  // Show modal
  const modal = document.getElementById('edit-listing-modal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeEditModal() {
  const modal = document.getElementById('edit-listing-modal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  editListingId = null;
}

async function saveEditListing() {
  if (!editListingId) return;
  const msgEl = document.getElementById('el-msg');

  const title       = document.getElementById('el-title')?.value.trim();
  const city        = document.getElementById('el-city')?.value.trim();
  const price       = Number(document.getElementById('el-price')?.value);
  const roomType    = document.querySelector('.el-roomtype:checked')?.value;
  const boardingFor = document.querySelector('.el-boardingfor:checked')?.value;
  const availabilityMode = document.getElementById('el-available')?.value || 'true';
  const available   = availabilityMode === 'true';
  const futureVacancyMonths = availabilityMode === 'future' ? Number(document.getElementById('el-future-months')?.value || 1) : 0;
  const deposit     = Number(document.getElementById('el-deposit')?.value) || 0;
  const advance     = Number(document.getElementById('el-advance')?.value) || 0;
  const amenities   = [...document.querySelectorAll('.el-amenity:checked')].map(c => c.value);
  const description = document.getElementById('el-description')?.value.trim();
  const rules       = [...document.querySelectorAll('.el-rule:checked')].map(c => c.value);

  if (!title || !city || !price) {
    showMsg(msgEl, '⚠️ Title, City and Price are required.', 'error');
    return;
  }
  if (!roomType) {
    showMsg(msgEl, '⚠️ Please select Single Room or Shared Room.', 'error');
    return;
  }
  if (!boardingFor) {
    showMsg(msgEl, '⚠️ Please select Ladies Only or Gents Only.', 'error');
    return;
  }
  if (availabilityMode === 'future' && !futureVacancyMonths) {
    showMsg(msgEl, '⚠️ Please select future vacancy months.', 'error');
    return;
  }
  showMsg(msgEl, '⏳ Saving changes...', 'info');

  try {
    const res  = await fetch(`${API}/listings/${editListingId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body:    JSON.stringify({ title, city, price, roomType, boardingFor, available, futureVacancyMonths, deposit, advance, amenities, description, rules })
    });
    const data = await res.json();
    if (data.listing) {
      // Update local cache
      allListings = allListings.map(l => l._id === editListingId ? data.listing : l);
      // If this is the currently viewed listing, update it too
      if (currentListing && currentListing._id === editListingId) currentListing = data.listing;
      showMsg(msgEl, '✅ Changes saved successfully!', 'success');
      showToast(`✅ "${data.listing.title}" updated!`, 'success');
      setTimeout(() => { closeEditModal(); loadDashboard(); }, 900);
    } else {
      showMsg(msgEl, '❌ ' + (data.error || 'Could not save changes.'), 'error');
    }
  } catch {
    showMsg(msgEl, '❌ Connection error.', 'error');
  }
}

// ── Delete listing 

async function deleteListing(id, title) {
  if (!confirm(`Are you sure you want to permanently delete "${title}"?\n\nThis cannot be undone.`)) return;
  try {
    const res  = await fetch(`${API}/listings/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await res.json();
    if (data.message) {
      showToast(`🗑 "${title}" deleted successfully`, 'success');
      allListings = allListings.filter(l => l._id !== id);
      if (currentListing && currentListing._id === id) currentListing = null;
      loadDashboard();
      loadHomeListings();
      loadHomeStats();
    } else { showToast(data.error || 'Could not delete listing', 'error'); }
  } catch { showToast('Connection error', 'error'); }
}

// ── Toggle availability

async function toggleAvailability(id, currentlyAvailable, currentFutureMonths) {
  try {
    const makingAvailable = !currentlyAvailable && !Number(currentFutureMonths || 0);
    const payload = makingAvailable ? { available:true, futureVacancyMonths:0 } : { available:false, futureVacancyMonths:0 };
    const res  = await fetch(`${API}/listings/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},body:JSON.stringify(payload)});
    const data = await res.json();
    if (data.listing) {
      showToast((currentlyAvailable || Number(currentFutureMonths || 0))?'🔒 Marked as booked':'✅ Marked as available','success');
      allListings = allListings.map(l => l._id===id?{...l,...data.listing}:l);
      if (currentListing && currentListing._id === id) currentListing = { ...currentListing, ...data.listing };
      loadDashboard();
      loadHomeListings();
      loadHomeStats();
    } else { showToast('Could not update listing','error'); }
  } catch { showToast('Connection error','error'); }
}

async function markListingComingSoon(id, title, currentFutureMonths = 0) {
  const entered = prompt(`Set coming soon duration in months for "${title}" (1-12):`, currentFutureMonths || 1);
  if (entered === null) return;
  const months = Math.max(1, Math.min(12, parseInt(entered, 10) || 0));
  if (!months) { showToast('Please enter a valid month count between 1 and 12', 'error'); return; }
  try {
    const res = await fetch(`${API}/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + getToken() },
      body: JSON.stringify({ available:false, futureVacancyMonths:months })
    });
    const data = await res.json();
    if (data.listing) {
      showToast(`📅 Marked as coming soon for ${months} month${months === 1 ? '' : 's'}`, 'success');
      allListings = allListings.map(l => l._id === id ? { ...l, ...data.listing } : l);
      if (currentListing && currentListing._id === id) currentListing = { ...currentListing, ...data.listing };
      loadDashboard();
      loadHomeListings();
      loadHomeStats();
    } else {
      showToast(data.error || 'Could not update listing', 'error');
    }
  } catch {
    showToast('Connection error', 'error');
  }
}

// ── Home Stats (dynamic)

async function loadHomeStats() {
  try {
    if (!allListings.length) await fetchListings();

    // Active listings = visible listings that are still open to students
    const totalListings = allListings.filter(l => l.available || isFutureVacancy(l)).length;

    // Unique owners (unique owner IDs)
    const ownerSet = new Set(allListings.map(l => l.owner?.toString()).filter(Boolean));
    const totalOwners = ownerSet.size;

    // Students housed = total bookings (approximate: use allListings count × 2 as proxy,
    
    let studentsHoused = totalListings * 2;    
    try {
      const bRes = await fetch(`${API}/bookings`);
      if (bRes.ok) {
        const bookings = await bRes.json();
        if (Array.isArray(bookings)) studentsHoused = bookings.length;
      }
    } catch {}

    // Average rating across all reviews

    let avgRating = null;
    try {
      // Fetch reviews for all listings and compute global average
      const reviewPromises = allListings.slice(0, 20).map(l =>
        fetch(`${API}/reviews/${l._id}`).then(r => r.json()).catch(() => [])
      );
      const allReviews = (await Promise.all(reviewPromises)).flat();
      if (allReviews.length) {
        const sum = allReviews.reduce((s, r) => s + (r.rating || 0), 0);
        avgRating = (sum / allReviews.length).toFixed(1);
      }
    } catch {}

    // Update DOM

    const elListings = document.getElementById('home-stat-listings');
    const elStudents = document.getElementById('home-stat-students');
    const elOwners   = document.getElementById('home-stat-owners');
    const elRating   = document.getElementById('home-stat-rating');
    if (elListings) elListings.textContent = totalListings > 0 ? totalListings : '—';
    if (elStudents) elStudents.textContent = studentsHoused > 0 ? studentsHoused : '—';
    if (elOwners)   elOwners.textContent   = totalOwners > 0 ? totalOwners : '—';
    if (elRating)   elRating.textContent   = avgRating ? avgRating + '★' : '—';
  } catch {}
}

//  Saved / Favourites Page

async function loadSavedPage() {
  const grid     = document.getElementById('saved-grid');
  const subtitle = document.getElementById('saved-subtitle');
  if (!grid) return;

  if (!savedIds.size) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 24px;">
        <div style="font-size:48px;margin-bottom:16px;">💔</div>
        <div style="font-size:17px;font-weight:600;color:var(--gray-700);margin-bottom:8px;">No saved boardings yet</div>
        <div style="font-size:14px;color:var(--gray-400);margin-bottom:20px;">Click the ♡ heart on any boarding to save it here</div>
        <button class="btn btn-primary" onclick="showPage('results')">🔍 Browse Boardings</button>
      </div>`;
    if (subtitle) subtitle.textContent = 'Your favourite boarding places';
    return;
  }

  if (!allListings.length) await fetchListings();

  const saved = allListings.filter(l => savedIds.has(l._id));

  if (!saved.length) {
    // IDs in localStorage but listings may have been deleted
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 24px;">
        <div style="font-size:48px;margin-bottom:16px;">🏚️</div>
        <div style="font-size:17px;font-weight:600;color:var(--gray-700);margin-bottom:8px;">Saved listings no longer available</div>
        <button class="btn btn-primary" onclick="showPage('results')">🔍 Browse Boardings</button>
      </div>`;
    return;
  }

  if (subtitle) subtitle.textContent = `${saved.length} boarding${saved.length !== 1 ? 's' : ''} saved`;
  grid.innerHTML = saved.map(l => homeCardHTML(l)).join('');
}




// ── Init 
document.addEventListener('DOMContentLoaded', () => {
  initCurrentPage();
});

// ── Soft motion + glass reveal
(function () {
  const MOTION_SELECTOR = [
    'nav',
    '.hero > *',
    '.search-card',
    '.quick-feat',
    '.section-header',
    '.stat-item',
    '.boarding-card',
    '.result-card',
    '.dash-stat',
    '.listing-form',
    '.bookings-panel',
    '.review-card-full',
    '.auth-card',
    '.booking-form-section',
    '.payment-option',
    '.room-type-card',
    '.gallery-thumb',
    '.media-upload-area',
    '.owner-extras',
    '.dashboard-header',
    '.dashboard-grid > *',
    '.dash-main > *',
    '.cards-grid > *',
    '.results-layout > *',
    '.detail-layout > *',
    '.booking-layout > *',
    '.auth-container > *',
    'footer'
  ].join(',');

  let motionObserver;

  function prepareMotionNodes(root = document) {
    const nodes = root.matches && root.matches(MOTION_SELECTOR)
      ? [root, ...root.querySelectorAll(MOTION_SELECTOR)]
      : Array.from(root.querySelectorAll ? root.querySelectorAll(MOTION_SELECTOR) : []);

    const unique = [];
    nodes.forEach((node) => {
      if (!node || node.dataset.motionReady === '1') return;
      node.dataset.motionReady = '1';
      node.classList.add('motion-fade');
      unique.push(node);
    });
      

    unique.forEach((node, index) => {
      node.style.setProperty('--motion-delay', `${Math.min(index % 8, 7) * 55}ms`);
      if (motionObserver) motionObserver.observe(node);
    });
  }

  function initMotionObserver() {
    if (motionObserver) return;
    motionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          motionObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    });
  }

  function refreshMotion() {
    initMotionObserver();
    prepareMotionNodes(document);
  }

  function observeDynamicContent() {
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          prepareMotionNodes(node);
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initMotionObserver();
    refreshMotion();
    observeDynamicContent();
    setTimeout(refreshMotion, 120);
    setTimeout(refreshMotion, 500);
  });

  const waitForShowPage = setInterval(() => {
    if (typeof window.showPage === 'function') {
      clearInterval(waitForShowPage);
      const originalShowPage = window.showPage;
      window.showPage = function (...args) {
        const result = originalShowPage.apply(this, args);
        setTimeout(refreshMotion, 80);
        setTimeout(refreshMotion, 240);
        return result;
      };
    }
  }, 100);

  const waitForFilters = setInterval(() => {
    if (typeof window.applyFilters === 'function') {
      clearInterval(waitForFilters);
      const originalApplyFilters = window.applyFilters;
      window.applyFilters = function (...args) {
        const result = originalApplyFilters.apply(this, args);
        setTimeout(refreshMotion, 80);
        setTimeout(refreshMotion, 220);
        return result;
      };
    }
  }, 100);

  const waitForHomeLoad = setInterval(() => {
    if (typeof window.loadHomeListings === 'function') {
      clearInterval(waitForHomeLoad);
      const originalLoadHomeListings = window.loadHomeListings;
      window.loadHomeListings = async function (...args) {
        const result = await originalLoadHomeListings.apply(this, args);
        setTimeout(refreshMotion, 50);
        setTimeout(refreshMotion, 180);
        return result;
      };
    }
  }, 100);
})();