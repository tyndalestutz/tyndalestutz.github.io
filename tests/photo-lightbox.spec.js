const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { readdirSync } = require('node:fs');

const pages = readdirSync('.').filter(name => name.endsWith('.html')).sort();
const baseRef = process.env.PHOTO_BASE_REF || 'main';
const images = 'img:not(.photo-lightbox__image)';

test.beforeEach(async ({ page }) => {
    // Keep comparisons deterministic: no remote fonts, MathJax or random videos.
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
});

async function settle(page) {
    await page.evaluate(async () => {
        await Promise.all([...document.images].filter(img => img.src).map(img => img.decode().catch(() => {})));
        await document.fonts.ready;
    });
    await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
}

async function geometry(page) {
    return page.evaluate(() => [...document.body.querySelectorAll('*')]
        .filter(el => !el.closest('.photo-lightbox') && !['SCRIPT', 'STYLE'].includes(el.tagName))
        .map(el => {
            const rect = el.getBoundingClientRect();
            const css = getComputedStyle(el);
            return {
                tag: el.tagName,
                x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height,
                display: css.display, font: css.font, color: css.color,
                margin: css.margin, padding: css.padding, float: css.cssFloat,
            };
        }));
}

for (const width of [1440, 390, 320]) {
    test(`closed viewer preserves every page at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        for (const name of pages) {
            // Serve the actual pre-change HTML and CSS at the same origin.
            const baseline = async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== '127.0.0.1') return route.fallback();
                const pathname = url.pathname.slice(1);
                if (pathname.endsWith('.html') || pathname.endsWith('.css')) {
                    const body = execFileSync('git', ['show', `${baseRef}:${pathname}`]);
                    return route.fulfill({ body, contentType: pathname.endsWith('.css') ? 'text/css' : 'text/html' });
                }
                return route.fallback();
            };
            await page.route('**/*', baseline);
            await page.goto(`/${name}`);
            await settle(page);
            const before = await geometry(page);
            const screenshotOptions = { fullPage: true, scale: 'css', style: 'img[src$=".gif"] { visibility: hidden !important; }' };
            const beforeShot = await page.screenshot(screenshotOptions);
            await page.unroute('**/*', baseline);
            await page.goto(`/${name}`);
            await settle(page);
            expect(await geometry(page), name).toEqual(before);
            const afterShot = await page.screenshot(screenshotOptions);
            if (!beforeShot.equals(afterShot)) {
                await testInfo.attach(`${name}-before`, { body: beforeShot, contentType: 'image/png' });
                await testInfo.attach(`${name}-after`, { body: afterShot, contentType: 'image/png' });
            }
            expect(afterShot.equals(beforeShot), `${name}: identical pixels (GIFs hidden)`).toBe(true);
        }
    });
}

test('every existing photo opens and returns without moving the page', async ({ page }, testInfo) => {
    for (const name of pages) {
        await page.goto(`/${name}`);
        await settle(page);
        const originals = page.locator(images);
        await expect(page.locator('.photo-lightbox-trigger')).toHaveCount(await originals.count());
        for (const image of await originals.all()) {
            if (!await image.evaluate(img => img.naturalWidth > 0)) continue; // Existing missing asset on resume.html.
            await image.scrollIntoViewIfNeeded();
            const before = await geometry(page);
            const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
            const source = await image.evaluate(img => img.currentSrc);
            await image.click();
            const dialog = page.getByRole('dialog', { name: 'Enlarged photo' });
            await expect(dialog).toBeVisible();
            const enlarged = dialog.locator('img');
            await expect(enlarged).toHaveAttribute('src', source);
            await enlarged.evaluate(img => img.decode());
            expect(await enlarged.evaluate(img => {
                const r = img.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 &&
                    r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 &&
                    Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight) < 0.01;
            })).toBe(true);
            // Also check the background geometry while the scrollbar is locked.
            expect(await geometry(page), `${name}: open background`).toEqual(before);
            if (source.endsWith('/fsot-1.jpeg')) {
                await page.screenshot({ path: testInfo.outputPath('photo-viewer.png') });
            }
            await enlarged.click();
            await expect(dialog).not.toBeVisible();
            await expect(image).toBeFocused();
            expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
            expect(await geometry(page), `${name}: closed again`).toEqual(before);
        }
    }
});

test('keyboard, all close controls, focus confinement and scroll lock', async ({ page }, testInfo) => {
    await page.goto('/projects.html');
    await settle(page);
    const image = page.locator('.photo-lightbox-trigger').last();
    const dialog = page.getByRole('dialog');
    const close = page.getByRole('button', { name: 'Close enlarged photo' });
    await image.focus();
    const scroll = await page.evaluate(() => scrollY);
    for (const key of ['Enter', 'Space']) {
        await page.keyboard.press(key);
        await expect(dialog).toBeVisible();
        await expect(close).toBeFocused();
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement.closest('dialog') !== null)).toBe(true);
        await page.keyboard.press('Shift+Tab');
        if (!testInfo.project.use.isMobile) await page.mouse.wheel(0, 600);
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => scrollY)).toBe(scroll);
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(image).toBeFocused();
        expect(await page.evaluate(() => scrollY)).toBe(scroll);
    }
    await image.click();
    await close.click();
    await expect(dialog).not.toBeVisible();
    await image.click();
    await page.mouse.click(4, 4); // Outside both the photo and Close button.
    await expect(dialog).not.toBeVisible();
    await expect(image).toBeFocused();
    await image.click();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(close).toBeInViewport();
    await expect(dialog.locator('img')).toBeInViewport({ ratio: 1 });
    await close.click();
});

test('touch opens and closes the viewer', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'Touch device only');
    await page.goto('/misc.html');
    await settle(page);
    const image = page.locator('.photo-lightbox-trigger').first();
    await image.tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.touchscreen.tap(4, 4);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await image.tap();
    await page.getByRole('dialog').locator('img').tap();
    await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('new HTML photos work automatically and image links keep navigation', async ({ page }) => {
    await page.route('**/fixture.html', route => route.fulfill({ contentType: 'text/html', body: `
        <!doctype html><html><head>
        <link rel="stylesheet" href="/assets/photo-lightbox.css">
        <script src="/assets/photo-lightbox.js" defer></script></head><body>
        <img src="/assets/images/profile.jpeg" alt="A new photo">
        <a href="/misc.html"><img src="/assets/images/airy.png" alt="Visit misc"></a>
        </body></html>` }));
    await page.goto('/fixture.html');
    await settle(page);
    await page.getByRole('button', { name: 'Enlarge photo: A new photo' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Visit misc' }).click();
    await expect(page).toHaveURL(/misc\.html$/);
});

test('browsers without native dialogs retain the original images', async ({ page }) => {
    await page.addInitScript(() => { HTMLDialogElement.prototype.showModal = undefined; });
    await page.goto('/misc.html');
    await settle(page);
    await expect(page.locator('img').first()).toBeVisible();
    await expect(page.locator('.photo-lightbox, .photo-lightbox-trigger')).toHaveCount(0);
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveURL(/projects\.html$/);
});

test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('the original photos and links still render', async ({ page }) => {
        await page.goto('/misc.html');
        await expect(page.locator('img').first()).toBeVisible();
        await expect(page.locator('.photo-lightbox')).toHaveCount(0);
        await page.getByRole('link', { name: 'Projects', exact: true }).click();
        await expect(page).toHaveURL(/projects\.html$/);
        await page.waitForLoadState('load');
    });
});
