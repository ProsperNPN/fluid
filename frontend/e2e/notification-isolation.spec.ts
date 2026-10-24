import { test, expect, Page } from '@playwright/test';

const api = process.env.FLUID_QA_API || 'http://127.0.0.1:18080';
const password = 'Testing-secure-123!';
async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(donor|hospital)(\/|$)/, { timeout: 60000 });
}

test('publish button reaches two donor sessions, isolates account switch, and routes response', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [a, second, hospital] = await Promise.all(contexts.map(c => c.newPage()));
  try {
    await login(a, 'matching-browser-a@journey.test');
    await a.goto('/donor/notifications');
    await login(second, 'matching-browser-a@journey.test');
    await second.goto('/donor/notifications');
    await login(hospital, 'browser-hospital@test.invalid');
    await expect(a.locator('.portal-header__right [role=status]')).toHaveText('Live');
    await expect(second.locator('.portal-header__right [role=status]')).toHaveText('Live');
    await hospital.goto('/hospital/requests');
    await hospital.getByRole('button', { name: 'Create Request', exact: true }).click();
    await hospital.getByLabel('Blood type', { exact: true }).selectOption('A+');
    await hospital.getByLabel('Component', { exact: true }).selectOption('red_cells');
    await hospital.getByLabel('Urgency', { exact: true }).selectOption('urgent');
    const local = (hours: number) => {
      const date = new Date(Date.now() + hours * 3600000);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    await hospital.getByLabel('Required by', { exact: true }).fill(local(8));
    await hospital.getByLabel('Request expires', { exact: true }).fill(local(6));
    const published = hospital.waitForResponse(r => r.url().endsWith('/api/v1/blood-requests') && r.request().method() === 'POST');
    await hospital.getByRole('button', { name: 'Publish Request', exact: true }).click();
    const publication = await published;
    expect(publication.status(), await publication.text()).toBe(201);
    const rid = (await publication.json()).id;
    const card = (page: Page) => page.locator('article').filter({ has: page.locator(`a[href="/donor/requests?request=${rid}"]`) });
    await expect(card(a)).toBeVisible({ timeout: 30000 });
    await expect(card(second)).toBeVisible({ timeout: 30000 });
    await expect(card(a).getByText('approximately 0 km away', { exact: false })).toBeVisible();
    await card(a).getByRole('button', { name: "I'm Available to Donate" }).click();
    await expect(card(a)).toContainText('Response: pending');
    await hospital.goto('/hospital/notifications');
    await expect(hospital.getByRole('heading', { name: 'Donor response updated' }).first()).toBeVisible({ timeout: 30000 });
    const token = await a.evaluate(() => localStorage.getItem('fluid.access_token'));
    const own = await a.request.get(`${api}/api/v1/notifications`, { headers: { Authorization: `Bearer ${token}` } });
    const nid = (await own.json()).items.find((n: { payload?: { request_id: string } }) => n.payload?.request_id === rid).id;

    // Another tab signs into B in the SAME browser storage while this page has A's cards mounted.
    let held = false;
    let release!: () => void;
    let captured!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const oldResponse = new Promise<void>(resolve => { captured = resolve; });
    await a.route('**/api/v1/notifications?**', async route => {
      if (held) { await route.continue(); return; }
      held = true;
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response }).catch(() => undefined);
    });
    await a.evaluate(() => window.dispatchEvent(new Event('fluid:live-update')));
    await oldResponse;
    const tab = await contexts[0].newPage();
    await tab.goto('/donor/notifications');
    await tab.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(tab).toHaveURL(/auth\/login/);
    await login(tab, 'matching-browser-b@journey.test');
    await tab.goto('/donor/notifications');
    release();
    await expect(card(a)).toHaveCount(0, { timeout: 10000 });
    await expect(card(tab)).toHaveCount(0);
    const foreign = await tab.evaluate(async ({ api, nid }) => {
      const response = await fetch(`${api}/api/v1/notifications/${nid}/read`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${localStorage.getItem('fluid.access_token')}` },
      });
      return response.status;
    }, { api, nid });
    expect(foreign).toBe(404);
    await a.reload();
    await expect(card(a)).toHaveCount(0);
    // A's independent second device retains its own private history.
    await second.reload();
    await expect(card(second)).toBeVisible();
  } finally { await Promise.allSettled(contexts.map(c => c.close())); }
});
