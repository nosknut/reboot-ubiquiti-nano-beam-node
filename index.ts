import * as dotenv from 'dotenv';
import puppeteer from 'puppeteer';

dotenv.config({
    override: true,
});

const { USERNAME, PASSWORD, DEFAULT_GATEWAY } = process.env;

if (!USERNAME) throw new Error('USERNAME is not defined');
if (!PASSWORD) throw new Error('PASSWORD is not defined');
if (!DEFAULT_GATEWAY) throw new Error('DEFAULT_GATEWAY is not defined');

const login = async (username: string, password: string, default_gateway: string) => {
    const browser = await puppeteer.launch({
        headless: "new",
        ignoreHTTPSErrors: true
    });

    console.log("[1/5] Opening page ...")
    const page = await browser.newPage();
    await page.goto(default_gateway, { waitUntil: 'networkidle2' });

    console.log("[2/5] Logging in ...")
    await page.type('#loginform-username', username);
    await page.type('#loginform-password', password);
    await page.click('[type="submit"][name="login"]');

    console.log("[3/5] Confirming login ...")
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    console.log("[4/5] Rebooting connection ...")
    const refreshButton = await page.$$('.ubnt-icon--refresh');
    await refreshButton[0].click();
    
    console.log("[5/5] Done!")
    await page.close();
    await browser.close();
};

const main = async () => {
    await login(USERNAME, PASSWORD, DEFAULT_GATEWAY);
};

main().catch(console.error);
