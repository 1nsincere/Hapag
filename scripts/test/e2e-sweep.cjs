// Full click-through bug sweep (customer, cashier, kitchen, admin). Run via: npm run test:e2e
// isolated (a failure is recorded, the sweep continues). Page/console errors are logged.
const { chromium } = require('playwright-core')
const path = require('path')
const [BASE, OUT, TOKEN] = process.argv.slice(2)
const results = []
const errors = []
async function step(name, fn) {
  // Cashier steps start from a freshly loaded cashier screen so one failure can't cascade
  if (/^cashier:|^customer without/.test(name) && global.CASHIER && global.FRESH) {
    await global.CASHIER.reload({ waitUntil: 'load' }).catch(() => {})
    await global.CASHIER.waitForTimeout(3000)
  }
  try { await fn(); results.push([true, name]); console.log('OK   ' + name) }
  catch (e) {
    results.push([false, name])
    const why = e.message.split('\n').filter(l => /intercepts|not visible|not enabled|not stable|element is|waiting for/.test(l)).slice(0, 4).join(' | ')
    console.log('FAIL ' + name + '  — ' + e.message.split('\n')[0].slice(0, 120) + (why ? '  [' + why.slice(0, 400) + ']' : ''))
  }
}
function watch(page, who) {
  page.on('response', r => { if (r.status() === 404) errors.push('[' + who + '] 404: ' + r.url().slice(0, 140)) })
  page.on('pageerror', e => errors.push(`[${who}] pageerror: ${String(e).slice(0, 180)}`))
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/DevTools|favicon|Download the React/.test(t)) return
    errors.push(`[${who}] console: ${t.slice(0, 180)}`)
  })
}
async function staff(browser, email, pass, dest) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  watch(page, dest)
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/login?callbackUrl=${dest}`, { waitUntil: 'load' })
    await page.fill('input[type=email]', email); await page.fill('input[type=password]', pass)
    await page.click('button[type=submit]')
    try { await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }); break } catch { if (i === 2) throw new Error('login failed') }
  }
  await page.waitForTimeout(2500)
  return page
}
// Accept the next confirm() box — clears any leftover listener first
const acceptNextDialog = page => { page.removeAllListeners('dialog'); page.once('dialog', d => d.accept().catch(() => {})) }
const alerts = p => p.locator('[aria-label="Alerts that need action"] > div')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const cashier = await staff(browser, 'cashier@restaurant.com', 'cashier123', '/cashier')
  const kitchen = await staff(browser, 'kitchen@restaurant.com', 'kitchen123', '/kitchen')
  cashier.setDefaultTimeout(12000); kitchen.setDefaultTimeout(12000)
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
  watch(phone, 'customer'); phone.setDefaultTimeout(12000)
  let orderId = ''
  global.PAGES = { cashier, kitchen, phone }
  global.CASHIER = cashier

  // ══ CUSTOMER ══
  await step('customer: welcome → menu', async () => {
    await phone.goto(`${BASE}/menu/1?t=${TOKEN}`, { waitUntil: 'load' })
    await phone.getByRole('button', { name: /view the menu/i }).click()
    await phone.waitForSelector('.hp-dish', { timeout: 30000 })
  })
  await step('customer: search finds "sisig", clearing restores menu', async () => {
    await phone.getByRole('button', { name: 'Search the menu' }).click()
    await phone.getByRole('searchbox').fill('sisig')
    await phone.getByText('Results').waitFor()
    if (await phone.locator('.hp-dish').count() !== 1) throw new Error('expected 1 result, got ' + await phone.locator('.hp-dish').count())
    await phone.getByRole('button', { name: 'Close search' }).click()
    if (await phone.locator('.hp-dish').count() < 10) throw new Error('menu not restored')
  })
  await step('customer: category tab jumps to section', async () => {
    await phone.getByRole('button', { name: 'Drinks', exact: true }).click()
    await phone.waitForTimeout(900)
    const top = await phone.locator('#cat-drinks').evaluate(el => el.getBoundingClientRect().top)
    if (top < 0 || top > 260) throw new Error('Drinks section top at ' + Math.round(top))
  })
  await step('customer: dish sheet — pick 16 oz Mango Shake ×2 and add', async () => {
    await phone.getByRole('button', { name: /Choose options for Mango Shake/ }).click()
    await phone.getByRole('radio', { name: /16 oz/ }).click()
    await phone.getByRole('button', { name: /Add one Mango Shake/ }).click()
    await phone.locator('.hp-sheet-foot .hp-btn-primary').click()
    await phone.getByRole('button', { name: /view order/i }).waitFor()
  })
  await step('customer: quick-add Garlic Rice', async () => {
    await phone.getByRole('button', { name: 'Add Garlic Rice' }).click()
  })
  await step('customer: cart totals correct (2×175 + 60 = 410 + 12% tax)', async () => {
    await phone.getByRole('button', { name: /view order/i }).click()
    const txt = await phone.locator('.hp-sheet').innerText()
    if (!/₱410\.00/.test(txt)) throw new Error('subtotal 410 not shown')
  })
  await step('customer: cart +/- works', async () => {
    await phone.getByRole('button', { name: 'Add one Garlic Rice' }).click()
    await phone.getByRole('button', { name: 'Remove one Garlic Rice' }).click()
    const txt = await phone.locator('.hp-sheet').innerText()
    if (!/₱410\.00/.test(txt)) throw new Error('subtotal changed unexpectedly')
  })
  await step('customer: notes + review + send order', async () => {
    await phone.getByPlaceholder(/Allergies/).fill('Less ice please')
    await phone.getByRole('button', { name: /review order/i }).click()
    await phone.getByRole('button', { name: /send order/i }).click()
    await phone.waitForURL(/\/status\//, { timeout: 30000 })
    orderId = phone.url().split('/').pop()
    await phone.getByText('Order sent', { exact: true }).first().waitFor()
  })

  // ══ CASHIER: accept via Orders tab ══
  await step('cashier: alert appears for the new order', async () => {
    await alerts(cashier).filter({ hasText: 'New order' }).filter({ hasText: 'Table 1' }).first().waitFor({ timeout: 20000 })
  })
  await step('cashier: Review → Orders tab, accept there; alert clears', async () => {
    await alerts(cashier).filter({ hasText: 'Table 1' }).getByRole('button', { name: 'Review' }).first().click()
    await cashier.getByRole('button', { name: /Accept Order/ }).first().click()
    await alerts(cashier).filter({ hasText: 'New order' }).filter({ hasText: 'Table 1' }).first().waitFor({ state: 'detached', timeout: 15000 })
  })

  // ══ CUSTOMER: checkout ══
  await step('customer: Pay now → checkout', async () => {
    await phone.getByRole('link', { name: /pay now/i }).click({ timeout: 20000 })
    await phone.waitForURL(/\/checkout\//)
    await phone.getByText('Your order').first().waitFor()
  })
  await step('customer: add-on, 10% tip, card', async () => {
    await phone.getByRole('button', { name: 'Add Bagoong Rice' }).click()
    await phone.getByRole('radio', { name: /10%/ }).click()
    await phone.getByRole('radio', { name: /Debit \/ credit card/ }).click()
  })
  await step('customer: removing last unit asks to confirm (Keep it)', async () => {
    await phone.getByRole('button', { name: 'Remove one Bagoong Rice' }).click()
    await phone.getByRole('button', { name: 'Keep it' }).click()
    if (!(await phone.getByText('Bagoong Rice').count())) throw new Error('item vanished')
  })
  await step('customer: confirm & pay → receipt with tip and total', async () => {
    await phone.getByRole('button', { name: /^Pay ·/ }).click()
    await phone.getByRole('button', { name: /confirm & pay/i }).click()
    // Practice payment page (stands in for PayMongo/Xendit) → Pay → signed webhook → receipt
    await phone.waitForURL(/\/pay\/practice\//, { timeout: 30000 })
    await phone.getByText('Practice payment.').waitFor()
    await phone.getByRole('button', { name: /^Pay ₱/ }).click()
    await phone.waitForURL(/\/confirmation\//, { timeout: 30000 })
    await phone.getByText('Total paid').waitFor({ timeout: 15000 }).catch(() => {})
    await phone.waitForTimeout(1500) // let the fade-in finish, like a person would
    await phone.screenshot({ path: path.join(OUT, 'sweep-receipt.png'), fullPage: true })
    const txt = await phone.locator('main').innerText()
    if (!/total paid/i.test(txt) || !/tip/i.test(txt)) throw new Error('receipt missing tip/total: ' + txt.replace(/s+/g, ' ').slice(0, 300))
  })

  // ══ KITCHEN ══
  await step('kitchen: ticket arrives with all items', async () => {
    const ticket = kitchen.locator('div.rounded-lg.border-2').filter({ hasText: 'Mango Shake' }).filter({ hasText: 'Bagoong Rice' }).first()
    await ticket.waitFor({ timeout: 20000 })
  })
  await step('kitchen: Start cooking → Mark ready', async () => {
    const ticket = kitchen.locator('div.rounded-lg.border-2').filter({ hasText: 'Mango Shake' }).filter({ hasText: 'Bagoong Rice' }).first()
    await ticket.getByRole('button', { name: /start cooking/i }).click()
    await kitchen.waitForTimeout(1200)
    await ticket.getByRole('button', { name: /mark ready/i }).click()
  })
  await step('cashier: "Ready to serve" alert → Mark served', async () => {
    const card = alerts(cashier).filter({ hasText: 'Ready to serve' }).filter({ hasText: 'Table 1' }).first()
    await card.waitFor({ timeout: 20000 })
    await card.getByRole('button', { name: 'Mark served' }).click()
    await card.waitFor({ state: 'detached', timeout: 15000 })
  })
  await step('customer: status shows "Enjoy your meal"', async () => {
    await phone.goto(`${BASE}/status/${orderId}`, { waitUntil: 'load' })
    await phone.getByText('Enjoy your meal').first().waitFor({ timeout: 20000 })
  })
  await step('kitchen: History lists the served order', async () => {
    await kitchen.getByRole('button', { name: 'Order History' }).click()
    await kitchen.getByText('#' + orderId.slice(0, 6)).first().waitFor({ timeout: 15000 })
    await kitchen.getByRole('button', { name: 'Live Feed' }).click()
  })
  await step('kitchen: Table Status view renders', async () => {
    await kitchen.getByRole('button', { name: 'Table Status' }).click()
    await kitchen.getByText(/Available \(/).first().waitFor()
    await kitchen.getByRole('button', { name: 'Live Feed' }).click()
  })

  // ══ CASHIER: tables, walk-in, panels ══
  global.FRESH = true
  await step('cashier: table 1 shows "Ready to clear" then Clear table', async () => {
    await cashier.getByRole('button', { name: /^.*Tables/ }).first().click()
    await cashier.getByRole('button', { name: /Table 1,/ }).first().click()
    await cashier.getByText('Everything is served and paid').waitFor({ timeout: 15000 })
    acceptNextDialog(cashier)
    await cashier.getByRole('button', { name: /Clear table/ }).click()
    await cashier.getByRole('button', { name: 'Seat guests' }).waitFor({ timeout: 10000 })
    await cashier.waitForTimeout(2000)
  })
  await step('cashier: reserve a free table, then cancel reservation', async () => {
    await cashier.getByRole('button', { name: /^.*Tables/ }).first().click()
    await cashier.getByRole('button', { name: /Table 1,/ }).first().click()
    await cashier.getByRole('button', { name: 'Reserve' }).click()
    await cashier.getByRole('button', { name: 'Cancel reservation' }).click({ timeout: 10000 })
    await cashier.getByRole('button', { name: 'Seat guests' }).waitFor({ timeout: 10000 })
  })
  await step('cashier: table order history modal opens & closes', async () => {
    await cashier.getByRole('button', { name: /^.*Tables/ }).first().click()
    await cashier.getByRole('button', { name: /Table 1,/ }).first().click()
    await cashier.screenshot({ path: path.join(OUT, 'before-history.png') })
    await cashier.getByRole('button', { name: /View Order History/ }).click()
    await cashier.waitForTimeout(2000)
    await cashier.screenshot({ path: path.join(OUT, 'sweep-history.png') })
    await cashier.getByText(/Table 1 History/).waitFor()
    await cashier.mouse.click(10, 450) // click the backdrop to close
    await cashier.getByText(/Table 1 History/).waitFor({ state: 'detached', timeout: 5000 })
  })
  await step('cashier: big floor plan toggle + back to menu', async () => {
    await cashier.getByRole('tab', { name: /Floor plan/ }).click()
    await cashier.getByText('Tap a table to see its orders').waitFor()
    await cashier.getByRole('tab', { name: /Menu/ }).click()
  })
  await step('cashier: walk-in takeout sale (cash, exact amount)', async () => {
    await cashier.getByRole('button', { name: /^.*Cart/ }).first().click()
    await cashier.locator('[role="button"]').filter({ hasText: 'Beef Tapa' }).first().click()
    await cashier.getByRole('button', { name: 'Takeout', exact: true }).click()
    await cashier.getByPlaceholder('Customer name or order number').fill('Sweep test')
    await cashier.getByRole('button', { name: /^Exact/ }).click()
    await cashier.getByRole('button', { name: /Complete Sale/ }).click()
    await cashier.waitForTimeout(4000)
  })
  await step('kitchen: takeout walk-in appears', async () => {
    await kitchen.locator('div.rounded-lg.border-2').filter({ hasText: 'Takeout' }).filter({ hasText: 'Beef Tapa' }).first().waitFor({ timeout: 20000 })
  })
  await step('cashier: How it works, bell, history, settings panels open', async () => {
    await cashier.getByRole('button', { name: 'How it works' }).click()
    await cashier.getByText('How Hapag works').waitFor()
    await cashier.keyboard.press('Escape')
    await cashier.getByRole('button', { name: 'Notifications' }).click(); await cashier.waitForTimeout(400)
    await cashier.keyboard.press('Escape'); await cashier.mouse.click(10, 450); await cashier.waitForTimeout(400)
    await cashier.getByRole('button', { name: 'Transaction History' }).click(); await cashier.waitForTimeout(400)
    await cashier.keyboard.press('Escape')
  })

  // ══ CUSTOMER: call staff ══
  await step('customer: Call staff → cashier alert → On my way', async () => {
    await phone.getByRole('button', { name: /call staff/i }).click()
    const card = alerts(cashier).filter({ hasText: 'is calling for staff' }).first()
    await card.waitFor({ timeout: 20000 })
    await card.getByRole('button', { name: 'On my way' }).click()
    await card.waitFor({ state: 'detached', timeout: 15000 })
  })
  await step('customer: another device cannot open this order', async () => {
    const other = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await other.goto(`${BASE}/status/${orderId}`, { waitUntil: 'load' })
    await other.getByText('Order not found').waitFor({ timeout: 20000 })
    await other.context().close()
  })

  await step('cashier: Show served / Hide served toggles the list (nothing deleted)', async () => {
    await cashier.getByRole('button', { name: /QR\s*Orders/ }).first().click()
    const toggle = cashier.getByRole('button', { name: /Show served/ })
    await toggle.click()
    await cashier.getByRole('button', { name: 'Hide served' }).waitFor()
    if (!(await cashier.getByText('#' + orderId.slice(0, 8)).count())) throw new Error('served order not shown')
    await cashier.getByRole('button', { name: 'Hide served' }).click()
    await cashier.getByRole('button', { name: /Show served/ }).waitFor()
  })
  await step('customer without QR code browsing /menu/1 does NOT seat the table', async () => {
    const nosy = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await nosy.goto(BASE + '/menu/1', { waitUntil: 'load' })
    await nosy.getByRole('button', { name: /view the menu/i }).click()
    await nosy.waitForTimeout(4000)
    await nosy.context().close()
    await cashier.getByRole('button', { name: /^.*Tables/ }).first().click()
    const t1 = cashier.getByRole('button', { name: /Table 1,/ }).first()
    const label = await t1.getAttribute('aria-label')
    if (!/available/.test(label)) throw new Error('table 1 became: ' + label)
  })
  await step('cashier: End shift signs out to the login screen', async () => {
    await cashier.getByRole('button', { name: /settings/i }).last().click()
    acceptNextDialog(cashier)
    await cashier.getByRole('button', { name: /end shift/i }).click()
    await cashier.waitForURL(/\/login/, { timeout: 20000 })
  })

  // ══ ADMIN ══
  const admin = await staff(browser, 'admin@restaurant.com', 'admin123', '/admin')
  await step('admin: insights renders', async () => { await admin.getByRole('button', { name: 'Insights' }).click(); await admin.waitForTimeout(1500) })
  await step('admin: add a dish, then delete it', async () => {
    await admin.getByRole('button', { name: 'Menu Manager' }).click()
    await admin.getByRole('button', { name: /ADD NEW ITEM/ }).click()
    await admin.getByPlaceholder('e.g. Iced Caramel Latte').fill('ZZ Sweep Dish')
    const price = admin.locator('input[type=number]').first()
    await price.fill('99')
    await admin.getByRole('button', { name: /^Add dish/ }).click()
    await admin.getByText('ZZ Sweep Dish').first().waitFor({ timeout: 15000 })
    const card = admin.locator('div.rounded-2xl').filter({ hasText: 'ZZ Sweep Dish' }).first()
    acceptNextDialog(admin)
    await card.getByRole('button', { name: /delete/i }).first().click()
    const confirm = admin.getByRole('button', { name: /^(Delete|Yes, delete|Confirm)/ }).last()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await admin.getByText('ZZ Sweep Dish').first().waitFor({ state: 'detached', timeout: 15000 })
  })
  await step('admin: create table 42 → QR has secret code → delete it', async () => {
    await admin.getByRole('button', { name: 'Table Management' }).click()
    await admin.getByRole('button', { name: /CREATE TABLE/ }).click()
    await admin.getByPlaceholder('1', { exact: true }).fill('42')
    await admin.getByPlaceholder('e.g., Window Seat').fill('ZZ Sweep')
    await admin.getByRole('button', { name: 'Create Table', exact: true }).click()
    const url = admin.locator('p', { hasText: /\/menu\/42\?t=/ }).first()
    await url.waitFor({ timeout: 20000 })
    const card = admin.locator('div.rounded-2xl').filter({ has: url }).first()
    await card.locator('button.bg-red-50').first().click()
    const confirm = admin.getByRole('button', { name: /^(Delete|Delete Table|Yes)/ }).last()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await url.waitFor({ state: 'detached', timeout: 15000 })
  })
  await step('admin: print QR modal opens', async () => {
    await admin.getByRole('button', { name: /Print QR/ }).first().click()
    await admin.waitForTimeout(800)
    await admin.screenshot({ path: path.join(OUT, 'sweep-print.png') })
    await admin.keyboard.press('Escape')
    const close = admin.getByRole('button', { name: /close|cancel/i }).last()
    if (await close.isVisible().catch(() => false)) await close.click()
  })
  await step('admin: floor plan + settings render', async () => {
    await admin.getByRole('button', { name: 'Floor Plan' }).click()
    await admin.getByRole('button', { name: /Ground Floor/ }).first().waitFor({ timeout: 30000 })
    await admin.getByRole('button', { name: 'System Settings' }).click()
    await admin.getByText('QR code address').waitFor()
  })

  // ══ STAFF ACCOUNTS ══ (one fixed test login, reused across runs)
  const STAFF_EMAIL = 'zz-sweep-cashier@hapag.test', STAFF_PASS = 'sweep-pass-123'
  const staffRow = () => admin.locator('li').filter({ hasText: STAFF_EMAIL }).first()
  await step('admin: add a cashier on the Staff page (or reactivate the test one)', async () => {
    await admin.getByRole('button', { name: 'Staff' }).click()
    await admin.getByText('Add a staff member').waitFor()
    await admin.waitForTimeout(1500)
    if (await staffRow().count()) {
      const reactivate = staffRow().getByRole('button', { name: 'Reactivate' })
      if (await reactivate.count()) { await reactivate.click(); await staffRow().getByRole('button', { name: 'Deactivate' }).waitFor() }
      return
    }
    await admin.getByPlaceholder('e.g. Maria Santos').fill('ZZ Sweep Cashier')
    await admin.getByPlaceholder('maria@yourrestaurant.com').fill(STAFF_EMAIL)
    await admin.getByPlaceholder('At least 6 characters').fill(STAFF_PASS)
    await admin.getByRole('radio', { name: /Cashier/ }).click()
    await admin.getByRole('button', { name: /Add staff member/ }).click()
    await admin.getByText(/can log in now/).waitFor({ timeout: 20000 })
    await staffRow().waitFor()
  })
  const loginAs = async (email, pass) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    watch(page, 'staff-login')
    await page.goto(`${BASE}/login`, { waitUntil: 'load' })
    await page.fill('input[type=email]', email); await page.fill('input[type=password]', pass)
    await page.click('button[type=submit]')
    return page
  }
  await step('new cashier logs in and lands on the cashier screen', async () => {
    const page = await loginAs(STAFF_EMAIL, STAFF_PASS)
    await page.waitForURL(/\/(pos|cashier)/, { timeout: 40000 })
    await page.getByText('Cashier POS').waitFor({ timeout: 20000 })
    await page.context().close()
  })
  await step('new cashier CANNOT open the admin page', async () => {
    const page = await loginAs(STAFF_EMAIL, STAFF_PASS)
    await page.waitForURL(/\/(pos|cashier)/, { timeout: 40000 })
    await page.goto(`${BASE}/admin`, { waitUntil: 'load' })
    await page.waitForURL(/\/unauthorized/, { timeout: 20000 })
    await page.context().close()
  })
  await step('admin deactivates them → their login is refused', async () => {
    acceptNextDialog(admin)
    await staffRow().getByRole('button', { name: 'Deactivate' }).click()
    await staffRow().getByRole('button', { name: 'Reactivate' }).waitFor({ timeout: 15000 })
    const page = await loginAs(STAFF_EMAIL, STAFF_PASS)
    await page.getByText(/isn’t set up as staff, or it was deactivated/).waitFor({ timeout: 40000 })
    if (!page.url().includes('/login')) throw new Error('deactivated user got in: ' + page.url())
    await page.context().close()
  })
  await step('wrong password shows a clear message', async () => {
    const page = await loginAs('cashier@restaurant.com', 'definitely-wrong')
    await page.getByText('Wrong email or password').waitFor({ timeout: 30000 })
    await page.context().close()
  })

  console.log(`\n${results.filter(r => r[0]).length}/${results.length} steps passed`)
  results.filter(r => !r[0]).forEach(r => console.log('  ✗ ' + r[1]))
  console.log(`\nErrors captured (${errors.length}):`)
  ;[...new Set(errors)].slice(0, 25).forEach(e => console.log('  ' + e))
  await browser.close()
  process.exit(results.some(r => !r[0]) ? 1 : 0)
})().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
