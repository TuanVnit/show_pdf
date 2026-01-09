const puppeteer = require('puppeteer');

(async () => {
    const targetUrl = process.argv[2]; // Get URL from command line argument

    if (!targetUrl) {
        console.error('Please provide a URL. Example: node debug_browser.js https://google.com');
        process.exit(1);
    }

    console.log(`Launching visual browser for: ${targetUrl}`);

    const browser = await puppeteer.launch({
        headless: false, // Visual mode
        slowMo: 50,      // Slight delay to see actions
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
        defaultViewport: null
    });

    const page = await browser.newPage();

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Page loaded successfully.');

        // Keep the browser open for manual inspection until user closes script or timeout
        // We'll keep it open for 5 minutes max, or until the script is killed
        await new Promise(r => setTimeout(r, 300000));

    } catch (e) {
        console.error('Browser Error:', e.message);
    } finally {
        await browser.close();
    }
})();
