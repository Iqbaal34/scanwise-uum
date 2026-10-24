/* ============================================================
   QRPay Lab — app.js (Full Integrated Code)
   Includes:
     1) Feature 1: QR Payment Simulator (Integer sen math, strict validation, state machine)
     2) Upgraded "How Online Transactions Work" Explainer (6 plain-language stages,
        4 participant nodes, SVG packet + floating badge motion, live scene preview,
        3 outcome modes, keyboard/touch navigation, and autoplay)
     3) Upgraded Full-Screen Cinematic "How to Prevent Any Scams" Experience
     4) Full-Screen Phone Theater for QR Payment Challenge
   ============================================================ */

// ---------- Configuration (integer sen, never floats) ----------
const CONFIG = {
    MERCHANT: 'Kopi Corner Café',
    PRICE_SEN: 1150,          // RM 11.50 (Purchase receipt amount)
    QR_AMOUNT_SEN: 11500,     // RM 115.00 (Incorrect QR-displayed amount)
    BALANCE_SEN: 10000,       // RM 100.00 (Initial simulated wallet balance)
    MAX_INPUT_SEN: 99999999,  // RM 999,999.99 upper bound
};

// ---------- Feature 1 & Explainer State Machine ----------
const state = {
    step: 'intro',            // intro | scanning | review | editing | confirmation | processing | result | explainer
    paid: false,
    _scanning: false,
    editedSen: null,
    confirmedSen: null,
    _outcome: null,
    explainerStep: 0,
    txOutcomeMode: 'successful',
    txAutoplay: false,
    openedDirectExplainer: false,
    runId: 0,
};

const TRANSITIONS = {
    intro: ['scanning', 'explainer'],
    scanning: ['review'],
    review: ['editing', 'confirmation', 'intro'],
    editing: ['review'],
    confirmation: ['processing', 'review'],
    processing: ['result'],
    result: ['explainer', 'intro'],
    explainer: ['result', 'intro'],
};

function transition(to) {
    if (!(TRANSITIONS[state.step] || []).includes(to)) return false;
    state.step = to;
    return true;
}

// ---------- Money math: exact integer sen ----------
function toSen(senAmount) {
    return Math.trunc(Number(senAmount));
}

function formatSenNorm(sen) {
    const intSen = toSen(sen);
    const abs = Math.abs(intSen);
    const whole = String(Math.floor(abs / 100));
    const cents = String(abs % 100).padStart(2, '0');
    return intSen < 0 ? `-RM ${whole}.${cents}` : `RM ${whole}.${cents}`;
}

function formatSenPlain(sen) {
    const intSen = Math.abs(toSen(sen));
    const whole = String(Math.floor(intSen / 100));
    const cents = String(intSen % 100).padStart(2, '0');
    return `${whole}.${cents}`;
}

function calculateOutcome(paidSen, balanceSen) {
    const paid = toSen(paidSen);
    const diffFromReceipt = paid - CONFIG.PRICE_SEN;
    return {
        paid,
        remaining: balanceSen - paid,
        overpayment: Math.max(0, diffFromReceipt),
        underpayment: Math.max(0, -diffFromReceipt),
        discrepancy: Math.abs(diffFromReceipt),
        overBalance: paid > balanceSen,
    };
}

function parseAmountToSen(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;

    const match = /^([0-9]{1,6})(?:\.([0-9]{1,2}))?$/.exec(s);
    if (!match) return null;

    const whole = parseInt(match[1], 10);
    const centsStr = (match[2] || '').padEnd(2, '0');
    const cents = parseInt(centsStr, 10);

    const totalSen = whole * 100 + cents;
    if (!Number.isSafeInteger(totalSen) || totalSen <= 0 || totalSen > CONFIG.MAX_INPUT_SEN) {
        return null;
    }
    return totalSen;
}

// ---------- GSAP environment & Reusable Motion Architecture ----------
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hasGsap = typeof window.gsap !== 'undefined';
const hasST = hasGsap && typeof window.ScrollTrigger !== 'undefined';
if (hasST) gsap.registerPlugin(ScrollTrigger);
if (!hasGsap) document.documentElement.classList.add('no-gsap');

const MOTION = {
    micro: 0.16,
    std: 0.28,
    step: 0.45,
    packet: 0.6,
    cinema: 0.62,
    easeOut: 'power3.out',
    easeIn: 'power2.in',
    emphasis: 'back.out(1.4)',
    d: base => (REDUCED ? 0.01 : base),
};

const timelines = new Set();
function track(tl) {
    if (tl) timelines.add(tl);
    return tl;
}
function killTimelines() {
    timelines.forEach(t => {
        try { t.kill(); } catch (_) {}
    });
    timelines.clear();
}

const timers = new Set();
function later(fn, ms) {
    const expectedRun = state.runId;
    const id = setTimeout(() => {
        timers.delete(id);
        if (state.runId !== expectedRun) return;
        fn();
    }, ms);
    timers.add(id);
    return id;
}
function clearTimers() {
    timers.forEach(id => clearTimeout(id));
    timers.clear();
}

// Dynamic Navbar Height Sync
function syncNavbarHeight() {
    const nav = document.getElementById('site-nav');
    if (!nav) return;
    const h = Math.ceil(nav.getBoundingClientRect().height);
    if (h > 0) {
        document.documentElement.style.setProperty('--nav-h', `${h}px`);
    }
}
window.addEventListener('resize', syncNavbarHeight);
syncNavbarHeight();

// ---------- ARIA live announcements ----------
const live = document.createElement('div');
live.setAttribute('aria-live', 'polite');
live.setAttribute('role', 'status');
live.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
document.body.appendChild(live);
function announce(msg) {
    live.textContent = msg;
}

// ---------- Section navigation ----------
function showSection(name) {
    stopTxAutoplay();
    state.runId++;
    clearTimers();
    killTimelines();

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById(name);
    if (targetSection) targetSection.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.toggle('active', el.dataset.target === name);
    });

    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });

    if (name === 'landing') animateLanding();
    if (name === 'simulator') {
        resetGame();
        renderIntro();
        motionIntro();
    }
    if (name === 'scam-sim') {
        animateScamLaunchpad();
    }
    if (name === 'safety') animateSafety();
}

function startChallenge() {
    showSection('simulator');
}

function openExplainerDirect() {
    stopTxAutoplay();
    state.runId++;
    clearTimers();
    killTimelines();

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('simulator').classList.add('active');

    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const navExpBtn = document.getElementById('nav-explainer-btn');
    if (navExpBtn) navExpBtn.classList.add('active');

    state.step = 'intro';
    state.openedDirectExplainer = true;
    transition('explainer');
    state.explainerStep = 0;

    const returnBtn = document.getElementById('tx-return-result-btn');
    if (returnBtn) {
        returnBtn.textContent = '← PLAY QR SIMULATION';
    }

    showStage('explainer');
    initSvgPaths();
    renderExplainerStep(false);

    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('.tx-participant-node',
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.36), ease: MOTION.easeOut }
        ));
    }
}

function wireNav() {
    document.querySelectorAll('[data-target]').forEach(el => {
        el.addEventListener('click', e => {
            if (el.tagName === 'A') e.preventDefault();
            showSection(el.dataset.target);
        });
    });
}

function showStage(id) {
    killTimelines();
    document.querySelectorAll('.stage').forEach(st => st.classList.remove('active'));
    const el = document.getElementById('stage-' + id);
    if (el) el.classList.add('active');
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
}

// ============================================================
// LANDING & SAFETY MOTION
// ============================================================
function animateLanding() {
    if (REDUCED || !hasGsap) return;
    const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
    tl.fromTo('.section-landing .annotation-ring', { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: MOTION.d(0.34) }, 0)
      .fromTo('.section-landing .eyebrow', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: MOTION.d(0.36) }, 0.08)
      .fromTo('.section-landing .hero-title', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: MOTION.d(0.5) }, '-=0.18')
      .fromTo('.section-landing .hero-sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: MOTION.d(0.4) }, '-=0.28')
      .fromTo('.section-landing .hero-actions .btn', { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.35) }, '-=0.22')
      .fromTo('.hero-stats li', { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.05, duration: MOTION.d(0.32) }, '-=0.2')
      .fromTo('.hero-visual .phone', { opacity: 0, y: 34, rotate: -6 }, { opacity: 1, y: 0, rotate: -3.5, duration: MOTION.d(0.55), ease: 'power2.out' }, 0.15)
      .fromTo('.hero-visual .float-chip', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, stagger: 0.07, duration: MOTION.d(0.38) }, '-=0.3')
      .fromTo('.hero-caption', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: MOTION.d(0.32) }, '-=0.18');
}

let safetyBuilt = false;
function animateSafety() {
    if (REDUCED || !hasGsap) return;
    if (safetyBuilt && hasST) return;
    safetyBuilt = true;
    if (hasST) {
        gsap.from('.safety-card', {
            opacity: 0, y: 36, stagger: 0.08, duration: MOTION.d(0.5), ease: MOTION.easeOut,
            scrollTrigger: { trigger: '.safety-grid', start: 'top 84%', once: true },
        });
        gsap.from('.section-safety .section-title', {
            opacity: 0, y: 20, duration: MOTION.d(0.45), ease: MOTION.easeOut,
            scrollTrigger: { trigger: '#safety', start: 'top 80%', once: true },
        });
    } else {
        track(gsap.fromTo('.safety-card', { opacity: 0, y: 28 }, { opacity: 1, y: 0, stagger: 0.07, duration: MOTION.d(0.45) }));
    }
}

function initMagnetics() {
    if (!FINE_POINTER || REDUCED || !hasGsap) return;
    document.querySelectorAll('.magnetic').forEach(el => {
        el.addEventListener('pointermove', e => {
            const r = el.getBoundingClientRect();
            gsap.to(el, {
                x: gsap.utils.clamp(-5, 5, (e.clientX - r.left - r.width / 2) * 0.16),
                y: gsap.utils.clamp(-5, 5, (e.clientY - r.top - r.height / 2) * 0.16),
                duration: MOTION.d(0.25), ease: 'power2.out',
            });
        });
        el.addEventListener('pointerleave', () => {
            gsap.to(el, { x: 0, y: 0, duration: MOTION.d(0.35), ease: 'power2.out' });
        });
    });
}

// ============================================================
// FEATURE 1: QR PAYMENT SIMULATOR
// ============================================================
function renderIntro() {
    showStage('intro');
    const walletStrong = document.querySelector('.wallet-display strong');
    if (walletStrong) walletStrong.textContent = formatSenNorm(CONFIG.BALANCE_SEN);
    const scanBtn = document.getElementById('scan-trigger-btn');
    if (scanBtn) scanBtn.disabled = false;
    announce('Café scene. Pay for your coffee safely. Your simulated wallet balance is RM 100.00. The receipt shows RM 11.50.');
}

function motionIntro() {
    if (REDUCED || !hasGsap) return;
    track(gsap.fromTo('.cafe-board > *',
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, stagger: 0.05, duration: MOTION.d(0.4), ease: MOTION.easeOut }
    ));
}

function startScan() {
    if (state._scanning) return;
    if (!transition('scanning')) return;
    state._scanning = true;

    const scanBtn = document.getElementById('scan-trigger-btn');
    if (scanBtn) scanBtn.disabled = true;

    showStage('scanning');
    const statusEl = document.getElementById('scan-status');
    statusEl.textContent = 'SCANNING QR…';
    announce('Scanning QR code.');

    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('.scanner-frame',
            { opacity: 0, scale: 0.94 },
            { opacity: 1, scale: 1, duration: MOTION.d(0.35), ease: MOTION.easeOut }
        ));
    }

    const finish = () => {
        state._scanning = false;
        if (state.step !== 'scanning') return;
        statusEl.textContent = 'SCAN COMPLETE · MERCHANT + AMOUNT FOUND';
        if (!REDUCED && hasGsap) {
            track(gsap.fromTo('.scanner-frame',
                { scale: 1 },
                { scale: 1.025, duration: MOTION.d(0.18), yoyo: true, repeat: 1, ease: MOTION.easeIn }
            ));
        }
        later(openReview, REDUCED ? 50 : 360);
    };

    later(finish, REDUCED ? 80 : 1400);
}

function currentDisplaySen() {
    return state.editedSen === null ? CONFIG.QR_AMOUNT_SEN : state.editedSen;
}

function updateReviewVisuals(sen, syncInlineInput = true) {
    const ok = sen === CONFIG.PRICE_SEN;
    const diff = sen - CONFIG.PRICE_SEN;

    const amountEl = document.getElementById('payment-amount');
    const wrapEl = document.getElementById('amount-wrap');
    const labelEl = document.getElementById('amount-label');
    const flagEl = document.getElementById('amount-flag');
    const mismatchEl = document.getElementById('review-mismatch');
    const sidebarCurrent = document.getElementById('sidebar-current-amount');

    amountEl.textContent = formatSenNorm(sen);
    amountEl.classList.toggle('ok', ok);
    wrapEl.classList.toggle('ok', ok);

    labelEl.textContent = ok
        ? 'PAYMENT AMOUNT — VERIFIED MATCH'
        : (state.editedSen === null ? 'QR-DISPLAYED PAYMENT AMOUNT' : 'EDITED PAYMENT AMOUNT');

    flagEl.textContent = ok
        ? '✓ MATCHES RECEIPT (RM 11.50) — READY TO CONFIRM'
        : `SCREEN SAYS ${formatSenNorm(sen)} — RECEIPT SAYS ${formatSenNorm(CONFIG.PRICE_SEN)}`;
    flagEl.classList.toggle('ok', ok);

    if (sidebarCurrent) sidebarCurrent.textContent = formatSenNorm(sen);

    mismatchEl.hidden = ok;
    if (!ok) {
        const diffAbs = formatSenNorm(Math.abs(diff));
        mismatchEl.textContent = diff > 0
            ? `DISCREPANCY: +${diffAbs} OVER RECEIPT`
            : `DISCREPANCY: -${diffAbs} UNDER RECEIPT`;
    }

    document.getElementById('current-balance').textContent = formatSenNorm(CONFIG.BALANCE_SEN);

    if (syncInlineInput) {
        const inlineInput = document.getElementById('inline-amount-input');
        const inlineErr = document.getElementById('inline-amount-error');
        if (inlineInput) {
            inlineInput.value = formatSenPlain(sen);
            inlineInput.classList.remove('invalid');
        }
        if (inlineErr) inlineErr.hidden = true;
    }
}

function refreshReview() {
    updateReviewVisuals(currentDisplaySen(), true);
}

function applyReceiptAmount() {
    if (state.step !== 'review') return;
    state.editedSen = CONFIG.PRICE_SEN;
    refreshReview();
    announce('Amount updated to match receipt: RM 11.50.');
}

function openReview() {
    if (state.step === 'review') return;
    if (!transition('review')) return;
    refreshReview();
    showStage('review');
    announce(
        'Payment review screen for Kopi Corner Café. QR-displayed amount is ' +
        formatSenNorm(currentDisplaySen()) +
        '. Your purchase receipt is RM 11.50. Verify or edit the amount before confirming.'
    );

    if (REDUCED || !hasGsap) return;
    const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
    tl.fromTo('.phone-mockup', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: MOTION.d(0.42) })
      .fromTo('.amount-display', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: MOTION.d(0.32) }, '-=0.22')
      .fromTo('.merchant-info, .balance-info, .payment-actions', { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.05, duration: MOTION.d(0.28) }, '-=0.2')
      .fromTo('.receipt-reminder', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: MOTION.d(0.36) }, '-=0.24');
}

function backToCafe() {
    if (!transition('intro')) return;
    state.editedSen = null;
    state.confirmedSen = null;
    renderIntro();
    motionIntro();
}

function editAmount() {
    if (!transition('editing')) return;
    const input = document.getElementById('amount-input');
    const err = document.getElementById('amount-error');
    input.value = formatSenPlain(currentDisplaySen());
    err.hidden = true;
    input.classList.remove('invalid');

    showStage('editing');
    announce('Editing payment amount. Original purchase receipt total is RM 11.50.');
    later(() => input.focus(), 30);

    if (REDUCED || !hasGsap) return;
    track(gsap.fromTo('.edit-card',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: MOTION.d(0.32), ease: MOTION.easeOut }
    ));
}

function cancelEdit() {
    if (!transition('review')) return;
    refreshReview();
    showStage('review');
}

function saveAmount() {
    const input = document.getElementById('amount-input');
    const err = document.getElementById('amount-error');
    const sen = parseAmountToSen(input.value);

    if (sen === null) {
        input.classList.add('invalid');
        err.hidden = false;
        err.textContent = 'INVALID — ENTER A POSITIVE AMOUNT LIKE 11.50';
        announce('Invalid amount. Enter a positive value with up to two decimals, for example 11.50.');
        if (!REDUCED && hasGsap) {
            track(gsap.fromTo(input, { x: -5 }, { x: 0, duration: MOTION.d(0.22), ease: 'power1.out' }));
        }
        return false;
    }

    input.classList.remove('invalid');
    err.hidden = true;
    state.editedSen = sen;
    if (!transition('review')) return false;
    refreshReview();
    showStage('review');
    announce('Amount updated to ' + formatSenNorm(sen) + '.');
    return true;
}

function proceedToConfirmation() {
    if (state.step !== 'review') return;

    const inlineInput = document.getElementById('inline-amount-input');
    const inlineErr = document.getElementById('inline-amount-error');
    if (inlineInput) {
        const parsedInline = parseAmountToSen(inlineInput.value);
        if (parsedInline === null) {
            inlineInput.classList.add('invalid');
            if (inlineErr) {
                inlineErr.hidden = false;
                inlineErr.textContent = 'INVALID — ENTER A POSITIVE AMOUNT LIKE 11.50';
            }
            announce('Invalid payment amount. Please enter a valid Ringgit amount such as 11.50 before proceeding.');
            if (!REDUCED && hasGsap) {
                track(gsap.fromTo(inlineInput, { x: -5 }, { x: 0, duration: MOTION.d(0.22), ease: 'power1.out' }));
            }
            return;
        }
        if (parsedInline !== CONFIG.QR_AMOUNT_SEN || state.editedSen !== null) {
            state.editedSen = parsedInline;
        }
    }

    if (!transition('confirmation')) return;

    state.confirmedSen = currentDisplaySen();
    document.getElementById('confirm-amount').textContent = formatSenNorm(state.confirmedSen);

    const diff = state.confirmedSen - CONFIG.PRICE_SEN;
    const noteEl = document.getElementById('confirm-note');
    if (diff === 0) {
        noteEl.textContent = '✓ MATCHES RECEIPT — RM 11.50';
    } else if (diff > 0) {
        noteEl.textContent = `RECEIPT SAYS RM 11.50 · OVERPAYMENT DISCREPANCY OF ${formatSenNorm(diff)}`;
    } else {
        noteEl.textContent = `RECEIPT SAYS RM 11.50 · UNDERPAYMENT DISCREPANCY OF ${formatSenNorm(Math.abs(diff))}`;
    }

    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.disabled = false;

    showStage('confirmation');
    announce('Confirmation screen. You are about to pay ' + formatSenNorm(state.confirmedSen) + ' to Kopi Corner Café.');

    if (REDUCED || !hasGsap) return;
    const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
    tl.fromTo('.confirm-card', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: MOTION.d(0.36) })
      .fromTo('.confirm-amount', { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: MOTION.d(0.3) }, '-=0.18')
      .fromTo('.confirm-actions', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: MOTION.d(0.26) }, '-=0.16');
}

function backToReview() {
    if (!transition('review')) return;
    refreshReview();
    showStage('review');
}

function confirmPayment() {
    if (state.paid || state.step !== 'confirmation') return;
    if (!transition('processing')) return;
    state.paid = true;

    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.disabled = true;

    const outcome = calculateOutcome(state.confirmedSen, CONFIG.BALANCE_SEN);
    state._outcome = outcome;

    document.getElementById('processing-context').textContent =
        'SIMULATED TXN · KOPI CORNER CAFÉ · ' + formatSenNorm(outcome.paid);

    showStage('processing');
    announce('Processing simulated payment of ' + formatSenNorm(outcome.paid) + '.');

    later(() => {
        if (state.step !== 'processing') return;
        showResult(outcome);
    }, REDUCED ? 60 : 950);
}

function showResult(outcome) {
    if (!transition('result')) return;
    const isExactMatch = outcome.discrepancy === 0 && outcome.remaining >= 0 && !outcome.overBalance;

    const icon = document.getElementById('result-icon');
    icon.textContent = isExactMatch ? '✓' : '!';
    icon.classList.toggle('warning', !isExactMatch);
    icon.setAttribute('aria-label', isExactMatch ? 'Verified payment' : 'Payment discrepancy warning');

    const title = document.getElementById('result-title');
    const message = document.getElementById('result-message');
    const overRow = document.getElementById('overpayment-row');
    const overLabel = overRow.querySelector('span');

    document.getElementById('paid-amount').textContent = formatSenNorm(outcome.paid);
    document.getElementById('new-balance').textContent = formatSenNorm(outcome.remaining);

    if (outcome.discrepancy === 0) {
        overRow.hidden = true;
    } else {
        overRow.hidden = false;
        if (outcome.overpayment > 0) {
            overLabel.textContent = 'Overpayment vs. receipt';
            document.getElementById('overpayment-amount').textContent = formatSenNorm(outcome.overpayment);
        } else {
            overLabel.textContent = 'Underpayment vs. receipt';
            document.getElementById('overpayment-amount').textContent = formatSenNorm(outcome.underpayment);
        }
    }

    if (isExactMatch) {
        title.textContent = 'Payment successful — RM 11.50 verified';
        message.innerHTML =
            '<strong>✓ Correct amount paid (RM 11.50).</strong> You spotted that the QR code displayed RM 115.00 instead of the RM 11.50 receipt price and corrected it before confirming. ' +
            'Your simulated wallet balance is now <strong>RM 88.50</strong>, keeping the <strong>RM 103.50</strong> difference safe in your wallet.';
        message.classList.remove('warning');
        announce('Simulated payment successful. Paid RM 11.50. Remaining balance RM 88.50.');
    } else if (outcome.overpayment > 0) {
        title.textContent = 'Simulated payment completed — overpaid';
        message.innerHTML =
            '<strong>⚠ Discrepancy of ' + formatSenNorm(outcome.overpayment) + ' detected.</strong> ' +
            'You confirmed a payment of <strong>' + formatSenNorm(outcome.paid) + '</strong> for an <strong>RM 11.50</strong> purchase.' +
            (outcome.overBalance
                ? '<br><br><em>Fictional educational simulation note:</em> Your simulated balance moved to <strong>' +
                  formatSenNorm(outcome.remaining) +
                  '</strong> (RM 100.00 − ' + formatSenNorm(outcome.paid) + '). Real wallets generally enforce available-balance or payment authorization rules, subject to the provider\'s terms and linked payment methods.'
                : '') +
            '<br><br><strong>Why this matters:</strong> Always compare the QR-displayed amount against your physical or digital receipt before tapping confirm.';
        message.classList.add('warning');
        announce('Overpayment simulation result. You paid ' + formatSenNorm(outcome.paid) + ' for an RM 11.50 purchase. Discrepancy ' + formatSenNorm(outcome.overpayment) + '.');
    } else {
        title.textContent = 'Simulated payment mismatch — underpaid';
        message.innerHTML =
            '<strong>⚠ Amount did not match receipt.</strong> You confirmed <strong>' + formatSenNorm(outcome.paid) +
            '</strong>, which is <strong>' + formatSenNorm(outcome.underpayment) + '</strong> less than the RM 11.50 receipt total. ' +
            'In a real store, the merchant would ask you to settle the remaining balance. Always verify that the screen matches the exact receipt total (RM 11.50).';
        message.classList.add('warning');
        announce('Underpayment simulation result. You paid ' + formatSenNorm(outcome.paid) + ' instead of RM 11.50.');
    }

    showStage('result');
    if (REDUCED || !hasGsap) return;
    const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
    tl.fromTo('.result-card', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: MOTION.d(0.42) })
      .fromTo('.result-icon', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: MOTION.d(0.35), ease: MOTION.emphasis }, '-=0.22')
      .fromTo('.detail-row', { opacity: 0, y: 6 }, { opacity: 1, y: 0, stagger: 0.05, duration: MOTION.d(0.25) }, '-=0.18')
      .fromTo('.result-message, .result-actions', { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.28) }, '-=0.15');
}

function tryAgain() {
    stopTxAutoplay();
    if (!transition('intro')) {
        state.step = 'intro';
    }
    resetGame();
    renderIntro();
    motionIntro();
    announce('Simulation reset. Simulated wallet balance restored to RM 100.00.');
}

function resetGame() {
    stopTxAutoplay();
    state.runId++;
    clearTimers();
    killTimelines();

    state.editedSen = null;
    state.confirmedSen = null;
    state.paid = false;
    state._scanning = false;
    state._outcome = null;
    state.explainerStep = 0;
    state.openedDirectExplainer = false;
    state.step = 'intro';

    const input = document.getElementById('amount-input');
    if (input) {
        input.value = '115.00';
        input.classList.remove('invalid');
    }
    const err = document.getElementById('amount-error');
    if (err) err.hidden = true;

    const inlineInput = document.getElementById('inline-amount-input');
    if (inlineInput) {
        inlineInput.value = '115.00';
        inlineInput.classList.remove('invalid');
    }
    const inlineErr = document.getElementById('inline-amount-error');
    if (inlineErr) inlineErr.hidden = true;

    const scanBtn = document.getElementById('scan-trigger-btn');
    if (scanBtn) scanBtn.disabled = false;

    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.disabled = false;
}

// ============================================================
// UPGRADED FEATURE: HOW ONLINE TRANSACTIONS WORK
// 6 Simple Stages + 4 Clean Participant Nodes + Live Scene Preview
// ============================================================
const EXPLAINER_STEPS = [
    {
        opLabel: 'STEP 1 OF 6 · YOU START A PURCHASE',
        title: '1. You start a purchase',
        desc: 'You pick your coffee (RM 11.50) at Kopi Corner Café and proceed to checkout. Before paying, you check that the shop name and order total match what you asked for.',
        techNote: 'KEY HABIT: Always check the merchant name and RM amount before you pay.',
        activeNode: 0,
        completedNodes: [],
        reqProgress: 0.0,
        resProgress: 0.0,
        packetCoord: { x: 125, y: 72 },
        packetText: 'ORDER RM 11.50',
        previewChip: 'CHECKOUT SCREEN',
        previewAmount: 'RM 11.50',
        previewIcon: '☕',
        previewHeadline: 'Kopi Corner Café',
        previewSub: '1 × Coffee · Ready for checkout',
        legacyNodes: ['customer'],
    },
    {
        opLabel: 'STEP 2 OF 6 · YOU CHOOSE A PAYMENT METHOD',
        title: '2. You choose a payment method',
        desc: 'You select your preferred digital payment option (such as scanning the café’s QR code with your wallet app) and authorize the RM 11.50 request on your phone.',
        techNote: 'PLAIN LANGUAGE: Tapping "Confirm" sends a payment instruction—the money has not settled yet.',
        activeNode: 1,
        completedNodes: [0],
        reqProgress: 0.33,
        resProgress: 0.0,
        packetCoord: { x: 375, y: 72 },
        packetText: 'QR AUTH SENT →',
        previewChip: 'PAYMENT METHOD',
        previewAmount: 'RM 11.50',
        previewIcon: '📱',
        previewHeadline: 'Digital Wallet Selected',
        previewSub: 'Customer authorized RM 11.50 request',
        legacyNodes: ['customer', 'system'],
    },
    {
        opLabel: 'STEP 3 OF 6 · THE PAYMENT IS PROCESSED',
        title: '3. The payment is processed',
        desc: 'The payment service encrypts your payment details, runs security checks, and forwards the request through the relevant payment network toward your provider.',
        techNote: 'VARIATION NOTE: Different payment methods (QR, cards, bank transfers) route through different networks.',
        activeNode: 2,
        completedNodes: [0, 1],
        reqProgress: 0.67,
        resProgress: 0.0,
        packetCoord: { x: 625, y: 72 },
        packetText: 'ENCRYPTED →',
        previewChip: 'PAYMENT SERVICE',
        previewAmount: 'ENCRYPTED',
        previewIcon: '🛡️',
        previewHeadline: 'Routing & Security Check',
        previewSub: 'Forwarding request to provider safely',
        legacyNodes: ['system'],
    },
    {
        opLabel: 'STEP 4 OF 6 · BANK OR PROVIDER CHECKS IT',
        title: '4. The bank or payment provider checks it',
        desc: 'Your bank or wallet provider checks your account security and verifies whether your available balance can cover the RM 11.50 payment.',
        techNote: 'PROVIDER CHECK: Your provider decides whether to approve, decline, or hold the request.',
        activeNode: 3,
        completedNodes: [0, 1, 2],
        reqProgress: 1.0,
        resProgress: 0.0,
        packetCoord: { x: 875, y: 72 },
        packetText: 'CHECKING…',
        previewChip: 'PROVIDER CHECK',
        previewAmount: 'BALANCE: RM 100',
        previewIcon: '🏦',
        previewHeadline: 'Verifying Funds & Security',
        previewSub: 'Checking RM 11.50 against RM 100.00 balance',
        legacyNodes: ['system'],
    },
    {
        opLabel: 'STEP 5 OF 6 · THE RESULT COMES BACK',
        title: '5. The result comes back',
        desc: 'Your bank or payment provider sends an official response back through the payment service—indicating whether the payment is Successful, Declined, or Pending.',
        techNote: 'RETURN JOURNEY: Both your app and the payment service wait for this verified response.',
        activeNode: 2,
        completedNodes: [0, 1, 3],
        reqProgress: 1.0,
        resProgress: 0.5,
        packetCoord: { x: 625, y: 148 },
        packetText: '← RESULT',
        previewChip: 'RESPONSE IN FLIGHT',
        previewAmount: 'RETURNING',
        previewIcon: '🔄',
        previewHeadline: 'Sending Official Status Back',
        previewSub: 'Signed response returning to merchant',
        legacyNodes: ['customer', 'system'],
    },
    {
        opLabel: 'STEP 6 OF 6 · THE MERCHANT RECEIVES THE RESULT',
        title: '6. The merchant receives the result',
        desc: '',
        techNote: 'SAFETY HABIT: Rely on verified app/terminal updates—never an unverified screenshot.',
        activeNode: 1,
        completedNodes: [0, 2, 3],
        reqProgress: 1.0,
        resProgress: 1.0,
        packetCoord: { x: 375, y: 98 },
        packetText: 'CONFIRMED ✓',
        previewChip: 'MERCHANT TERMINAL',
        previewAmount: 'RM 11.50',
        previewIcon: '🏪',
        previewHeadline: 'Order Status Updated',
        previewSub: 'Confirmed by payment provider',
        legacyNodes: ['system', 'merchant'],
    },
];

const OUTCOME_PROFILES = {
    successful: {
        pillLabel: 'OUTCOME: SUCCESSFUL',
        badge: '✓ SUCCESSFUL PAYMENT',
        heading: 'Successful payment',
        step6Title: '6. The merchant receives the result — Paid',
        step6Desc: 'The payment was approved! The confirmed result reaches Kopi Corner Café, and both the shop’s screen and your wallet app update the order to Paid.',
        cardCopy: 'The payment response returned as Approved. The merchant updates the order based on the confirmed status from the payment provider.',
        packetReturnText: '← APPROVED ✓',
        packetFinalText: 'PAID ✓',
        previewIcon: '✅',
        previewHeadline: 'Order Marked as Paid',
        previewSub: 'RM 11.50 confirmed · Balance RM 88.50',
        color: 'var(--blue)',
    },
    declined: {
        pillLabel: 'OUTCOME: DECLINED',
        badge: '✕ DECLINED OR FAILED',
        heading: 'Declined or failed payment',
        step6Title: '6. The merchant receives the result — Declined',
        step6Desc: 'The payment could not be completed (for example, due to insufficient balance, a cancelled check, or a security limit). No money leaves your wallet, and the merchant does not mark the order as paid.',
        cardCopy: 'The payment was not completed. A failure can happen for several reasons—check your app message or try another payment method.',
        packetReturnText: '← DECLINED ✕',
        packetFinalText: 'NOT PAID ✕',
        previewIcon: '❌',
        previewHeadline: 'Payment Not Completed',
        previewSub: ' RM 0.00 charged · Order remains unpaid',
        color: 'var(--red)',
    },
    pending: {
        pillLabel: 'OUTCOME: PENDING',
        badge: '◷ PENDING PAYMENT',
        heading: 'Pending payment',
        step6Title: '6. The merchant receives the result — Pending',
        step6Desc: 'The final result has not been confirmed yet (often due to a slow connection or extra provider check). Both your app and the shop show a waiting state instead of claiming success.',
        cardCopy: 'A pending payment is not a confirmed payment yet. Wait for your official app status to update before trying to pay a second time.',
        packetReturnText: '← PENDING ◷',
        packetFinalText: 'WAITING ◷',
        previewIcon: '⏳',
        previewHeadline: 'Awaiting Final Confirmation',
        previewSub: 'Do not pay twice · Check official app status',
        color: 'var(--amber)',
    },
};

function initSvgPaths() {
    const reqPath = document.getElementById('tx-progress-request');
    const resPath = document.getElementById('tx-progress-response');
    if (reqPath && reqPath.getTotalLength) {
        const len = reqPath.getTotalLength();
        reqPath.style.strokeDasharray = `${len}`;
        reqPath.style.strokeDashoffset = `${len}`;
    }
    if (resPath && resPath.getTotalLength) {
        const len = resPath.getTotalLength();
        resPath.style.strokeDasharray = `${len}`;
        resPath.style.strokeDashoffset = `${len}`;
    }
}

function renderExplainerStep(animatePacket = true) {
    const idx = state.explainerStep;
    const step = EXPLAINER_STEPS[idx];
    const outcomeProfile = OUTCOME_PROFILES[state.txOutcomeMode] || OUTCOME_PROFILES.successful;

    const stepNumEl = document.getElementById('step-num');
    if (stepNumEl) stepNumEl.textContent = idx + 1;

    const opLabelEl = document.getElementById('tx-op-label');
    if (opLabelEl) {
        opLabelEl.textContent = idx === 5
            ? `STEP 6 OF 6 · ${state.txOutcomeMode === 'successful' ? 'MERCHANT CONFIRMED PAID' : state.txOutcomeMode === 'declined' ? 'PAYMENT DECLINED' : 'STATUS PENDING'}`
            : step.opLabel;
    }

    const statusDot = document.getElementById('tx-status-dot');
    if (statusDot) {
        const dotColor = idx >= 4 ? outcomeProfile.color : 'var(--blue)';
        statusDot.style.background = dotColor;
        statusDot.style.boxShadow = `0 0 10px ${dotColor}`;
    }

    document.getElementById('tx-active-outcome-pill').textContent = outcomeProfile.pillLabel;
    document.getElementById('step-title').textContent = idx === 5 ? outcomeProfile.step6Title : step.title;
    document.getElementById('step-description').textContent = idx === 5 ? outcomeProfile.step6Desc : step.desc;
    document.getElementById('tx-tech-note').textContent = step.techNote;

    // Synchronize Live Scene Preview Card
    const previewChip = document.getElementById('tx-preview-chip');
    const previewAmount = document.getElementById('tx-preview-amount');
    const previewIcon = document.getElementById('tx-preview-icon');
    const previewHeadline = document.getElementById('tx-preview-headline');
    const previewSub = document.getElementById('tx-preview-sub');

    if (previewChip) previewChip.textContent = step.previewChip;
    if (previewAmount) {
        previewAmount.textContent = idx === 5 ? outcomeProfile.packetFinalText : step.previewAmount;
        previewAmount.style.color = idx >= 4 ? outcomeProfile.color : 'var(--blue)';
    }
    if (previewIcon) previewIcon.textContent = idx === 5 ? outcomeProfile.previewIcon : step.previewIcon;
    if (previewHeadline) previewHeadline.textContent = idx === 5 ? outcomeProfile.previewHeadline : step.previewHeadline;
    if (previewSub) previewSub.textContent = idx === 5 ? outcomeProfile.previewSub : step.previewSub;

    if (!REDUCED && hasGsap && animatePacket) {
        track(gsap.fromTo('#tx-preview-graphic',
            { opacity: 0.45, y: 6 },
            { opacity: 1, y: 0, duration: MOTION.d(0.26), ease: MOTION.easeOut }
        ));
    }

    // Outcome Summary Card
    const outcomeCard = document.getElementById('tx-outcome-card');
    if (outcomeCard) {
        outcomeCard.setAttribute('data-status', state.txOutcomeMode);
        document.getElementById('tx-outcome-badge').textContent = outcomeProfile.badge;
        document.getElementById('tx-outcome-heading').textContent = outcomeProfile.heading;
        document.getElementById('tx-outcome-copy').textContent = outcomeProfile.cardCopy;
    }

    // Update 4 Participant Nodes
    for (let n = 0; n < 4; n++) {
        const nodeEl = document.getElementById(`tx-node-${n}`);
        const stateEl = document.getElementById(`tx-state-${n}`);
        if (!nodeEl || !stateEl) continue;

        const isActive = step.activeNode === n;
        const isCompleted = step.completedNodes.includes(n);

        nodeEl.classList.remove('active', 'completed', 'declined-node', 'pending-node');

        if (isActive) {
            nodeEl.classList.add('active');
            if (idx >= 4 && state.txOutcomeMode === 'declined') {
                nodeEl.classList.add('declined-node');
                stateEl.textContent = 'DECLINED';
            } else if (idx >= 4 && state.txOutcomeMode === 'pending') {
                nodeEl.classList.add('pending-node');
                stateEl.textContent = 'PENDING';
            } else {
                stateEl.textContent = 'ACTIVE';
            }
        } else if (isCompleted) {
            nodeEl.classList.add('completed');
            stateEl.textContent = 'DONE ✓';
        } else {
            stateEl.textContent = 'WAITING';
        }
    }

    // Update 6-Segment Progress Rail
    document.querySelectorAll('.tx-step-pill').forEach((pill, sIdx) => {
        const isCurrent = sIdx === idx;
        pill.classList.toggle('active', isCurrent);
        pill.classList.toggle('completed', sIdx < idx);
        pill.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    // Legacy compatibility hooks
    ['customer', 'system', 'merchant'].forEach(name => {
        const node = document.getElementById('node-' + name);
        if (node) node.classList.toggle('active', step.legacyNodes.includes(name));
    });

    document.getElementById('prev-btn').disabled = idx === 0;
    document.getElementById('next-btn').textContent =
        idx === EXPLAINER_STEPS.length - 1 ? 'Restart journey ↻' : 'Next step →';

    // Animate SVG Paths & Packet Badge
    const reqPath = document.getElementById('tx-progress-request');
    const resPath = document.getElementById('tx-progress-response');
    const packet = document.getElementById('tx-svg-packet');
    const packetCore = packet ? packet.querySelector('.tx-packet-core') : null;
    const packetPillText = document.getElementById('tx-packet-pill-text');

    if (packetCore) {
        packetCore.style.fill = idx >= 4 ? outcomeProfile.color : 'var(--blue)';
    }
    if (packetPillText) {
        packetPillText.textContent = idx === 4
            ? outcomeProfile.packetReturnText
            : idx === 5
                ? outcomeProfile.packetFinalText
                : step.packetText;
    }

    if (reqPath && reqPath.getTotalLength) {
        const reqLen = reqPath.getTotalLength();
        const targetOffset = reqLen * (1 - step.reqProgress);
        if (!REDUCED && hasGsap && animatePacket) {
            track(gsap.to(reqPath, { strokeDashoffset: targetOffset, duration: MOTION.d(MOTION.packet), ease: MOTION.easeOut }));
        } else {
            reqPath.style.strokeDashoffset = `${targetOffset}`;
        }
    }

    if (resPath && resPath.getTotalLength) {
        const resLen = resPath.getTotalLength();
        const targetResOffset = resLen * (1 - step.resProgress);
        resPath.style.stroke = outcomeProfile.color;
        if (!REDUCED && hasGsap && animatePacket) {
            track(gsap.to(resPath, {
                strokeDashoffset: targetResOffset,
                opacity: step.resProgress > 0 ? 1 : 0,
                duration: MOTION.d(MOTION.packet),
                ease: MOTION.easeOut,
            }));
        } else {
            resPath.style.strokeDashoffset = `${targetResOffset}`;
            resPath.style.opacity = step.resProgress > 0 ? '1' : '0';
        }
    }

    if (packet) {
        const { x, y } = step.packetCoord;
        if (!REDUCED && hasGsap && animatePacket) {
            track(gsap.to(packet, {
                attr: { transform: `translate(${x}, ${y})` },
                duration: MOTION.d(MOTION.packet),
                ease: MOTION.easeOut,
            }));
        } else {
            packet.setAttribute('transform', `translate(${x}, ${y})`);
        }
    }

    announce(`Step ${idx + 1} of 6: ${document.getElementById('step-title').textContent}.`);
}

function showExplainer() {
    stopTxAutoplay();
    if (!transition('explainer')) return;
    state.explainerStep = 0;
    state.openedDirectExplainer = false;

    const returnBtn = document.getElementById('tx-return-result-btn');
    if (returnBtn) {
        returnBtn.textContent = '← BACK TO PAYMENT RESULT';
    }

    showStage('explainer');
    initSvgPaths();
    renderExplainerStep(false);

    if (REDUCED || !hasGsap) return;
    track(gsap.fromTo('.tx-participant-node',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.36), ease: MOTION.easeOut }
    ));
}

function selectTxStage(stepIndex) {
    stopTxAutoplay();
    if (stepIndex < 0 || stepIndex >= EXPLAINER_STEPS.length) return;
    killTimelines();
    state.explainerStep = stepIndex;
    renderExplainerStep(true);
}

function setTxOutcome(outcomeKey) {
    if (!OUTCOME_PROFILES[outcomeKey]) return;
    state.txOutcomeMode = outcomeKey;

    document.querySelectorAll('.tx-outcome-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.outcome === outcomeKey);
    });

    if (state.explainerStep < 4) {
        state.explainerStep = 5;
    }
    killTimelines();
    renderExplainerStep(true);
}

function nextStep() {
    stopTxAutoplay();
    killTimelines();
    if (state.explainerStep < EXPLAINER_STEPS.length - 1) {
        state.explainerStep++;
        renderExplainerStep(true);
    } else {
        state.explainerStep = 0;
        renderExplainerStep(true);
    }
}

function prevStep() {
    stopTxAutoplay();
    killTimelines();
    if (state.explainerStep > 0) {
        state.explainerStep--;
        renderExplainerStep(true);
    }
}

function replayExplainer() {
    stopTxAutoplay();
    killTimelines();
    state.explainerStep = 0;
    initSvgPaths();
    renderExplainerStep(true);
}

function startTxWalkthrough() {
    const stageEl = document.getElementById('tx-system-stage');
    if (stageEl) {
        stageEl.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    }
    state.explainerStep = 0;
    renderExplainerStep(true);
}

function syncAutoplayButtons() {
    const label = state.txAutoplay ? '⏸ Pause journey' : '▶ Auto-play journey';
    const shortLabel = state.txAutoplay ? '⏸ Pause' : '▶ Auto-play';
    const topBtn = document.getElementById('tx-autoplay-btn');
    const bottomBtn = document.getElementById('tx-pause-btn');
    if (topBtn) {
        topBtn.textContent = label;
        topBtn.setAttribute('aria-pressed', state.txAutoplay ? 'true' : 'false');
    }
    if (bottomBtn) {
        bottomBtn.textContent = shortLabel;
    }
}

function stopTxAutoplay() {
    state.txAutoplay = false;
    syncAutoplayButtons();
}

function toggleTxAutoplay() {
    if (state.txAutoplay) {
        stopTxAutoplay();
        clearTimers();
        return;
    }
    state.txAutoplay = true;
    syncAutoplayButtons();

    if (state.explainerStep >= EXPLAINER_STEPS.length - 1) {
        state.explainerStep = 0;
    }
    renderExplainerStep(true);

    const scheduleNext = () => {
        if (!state.txAutoplay || state.step !== 'explainer') return;
        later(() => {
            if (!state.txAutoplay || state.step !== 'explainer') return;
            if (state.explainerStep < EXPLAINER_STEPS.length - 1) {
                state.explainerStep++;
                renderExplainerStep(true);
                scheduleNext();
            } else {
                stopTxAutoplay();
            }
        }, REDUCED ? 600 : 1850);
    };
    scheduleNext();
}

function toggleTxDisclosure(triggerBtn) {
    const expanded = triggerBtn.getAttribute('aria-expanded') === 'true';
    const body = triggerBtn.nextElementSibling;
    const chevron = triggerBtn.querySelector('.tx-disc-chevron');

    triggerBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    if (body) body.hidden = expanded;
    if (chevron) chevron.textContent = expanded ? '+' : '−';
}

function returnToResult() {
    stopTxAutoplay();
    if (state.openedDirectExplainer) {
        // Direct-explainer route: return users to the immersive payment theater
        launchImmersivePayExperience();
        return;
    }
    if (!transition('result')) return;
    showStage('result');
}

// ============================================================
// FEATURE 2 UPGRADE: FULL-SCREEN CINEMATIC SMARTPHONE EXPERIENCE
// ============================================================
const SCAM_STATES = {
    INTRO: 'INTRO',
    ENTERING: 'ENTERING_IMMERSIVE_MODE',
    LOCK_SCREEN: 'LOCK_SCREEN',
    NOTIFICATION: 'NOTIFICATION',
    MESSAGE_OPEN: 'MESSAGE_OPEN',
    CHOICE: 'CHOICE',
    BRANCH_WORKFLOW: 'BRANCH_WORKFLOW',
    BRANCH_RESULT: 'BRANCH_RESULT',
    SAFETY_GUIDE: 'SAFETY_GUIDE',
};

const cinemaScam = {
    state: SCAM_STATES.INTRO,
    active: false,
    branch: null,               // 'transfer' | 'app' | 'contact'
    transferConfirmed: false,
    walletSen: 10000,           // RM 100.00
    savedScrollY: 0,
    triggerElement: null,
};

function animateScamLaunchpad() {
    if (REDUCED || !hasGsap) return;
    const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
    tl.fromTo('#scam-headline', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: MOTION.d(0.45) })
      .fromTo('#scam-supporting', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: MOTION.d(0.35) }, '-=0.24')
      .fromTo('.scam-preview-phone', { opacity: 0, y: 28, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: MOTION.d(0.48) }, 0.1);
}

function scrollToInlineScamGuide() {
    const guide = document.getElementById('scam-prevention-guide');
    if (guide) guide.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
}

function switchInPhoneScreen(screenId) {
    ['c-screen-lock', 'c-screen-messages', 'c-screen-workflow', 'c-screen-result'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === screenId);
    });
}

function resetInPhoneDomState() {
    cinemaScam.branch = null;
    cinemaScam.transferConfirmed = false;
    cinemaScam.walletSen = 10000;

    const phoneStage = document.getElementById('scam-cinema-phone-stage');
    const guideScene = document.getElementById('scam-cinema-guide-scene');
    if (phoneStage) phoneStage.hidden = false;
    if (guideScene) guideScene.hidden = true;

    switchInPhoneScreen('c-screen-lock');

    const notifBtn = document.getElementById('c-sms-notif-btn');
    if (notifBtn) {
        notifBtn.style.opacity = '0';
        notifBtn.style.transform = 'translateY(-24px)';
    }

    document.querySelectorAll('.c-flag-word').forEach(w => w.classList.remove('highlighted'));

    const annot = document.getElementById('c-inphone-annotation');
    if (annot) annot.hidden = true;

    const readWrap = document.getElementById('c-read-confirm-wrap');
    if (readWrap) readWrap.hidden = true;

    const choicesBox = document.getElementById('c-inphone-choices');
    if (choicesBox) {
        choicesBox.hidden = true;
        choicesBox.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }

    const msgScroll = document.getElementById('c-messages-scroll');
    if (msgScroll) msgScroll.scrollTop = 0;
}

function launchImmersiveScamExperience() {
    if (cinemaScam.active) return;
    state.runId++;
    clearTimers();
    killTimelines();

    cinemaScam.active = true;
    cinemaScam.state = SCAM_STATES.ENTERING;
    cinemaScam.savedScrollY = window.scrollY || window.pageYOffset || 0;
    cinemaScam.triggerElement = document.activeElement || document.getElementById('scam-start-btn');

    resetInPhoneDomState();

    const overlay = document.getElementById('scam-immersive-overlay');
    const siteShell = document.getElementById('site-shell');
    const chassis = document.getElementById('cinema-phone-chassis');

    overlay.hidden = false;
    document.body.classList.add('immersive-lock');

    announce('Entering full-screen scam prevention simulation. Press Escape at any time to exit.');

    if (!REDUCED && hasGsap) {
        const tl = track(gsap.timeline({
            defaults: { ease: MOTION.easeOut },
            onComplete: () => {
                cinemaScam.state = SCAM_STATES.LOCK_SCREEN;
                triggerIncomingLockScreenSms();
            }
        }));

        tl.to(siteShell, { scale: 0.96, opacity: 0, duration: MOTION.d(0.38) }, 0)
          .fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: MOTION.d(0.38) }, 0)
          .fromTo(chassis,
              { opacity: 0, y: 48, scale: 0.92 },
              { opacity: 1, y: 0, scale: 1, duration: MOTION.d(MOTION.cinema), ease: 'power3.out' },
              0.14
          );
    } else {
        siteShell.style.opacity = '0';
        overlay.style.opacity = '1';
        chassis.style.opacity = '1';
        chassis.style.transform = 'none';
        cinemaScam.state = SCAM_STATES.LOCK_SCREEN;
        triggerIncomingLockScreenSms();
    }
}

function triggerIncomingLockScreenSms() {
    const notifBtn = document.getElementById('c-sms-notif-btn');
    const island = document.getElementById('cinema-dynamic-island');

    later(() => {
        if (!cinemaScam.active) return;
        cinemaScam.state = SCAM_STATES.NOTIFICATION;

        if (!REDUCED && hasGsap) {
            const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
            if (island) {
                tl.fromTo(island, { scaleX: 1 }, { scaleX: 1.18, duration: 0.16, yoyo: true, repeat: 1 });
            }
            tl.fromTo(notifBtn,
                { opacity: 0, y: -24, scale: 0.96 },
                { opacity: 1, y: 0, scale: 1, duration: MOTION.d(0.36), ease: MOTION.emphasis }
            );
        } else {
            notifBtn.style.opacity = '1';
            notifBtn.style.transform = 'translateY(0)';
        }

        later(() => {
            if (cinemaScam.active && cinemaScam.state === SCAM_STATES.NOTIFICATION) {
                notifBtn.focus();
            }
        }, REDUCED ? 20 : 380);

        announce('New SMS notification on lock screen from Apex National Alerts: Urgent, your bank account is at risk. Tap notification to open message.');
    }, REDUCED ? 60 : 420);
}

function openImmersiveSms() {
    if (!cinemaScam.active || cinemaScam.state !== SCAM_STATES.NOTIFICATION) return;
    state.runId++;
    clearTimers();
    killTimelines();

    cinemaScam.state = SCAM_STATES.MESSAGE_OPEN;
    switchInPhoneScreen('c-screen-messages');

    const bubble = document.getElementById('c-sms-bubble');
    const words = document.querySelectorAll('.c-flag-word');
    const annot = document.getElementById('c-inphone-annotation');
    const readWrap = document.getElementById('c-read-confirm-wrap');

    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('#c-screen-messages', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: MOTION.d(0.3), ease: MOTION.easeOut }));
        track(gsap.fromTo(bubble, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: MOTION.d(0.28), delay: 0.08, ease: MOTION.easeOut }));
    }

    words.forEach((word, idx) => {
        later(() => {
            word.classList.add('highlighted');
        }, REDUCED ? 20 : 320 + idx * 240);
    });

    later(() => {
        if (!cinemaScam.active || cinemaScam.state !== SCAM_STATES.MESSAGE_OPEN) return;
        annot.hidden = false;
        readWrap.hidden = false;
        if (!REDUCED && hasGsap) {
            track(gsap.fromTo([annot, readWrap], { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.08, duration: MOTION.d(0.28), ease: MOTION.easeOut }));
        }
        const openChoicesBtn = document.getElementById('c-open-choices-btn');
        if (openChoicesBtn) openChoicesBtn.focus();
    }, REDUCED ? 50 : 1100);

    announce('Messages app opened. Suspicious phrases highlighted: account is at risk, secure account, immediately.');
}

function revealInPhoneChoices() {
    if (!cinemaScam.active || (cinemaScam.state !== SCAM_STATES.MESSAGE_OPEN && cinemaScam.state !== SCAM_STATES.BRANCH_WORKFLOW)) return;
    killTimelines();

    cinemaScam.state = SCAM_STATES.CHOICE;
    document.getElementById('c-read-confirm-wrap').hidden = true;

    const choicesBox = document.getElementById('c-inphone-choices');
    choicesBox.hidden = false;
    const btns = choicesBox.querySelectorAll('button');
    btns.forEach(b => { b.disabled = false; });

    if (!REDUCED && hasGsap) {
        track(gsap.fromTo(btns,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.28), ease: MOTION.easeOut }
        ));
    }

    const msgScroll = document.getElementById('c-messages-scroll');
    if (msgScroll) {
        later(() => {
            msgScroll.scrollTo({ top: msgScroll.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
            if (btns[0]) btns[0].focus();
        }, 40);
    }

    announce('Three response choices available inside the phone: 1. Transfer the money, 2. Check the official banking app, 3. Contact the bank via official number.');
}

function backToInPhoneChoices() {
    if (!cinemaScam.active) return;
    state.runId++;
    clearTimers();
    killTimelines();

    cinemaScam.branch = null;
    cinemaScam.state = SCAM_STATES.CHOICE;
    switchInPhoneScreen('c-screen-messages');
    const choicesBox = document.getElementById('c-inphone-choices');
    choicesBox.hidden = false;
    choicesBox.querySelectorAll('button').forEach(b => { b.disabled = false; });
}

function chooseImmersiveBranch(branchKey) {
    if (!cinemaScam.active || cinemaScam.state !== SCAM_STATES.CHOICE) return;
    state.runId++;
    clearTimers();
    killTimelines();

    cinemaScam.state = SCAM_STATES.BRANCH_WORKFLOW;
    cinemaScam.branch = branchKey;

    document.querySelectorAll('#c-inphone-choices button').forEach(b => { b.disabled = true; });
    switchInPhoneScreen('c-screen-workflow');

    const titleEl = document.getElementById('c-wf-app-title');
    const subEl = document.getElementById('c-wf-app-sub');
    const bodyEl = document.getElementById('c-wf-body');
    const backBtn = document.getElementById('c-wf-back-btn');
    if (backBtn) backBtn.hidden = false;

    if (branchKey === 'transfer') {
        titleEl.textContent = 'Simulated Bank Transfer';
        subEl.textContent = 'SIMULATION — NO REAL MONEY';
        bodyEl.innerHTML = `
            <div class="c-wf-card">
                <div class="panel-label mono">TRANSFER TO UNVERIFIED ACCOUNT</div>
                <div class="c-wf-amount mono">RM 100.00</div>
                <div class="c-wf-row mono"><span>RECIPIENT</span><strong>“Secure Holding Account”</strong></div>
                <div class="c-wf-row mono"><span>ACCT REF</span><strong>SEC-ACCT-8829 (Fictional)</strong></div>
                <div class="c-wf-row mono"><span>SOURCE</span><strong>Simulated Wallet (RM 100.00)</strong></div>
            </div>
            <div class="c-wf-note warn">
                <strong>Warning:</strong> You are following transfer instructions from an unverified SMS. Confirming this simulated transfer will send your entire RM 100.00 simulated balance.
            </div>
            <div class="c-res-actions" id="c-branch-a-actions">
                <button type="button" class="btn btn-primary c-full-btn" id="c-confirm-transfer-btn" onclick="confirmSimulatedScamTransfer()">
                    Confirm Simulated Transfer (RM 100.00)
                </button>
                <button type="button" class="btn btn-ghost c-full-btn" onclick="backToInPhoneChoices()">
                    ← Cancel &amp; Reconsider
                </button>
            </div>
        `;
        announce('Simulated transfer confirmation screen. Fictional amount RM 100.00 to Secure Holding Account. Confirm or cancel.');

    } else if (branchKey === 'app') {
        titleEl.textContent = 'Apex Official App (Sim)';
        subEl.textContent = 'INDEPENDENT APP LAUNCH';
        bodyEl.innerHTML = `
            <div class="c-wf-card">
                <div class="panel-label mono">OFFICIAL SECURITY CENTER</div>
                <div class="c-wf-row mono"><span>ACCOUNT STATUS</span><strong class="blue-text">✓ NORMAL · NO LOCKS</strong></div>
                <div class="c-wf-row mono"><span>AVAILABLE BALANCE</span><strong>RM 100.00</strong></div>
                <div class="c-wf-row mono"><span>SECURITY ALERTS</span><strong>0 Active Alerts Found</strong></div>
            </div>
            <div class="c-wf-note">
                <strong>No matching alert found:</strong> Opening the official banking app independently shows no record of the urgent SMS claim. Note that while the absence of an alert is a strong warning sign, you can also verify via a second official channel if any doubt remains.
            </div>
            <div class="c-res-actions">
                <button type="button" class="btn btn-primary c-full-btn" onclick="showImmersiveBranchResult('app')">
                    Continue to Outcome Summary →
                </button>
            </div>
        `;
        announce('Simulated official banking app opened independently. Zero matching security alerts found.');

    } else if (branchKey === 'contact') {
        titleEl.textContent = 'Official Helpline (Sim)';
        subEl.textContent = 'NUMBER FROM BACK OF CARD';
        bodyEl.innerHTML = `
            <div class="c-wf-card">
                <div class="panel-label mono">SIMULATED CALL · NO REAL CALL PLACED</div>
                <div class="c-wf-row mono"><span>DIALED SOURCE</span><strong>Back of Bank Card</strong></div>
                <div class="c-wf-row mono"><span>CALL STATUS</span><strong class="blue-text">VERIFIED REPRESENTATIVE</strong></div>
            </div>
            <div class="c-sms-incoming-bubble">
                <strong>Simulated Bank Representative:</strong><br>
                “We have checked your account. It is completely safe. Our bank will <strong>never</strong> send an SMS asking you to transfer funds into a so-called ‘secure account.’ That text message is a scam.”
            </div>
            <div class="c-res-actions">
                <button type="button" class="btn btn-primary c-full-btn" onclick="showImmersiveBranchResult('contact')">
                    Continue to Outcome Summary →
                </button>
            </div>
        `;
        announce('Simulated bank call verification using official card number. The bank representative confirms the SMS is fraudulent.');
    }

    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('#c-screen-workflow .c-wf-body > *',
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.3), ease: MOTION.easeOut }
        ));
    }
}

function confirmSimulatedScamTransfer() {
    if (!cinemaScam.active || cinemaScam.branch !== 'transfer' || cinemaScam.transferConfirmed) return;
    cinemaScam.transferConfirmed = true;

    const backBtn = document.getElementById('c-wf-back-btn');
    if (backBtn) backBtn.hidden = true;

    const bodyEl = document.getElementById('c-wf-body');
    bodyEl.innerHTML = `
        <div class="c-wf-card" style="text-align:center; padding:32px 16px;">
            <div class="spinner" style="width:48px;height:48px;margin:0 auto 14px;" aria-hidden="true"></div>
            <div class="mono" style="font-size:0.76rem;letter-spacing:0.12em;">SUBMITTING SIMULATED TRANSFER…</div>
            <div class="mono" style="font-size:0.68rem;color:var(--text-2);margin-top:6px;">SIMULATION — NO REAL MONEY MOVES</div>
        </div>
    `;
    announce('Submitting simulated transfer of RM 100.00.');

    later(() => {
        if (!cinemaScam.active) return;
        cinemaScam.walletSen = 0;
        showImmersiveBranchResult('transfer');
    }, REDUCED ? 60 : 850);
}

function showImmersiveBranchResult(branchKey) {
    if (!cinemaScam.active) return;
    killTimelines();

    cinemaScam.state = SCAM_STATES.BRANCH_RESULT;
    switchInPhoneScreen('c-screen-result');

    const pillEl = document.getElementById('c-res-pill');
    const iconEl = document.getElementById('c-res-icon');
    const tagEl = document.getElementById('c-res-tag');
    const titleEl = document.getElementById('c-res-title');
    const expEl = document.getElementById('c-res-explanation');
    const walletEl = document.getElementById('c-res-wallet');
    const lessonsEl = document.getElementById('c-res-lessons');

    if (branchKey === 'transfer') {
        pillEl.textContent = 'SIMULATED LOSS';
        iconEl.textContent = '!';
        iconEl.classList.add('warn');
        tagEl.textContent = 'OUTCOME · UNVERIFIED TRANSFER';
        tagEl.style.color = 'var(--red)';
        titleEl.textContent = 'RM 100.00 lost in this simulation.';
        expEl.textContent =
            'You followed an urgent instruction from an unverified SMS and confirmed a transfer to a supposed “secure account.” In real life, bank transfers authorized to a fraudster’s account can be very difficult to recover.';
        walletEl.textContent = 'RM 0.00 (Fictional Loss)';
        walletEl.style.color = 'var(--red)';
        lessonsEl.innerHTML = `
            <li>Legitimate banks never ask you via SMS to move money into a “secure account.”</li>
            <li>Manufactured urgency (“immediately”) is a classic trigger to stop you from verifying.</li>
        `;
    } else if (branchKey === 'app') {
        pillEl.textContent = 'VERIFIED SAFE';
        iconEl.textContent = '✓';
        iconEl.classList.remove('warn');
        tagEl.textContent = 'OUTCOME · OFFICIAL APP CHECK';
        tagEl.style.color = 'var(--cyan)';
        titleEl.textContent = 'You avoided the scam transfer.';
        expEl.textContent =
            'By opening your official banking app independently instead of trusting the SMS, you discovered there was no matching security alert. While the absence of an in-app alert does not by itself prove every message is fake, it tells you to pause and verify through another official channel before acting.';
        walletEl.textContent = 'RM 100.00 (Protected)';
        walletEl.style.color = 'var(--blue)';
        lessonsEl.innerHTML = `
            <li>Always open your banking app independently—never via links in an SMS.</li>
            <li>If an alert is missing in the app, confirm with the bank via an official number before taking any action.</li>
        `;
    } else {
        pillEl.textContent = 'CONFIRMED FRAUD';
        iconEl.textContent = '✓';
        iconEl.classList.remove('warn');
        tagEl.textContent = 'OUTCOME · OFFICIAL CONTACT';
        tagEl.style.color = 'var(--cyan)';
        titleEl.textContent = 'Bank confirmed the SMS is a scam.';
        expEl.textContent =
            'You contacted the bank using the trusted number on the back of your card rather than replying to or trusting the suspicious SMS. The bank confirmed your account was safe and that the message was fraudulent.';
        walletEl.textContent = 'RM 100.00 (Protected)';
        walletEl.style.color = 'var(--blue)';
        lessonsEl.innerHTML = `
            <li>Always obtain your bank’s phone number independently from your card or official website.</li>
            <li>Never call phone numbers or click links supplied inside an unexpected SMS.</li>
        `;
    }

    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('#c-screen-result .c-result-scroll > *',
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, stagger: 0.06, duration: MOTION.d(0.32), ease: MOTION.easeOut }
        ));
    }
    announce(titleEl.textContent + ' ' + expEl.textContent);
}

function openImmersiveSafetyGuide() {
    if (!cinemaScam.active) return;
    killTimelines();

    cinemaScam.state = SCAM_STATES.SAFETY_GUIDE;
    const phoneStage = document.getElementById('scam-cinema-phone-stage');
    const guideScene = document.getElementById('scam-cinema-guide-scene');
    const chassis = document.getElementById('cinema-phone-chassis');

    if (!REDUCED && hasGsap) {
        const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut } }));
        tl.to(chassis, {
            scale: 0.9,
            opacity: 0,
            duration: MOTION.d(0.32),
            onComplete: () => {
                phoneStage.hidden = true;
                guideScene.hidden = false;
                gsap.set(chassis, { scale: 1, opacity: 1 });
            }
        })
        .fromTo('.cinema-guide-header, .cinema-guide-card, .cinema-guide-footer',
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, stagger: 0.05, duration: MOTION.d(0.38) }
        );
    } else {
        phoneStage.hidden = true;
        guideScene.hidden = false;
    }

    announce('Full-screen scam prevention guide: 6 practical steps to prevent digital scams.');
}

function replayImmersiveScamScenario() {
    if (!cinemaScam.active) {
        launchImmersiveScamExperience();
        return;
    }
    state.runId++;
    clearTimers();
    killTimelines();

    resetInPhoneDomState();
    cinemaScam.state = SCAM_STATES.LOCK_SCREEN;

    const chassis = document.getElementById('cinema-phone-chassis');
    if (!REDUCED && hasGsap) {
        track(gsap.fromTo(chassis, { opacity: 0.4, scale: 0.95 }, { opacity: 1, scale: 1, duration: MOTION.d(0.35), ease: MOTION.easeOut }));
    }

    triggerIncomingLockScreenSms();
    announce('Replaying full-screen scam scenario from lock screen.');
}

function exitImmersiveScamExperience() {
    if (!cinemaScam.active) return;
    state.runId++;
    clearTimers();
    killTimelines();

    cinemaScam.active = false;
    cinemaScam.state = SCAM_STATES.INTRO;

    const overlay = document.getElementById('scam-immersive-overlay');
    const siteShell = document.getElementById('site-shell');
    const restoreY = cinemaScam.savedScrollY;
    const triggerEl = cinemaScam.triggerElement;

    const completeExit = () => {
        overlay.hidden = true;
        document.body.classList.remove('immersive-lock');
        siteShell.style.opacity = '';
        siteShell.style.transform = '';
        window.scrollTo({ top: restoreY, behavior: 'auto' });
        if (triggerEl && typeof triggerEl.focus === 'function') {
            triggerEl.focus();
        }
        announce('Exited full-screen scam simulation and returned to website.');
    };

    if (!REDUCED && hasGsap) {
        const tl = track(gsap.timeline({
            defaults: { ease: MOTION.easeOut },
            onComplete: completeExit
        }));
        tl.to(overlay, { opacity: 0, duration: MOTION.d(0.28) }, 0)
          .to(siteShell, { scale: 1, opacity: 1, duration: MOTION.d(0.32) }, 0.05);
    } else {
        completeExit();
    }
}

// ============================================================
// FEATURE 1A: FULL-SCREEN PHONE THEATER FOR THE QR PAYMENT CHALLENGE
// ============================================================
const PAY_SCREENS = ['p-screen-intro', 'p-screen-scan', 'p-screen-review', 'p-screen-confirm', 'p-screen-processing', 'p-screen-result'];

const payCinema = {
    active: false,
    paid: false,
    savedScrollY: 0,
    triggerElement: null,
};

function paySwitchScreen(id) {
    document.querySelectorAll('#pay-immersive-overlay .cinema-app-screen').forEach(el => {
        el.classList.toggle('active', el.id === id);
    });
}

function animatePayStagger(sel, y = 10, dur = 0.3, stagger = 0.055) {
    if (REDUCED || !hasGsap) return;
    track(gsap.fromTo(sel, { opacity: 0, y }, { opacity: 1, y: 0, stagger, duration: MOTION.d(dur), ease: MOTION.easeOut }));
}

function resetPayTheaterDom() {
    paySwitchScreen('p-screen-intro');

    const scanStatus = document.getElementById('pay-scan-status');
    if (scanStatus) scanStatus.textContent = 'SCANNING QR…';

    const inlineInput = document.getElementById('pay-inline-input');
    if (inlineInput) { inlineInput.value = '115.00'; inlineInput.classList.remove('invalid'); }

    const inlineErr = document.getElementById('pay-inline-error');
    if (inlineErr) inlineErr.hidden = true;

    ['pay-scan-btn', 'pay-proceed-btn', 'pay-confirm-pay-btn', 'pay-receipt-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
    });
}

function payGoIntro() {
    killTimelines();
    if (!transition('intro')) state.step = 'intro';
    paySwitchScreen('p-screen-intro');

    const bal = document.getElementById('pay-intro-balance');
    if (bal) bal.textContent = formatSenNorm(CONFIG.BALANCE_SEN);

    animatePayStagger('#p-screen-intro .pay-reveal');
    const scanBtn = document.getElementById('pay-scan-btn');
    if (scanBtn) {
        scanBtn.disabled = false;
        later(() => scanBtn.focus(), REDUCED ? 20 : 420);
    }

    announce('Simulated café wallet on a phone. The receipt total is RM 11.50 and the simulated wallet balance is RM 100.00. Tap Scan QR code to begin the simulated payment.');
}

function launchImmersivePayExperience() {
    if (payCinema.active || cinemaScam.active) return;
    state.runId++;
    clearTimers();
    killTimelines();

    payCinema.active = true;
    payCinema.paid = false;
    payCinema.savedScrollY = window.scrollY || window.pageYOffset || 0;
    payCinema.triggerElement = document.activeElement || document.getElementById('pay-hero-cta');

    resetGame();
    resetPayTheaterDom();

    const overlay = document.getElementById('pay-immersive-overlay');
    const siteShell = document.getElementById('site-shell');
    const chassis = document.getElementById('pay-cinema-chassis');

    overlay.hidden = false;
    document.body.classList.add('immersive-lock');

    announce('Entering full-screen payment simulation on a simulated phone. Press Escape at any time to exit.');

    if (!REDUCED && hasGsap) {
        const tl = track(gsap.timeline({
            defaults: { ease: MOTION.easeOut },
            onComplete: () => payGoIntro(),
        }));
        tl.to(siteShell, { scale: 0.96, opacity: 0, duration: MOTION.d(0.38) }, 0)
          .fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: MOTION.d(0.38) }, 0)
          .fromTo(chassis, { opacity: 0, y: 56, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: MOTION.d(0.62), ease: 'power3.out' }, 0.14);
    } else {
        siteShell.style.opacity = '0';
        overlay.style.opacity = '1';
        chassis.style.opacity = '1';
        chassis.style.transform = 'none';
        payGoIntro();
    }
}

function payStartScan() {
    if (state._scanning || !payCinema.active) return;
    if (!transition('scanning')) return;
    state._scanning = true;

    const scanBtn = document.getElementById('pay-scan-btn');
    if (scanBtn) scanBtn.disabled = true;

    paySwitchScreen('p-screen-scan');
    const statusEl = document.getElementById('pay-scan-status');
    statusEl.textContent = 'SCANNING QR…';
    announce('Scanning simulated QR code on the phone.');

    if (!REDUCED && hasGsap) {
        animatePayStagger('#p-screen-scan .pay-reveal', 8, 0.28);
        const line = document.getElementById('pay-scanline');
        if (line) {
            track(gsap.fromTo(line,
                { y: -46, opacity: 0.4 },
                { y: 46, opacity: 1, duration: MOTION.d(1.15), ease: 'power1.inOut' }
            ));
            track(gsap.fromTo('#p-screen-scan .scanner-frame', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: MOTION.d(0.34), ease: MOTION.easeOut }));
        }
    }

    later(() => {
        state._scanning = false;
        if (state.step !== 'scanning') return;
        statusEl.textContent = 'SCAN COMPLETE · CHECK THE AMOUNT';
        if (!REDUCED && hasGsap) {
            track(gsap.fromTo('#p-screen-scan .scanner-frame', { scale: 1 }, { scale: 1.02, duration: MOTION.d(0.16), yoyo: true, repeat: 1, ease: MOTION.easeIn }));
        }
        later(payOpenReview, REDUCED ? 50 : 340);
    }, REDUCED ? 60 : 1400);
}

function payOpenReview() {
    if (state.step === 'review') { paySwitchScreen('p-screen-review'); return; }
    if (!transition('review')) return;
    paySwitchScreen('p-screen-review');
    payUpdateReviewVisuals(currentDisplaySen());
    animatePayStagger('#p-screen-review .pay-reveal');
    announce(
        'Payment review. The QR screen shows ' + formatSenNorm(currentDisplaySen()) +
        ' while your receipt says ' + formatSenNorm(CONFIG.PRICE_SEN) +
        '. Verify or edit the amount before confirming.'
    );
}

function payUpdateReviewVisuals(sen, syncInput = true) {
    const ok = sen === CONFIG.PRICE_SEN;
    const diff = sen - CONFIG.PRICE_SEN;

    const amountEl = document.getElementById('pay-review-amount');
    const flagEl = document.getElementById('pay-review-flag');
    const labelEl = document.getElementById('pay-amount-label');

    amountEl.textContent = formatSenNorm(sen);
    amountEl.classList.toggle('ok', ok);

    labelEl.textContent = ok
        ? 'PAYMENT AMOUNT — VERIFIED MATCH'
        : (state.editedSen === null ? 'QR-DISPLAYED PAYMENT AMOUNT' : 'EDITED PAYMENT AMOUNT');

    flagEl.textContent = ok
        ? '✓ MATCHES RECEIPT — SAFE TO PAY'
        : (diff > 0
            ? '⚠ OVER RECEIPT BY ' + formatSenNorm(diff)
            : '⚠ UNDER RECEIPT BY ' + formatSenNorm(-diff));
    flagEl.classList.toggle('ok', ok);

    const walletEl = document.getElementById('pay-review-wallet');
    if (walletEl) walletEl.textContent = formatSenNorm(CONFIG.BALANCE_SEN);

    const input = document.getElementById('pay-inline-input');
    const err = document.getElementById('pay-inline-error');
    // Never rewrite the field while the user is typing (typing passes syncInput=false);
    // the value is written when the screen opens, after "Use RM 11.50", or on blur.
    if (input) {
        if (syncInput) input.value = formatSenPlain(sen);
        input.classList.remove('invalid');
    }
    if (err) err.hidden = true;
}

function payUseReceiptAmount() {
    if (!payCinema.active || state.step !== 'review') return;
    state.editedSen = CONFIG.PRICE_SEN;
    payUpdateReviewVisuals(CONFIG.PRICE_SEN);
    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('#pay-review-amount', { opacity: 0.55 }, { opacity: 1, duration: MOTION.d(0.2), ease: MOTION.easeOut }));
    }
    announce('Amount updated to match receipt: RM 11.50.');
}

function payBackToIntro() {
    if (!payCinema.active) return;
    if (!transition('intro')) return;
    state.editedSen = null;
    state.confirmedSen = null;
    payGoIntro();
}

function payBackToReview() {
    if (!payCinema.active) return;
    if (!transition('review')) return;
    paySwitchScreen('p-screen-review');
    payUpdateReviewVisuals(currentDisplaySen());
}

function payProceedToConfirmation() {
    if (!payCinema.active || state.step !== 'review') return;

    const inlineInput = document.getElementById('pay-inline-input');
    const inlineErr = document.getElementById('pay-inline-error');
    const parsedInline = parseAmountToSen(inlineInput.value);
    if (parsedInline === null) {
        inlineInput.classList.add('invalid');
        if (inlineErr) {
            inlineErr.hidden = false;
            inlineErr.textContent = 'INVALID — ENTER A POSITIVE AMOUNT LIKE 11.50';
        }
        announce('Invalid payment amount. Enter a positive value with up to two decimals, for example 11.50.');
        if (!REDUCED && hasGsap) {
            track(gsap.fromTo(inlineInput, { x: -5 }, { x: 0, duration: MOTION.d(0.22), ease: 'power1.out' }));
        }
        return;
    }
    if (parsedInline !== CONFIG.QR_AMOUNT_SEN || state.editedSen !== null) {
        state.editedSen = parsedInline;
    }

    if (!transition('confirmation')) return;
    state.confirmedSen = currentDisplaySen();
    document.getElementById('pay-confirm-amount').textContent = formatSenNorm(state.confirmedSen);

    const diff = state.confirmedSen - CONFIG.PRICE_SEN;
    const noteEl = document.getElementById('pay-confirm-note');
    noteEl.textContent = diff === 0
        ? '✓ MATCHES RECEIPT — RM 11.50'
        : (diff > 0
            ? '⚠ OVER RECEIPT BY ' + formatSenNorm(diff)
            : '⚠ UNDER RECEIPT BY ' + formatSenNorm(-diff));
    noteEl.classList.toggle('ok', diff === 0);

    const payBtn = document.getElementById('pay-confirm-pay-btn');
    if (payBtn) payBtn.disabled = false;

    paySwitchScreen('p-screen-confirm');
    animatePayStagger('#p-screen-confirm .pay-reveal', 8, 0.26);
    announce('Final check. You are about to pay ' + formatSenNorm(state.confirmedSen) + ' to Kopi Corner Café in the simulation. Confirm or go back.');
}

function payConfirmPayment() {
    if (payCinema.paid || !payCinema.active || state.step !== 'confirmation') return;
    if (!transition('processing')) return;
    payCinema.paid = true;

    const payBtn = document.getElementById('pay-confirm-pay-btn');
    if (payBtn) payBtn.disabled = true;

    const outcome = calculateOutcome(state.confirmedSen, CONFIG.BALANCE_SEN);
    state._outcome = outcome;

    document.getElementById('pay-processing-ref').textContent =
        'TXN · ' + CONFIG.MERCHANT.toUpperCase() + ' · ' + formatSenNorm(outcome.paid);

    paySwitchScreen('p-screen-processing');
    animatePayStagger('#p-screen-processing .pay-reveal', 6, 0.3);
    announce('Processing simulated payment of ' + formatSenNorm(outcome.paid) + '.');

    later(() => {
        if (state.step !== 'processing') return;
        payShowResult(outcome);
    }, REDUCED ? 60 : 950);
}

function payShowResult(outcome) {
    if (!transition('result')) return;
    const isExactMatch = outcome.discrepancy === 0 && outcome.remaining >= 0 && !outcome.overBalance;

    const icon = document.getElementById('pay-result-icon');
    icon.textContent = isExactMatch ? '✓' : '!';
    icon.classList.toggle('warn', !isExactMatch);
    icon.setAttribute('aria-label', isExactMatch ? 'Verified simulated payment' : 'Payment discrepancy warning');

    const title = document.getElementById('pay-result-title');
    const message = document.getElementById('pay-result-message');
    const overRow = document.getElementById('pay-result-overset');
    const overLabel = document.getElementById('pay-result-over-label');
    const overValue = document.getElementById('pay-result-over-value');

    document.getElementById('pay-result-paid').textContent = formatSenNorm(outcome.paid);
    document.getElementById('pay-result-balance').textContent = formatSenNorm(outcome.remaining);

    if (outcome.discrepancy === 0) {
        overRow.hidden = true;
    } else {
        overRow.hidden = false;
        if (outcome.overpayment > 0) {
            overLabel.textContent = 'Overpayment vs. receipt';
            overValue.textContent = formatSenNorm(outcome.overpayment);
        } else {
            overLabel.textContent = 'Underpayment vs. receipt';
            overValue.textContent = formatSenNorm(outcome.underpayment);
        }
    }

    if (isExactMatch) {
        title.textContent = 'Payment successful — RM 11.50 verified';
        message.textContent =
            'You spotted that the QR code displayed RM 115.00 instead of the RM 11.50 receipt price and corrected it before confirming. ' +
            'Your simulated balance kept the RM 103.50 difference. Always compare the screen against your receipt before tapping confirm.';
    } else if (outcome.overpayment > 0) {
        title.textContent = 'Simulated overpayment — mismatch of ' + formatSenNorm(outcome.overpayment);
        message.textContent =
            'You confirmed ' + formatSenNorm(outcome.paid) + ' for an RM 11.50 purchase.' +
            (outcome.overBalance
                ? ' Your simulated balance moved to ' + formatSenNorm(outcome.remaining) + '. This is a fictional educational state — real wallets generally enforce available-balance or payment authorization rules. '
                : ' ') +
            'Always compare the QR-displayed amount against your receipt before tapping confirm.';
    } else {
        title.textContent = 'Simulated underpayment — short by ' + formatSenNorm(outcome.underpayment);
        message.textContent =
            'You confirmed ' + formatSenNorm(outcome.paid) + ', which is ' + formatSenNorm(outcome.underpayment) +
            ' less than the RM 11.50 receipt total. In a real store the merchant would ask you to settle the remaining balance. Always pay the exact receipt total.';
    }

    paySwitchScreen('p-screen-result');
    animatePayStagger('#p-screen-result .pay-reveal', 10, 0.32);
    if (!REDUCED && hasGsap) {
        track(gsap.fromTo('#pay-result-icon', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: MOTION.d(0.35), ease: MOTION.emphasis }));
    }

    announce(title.textContent + ' ' + message.textContent);
}

function replayImmersivePayScenario() {
    if (!payCinema.active) { launchImmersivePayExperience(); return; }
    state.runId++;
    clearTimers();
    killTimelines();

    payCinema.paid = false;
    resetGame();
    resetPayTheaterDom();

    const chassis = document.getElementById('pay-cinema-chassis');
    if (!REDUCED && hasGsap) {
        track(gsap.fromTo(chassis, { opacity: 0.5, scale: 0.97 }, { opacity: 1, scale: 1, duration: MOTION.d(0.34), ease: MOTION.easeOut }));
    }
    payGoIntro();
    announce('Payment simulation replayed from the café screen.');
}

function exitImmersivePayExperience() {
    if (!payCinema.active) return;
    state.runId++;
    clearTimers();
    killTimelines();

    payCinema.active = false;
    payCinema.paid = false;

    const overlay = document.getElementById('pay-immersive-overlay');
    const siteShell = document.getElementById('site-shell');
    const restoreY = payCinema.savedScrollY;
    const triggerEl = payCinema.triggerElement;

    const completeExit = () => {
        overlay.hidden = true;
        document.body.classList.remove('immersive-lock');
        siteShell.style.opacity = '';
        siteShell.style.transform = '';
        window.scrollTo({ top: restoreY, behavior: 'auto' });
        if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
        resetPayTheaterDom();
        resetGame();
        announce('Exited full-screen payment simulation. Website restored.');
    };

    if (!REDUCED && hasGsap) {
        const tl = track(gsap.timeline({ defaults: { ease: MOTION.easeOut }, onComplete: completeExit }));
        tl.to(overlay, { opacity: 0, duration: MOTION.d(0.28) }, 0)
          .to(siteShell, { scale: 1, opacity: 1, duration: MOTION.d(0.32) }, 0.05);
    } else {
        completeExit();
    }
}

// Global Keyboard Support (Escape for overlays + Left/Right arrows for Explainer)
window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (cinemaScam.active) {
            e.preventDefault();
            exitImmersiveScamExperience();
            return;
        }
        if (payCinema.active) {
            e.preventDefault();
            exitImmersivePayExperience();
            return;
        }
    }

    // Keyboard step navigation when viewing How Online Transactions Work
    if (!cinemaScam.active && !payCinema.active && state.step === 'explainer') {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextStep();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevStep();
        }
    }
});

// ============================================================
// SELF-CHECKS — index.html?selftest
// ============================================================
function runSelfTests() {
    const results = [];
    const t = (name, cond) => results.push((cond ? 'PASS' : 'FAIL') + ' — ' + name);

    const a = calculateOutcome(1150, 10000);
    t('A paid 1150', a.paid === 1150);
    t('A remaining 8850', a.remaining === 8850);
    t('A overpayment 0', a.overpayment === 0);
    t('A not overBalance', a.overBalance === false);

    const b = calculateOutcome(11500, 10000);
    t('B paid 11500', b.paid === 11500);
    t('B remaining -1500', b.remaining === -1500);
    t('B overpayment 10350', b.overpayment === 10350);
    t('B overBalance flag', b.overBalance === true);

    const c = calculateOutcome(5000, 10000);
    t('C overpayment 3850', c.overpayment === 3850 && c.remaining === 5000);

    t('parse 11.50', parseAmountToSen('11.50') === 1150);
    t('parse 11.5',  parseAmountToSen('11.5') === 1150);
    t('parse 11',    parseAmountToSen('11') === 1100);
    t('parse 011.50', parseAmountToSen('011.50') === 1150);
    t('parse 0.50',  parseAmountToSen('0.50') === 50);

    t('reject empty',  parseAmountToSen('') === null);
    t('reject spaces', parseAmountToSen('   ') === null);
    t('reject abc',    parseAmountToSen('abc') === null);
    t('reject 11,50',  parseAmountToSen('11,50') === null);
    t('reject 11.505', parseAmountToSen('11.505') === null);
    t('reject -5',     parseAmountToSen('-5') === null);
    t('reject +5',     parseAmountToSen('+5') === null);
    t('reject 0',      parseAmountToSen('0') === null);
    t('reject 0.00',   parseAmountToSen('0.00') === null);
    t('reject 0.0',    parseAmountToSen('0.0') === null);

    t('fmt -1500', formatSenNorm(-1500) === '-RM 15.00');
    t('fmt 1150',  formatSenNorm(1150) === 'RM 11.50');
    t('fmt 10000', formatSenNorm(10000) === 'RM 100.00');

    state.step = 'intro';
    t('intro→result blocked', transition('result') === false);
    t('intro→scanning ok', transition('scanning') === true);
    state.step = 'review';
    t('review→processing blocked (must confirm first)', transition('processing') === false);
    state.step = 'confirmation';
    t('confirmation→processing ok', transition('processing') === true);
    state.step = 'explainer';
    t('explainer→result ok', transition('result') === true);

    t('6 explainer stages present', EXPLAINER_STEPS.length === 6);
    t('3 outcome profiles present', Boolean(OUTCOME_PROFILES.successful && OUTCOME_PROFILES.declined && OUTCOME_PROFILES.pending));
    t('Live scene preview exists', Boolean(document.getElementById('tx-scene-preview')));
    t('SVG packet badge exists', Boolean(document.getElementById('tx-packet-pill-text')));
    t('Immersive scam overlay exists', Boolean(document.getElementById('scam-immersive-overlay')));
    t('In-phone choices container exists', Boolean(document.getElementById('c-inphone-choices')));
    t('Pay theater overlay exists', Boolean(document.getElementById('pay-immersive-overlay')));
    t('Pay theater phone screens exist', PAY_SCREENS.every(id => document.getElementById(id)));

    resetGame();

    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log(results.join('\n'));
    console.log(failed.length === 0 ? 'ALL 34 TESTS PASSED' : failed.length + ' TEST(S) FAILED');
    return failed.length === 0;
}

if (new URLSearchParams(location.search).has('selftest')) runSelfTests();

// ============================================================
// BOOT & INPUT WIRING
// ============================================================
wireNav();
initSvgPaths();
showSection('landing');
initMagnetics();

const modalInput = document.getElementById('amount-input');
if (modalInput) {
    modalInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveAmount();
        }
    });
    modalInput.addEventListener('input', () => {
        modalInput.classList.remove('invalid');
        document.getElementById('amount-error').hidden = true;
    });
}

const inlineInput = document.getElementById('inline-amount-input');
if (inlineInput) {
    inlineInput.addEventListener('input', () => {
        const inlineErr = document.getElementById('inline-amount-error');
        const parsed = parseAmountToSen(inlineInput.value);
        if (parsed !== null) {
            inlineInput.classList.remove('invalid');
            if (inlineErr) inlineErr.hidden = true;
            state.editedSen = parsed;
            updateReviewVisuals(parsed, false);
        }
    });
    inlineInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            proceedToConfirmation();
        }
    });
}

const payInlineInputEl = document.getElementById('pay-inline-input');
if (payInlineInputEl) {
    payInlineInputEl.addEventListener('input', () => {
        const payErr = document.getElementById('pay-inline-error');
        const parsed = parseAmountToSen(payInlineInputEl.value);
        if (parsed !== null && payCinema.active && state.step === 'review') {
            payInlineInputEl.classList.remove('invalid');
            if (payErr) payErr.hidden = true;
            state.editedSen = parsed;
            // syncInput=false: do not rewrite the field the user is typing in
            payUpdateReviewVisuals(parsed, false);
        }
    });
    // Normalize the typed value when the field loses focus (e.g. "115" -> "115.00")
    payInlineInputEl.addEventListener('blur', () => {
        const parsed = parseAmountToSen(payInlineInputEl.value);
        if (parsed !== null && payCinema.active && state.step === 'review') {
            payInlineInputEl.value = formatSenPlain(parsed);
            payUpdateReviewVisuals(parsed, false);
        }
    });
    payInlineInputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            payProceedToConfirmation();
        }
    });
}