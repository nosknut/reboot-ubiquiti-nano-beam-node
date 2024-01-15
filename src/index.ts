import axios from 'axios';
import * as dotenv from 'dotenv';
import https from 'https';
import * as log4js from 'log4js';
import cron from 'node-cron';
import puppeteer from 'puppeteer';

log4js.configure({
    appenders: {
        console: { type: 'console' },
        file: { type: 'file', filename: '.logs/reboot-ubiquiti-nano-beam-node.log' },
    },
    categories: {
        default: { appenders: ['console', 'file'], level: 'trace' },
    },
});

const logger = log4js.getLogger("reboot-ubiquiti-nano-beam-node");

logger.level = "trace";

dotenv.config({
    override: true,
});

const { USERNAME, PASSWORD, DEFAULT_GATEWAY, STAIF, CRON_INTERVAL } = process.env;

if (!USERNAME) throw new Error('USERNAME is not defined');
if (!PASSWORD) throw new Error('PASSWORD is not defined');
if (!DEFAULT_GATEWAY) throw new Error('DEFAULT_GATEWAY is not defined');
if (!STAIF) throw new Error('STAIF is not defined');
if (!CRON_INTERVAL) throw new Error('CRON_INTERVAL is not defined');

const rebootWithPuppeteer = async (username: string, password: string, defaultGateway: string) => {
    const browser = await puppeteer.launch({
        headless: "new",
        ignoreHTTPSErrors: true
    });

    logger.debug("[1/5] Opening page ...")
    const page = await browser.newPage();
    await page.goto(defaultGateway, { waitUntil: 'networkidle2' });

    logger.debug("[2/5] Logging in ...")
    await page.type('#loginform-username', username);
    await page.type('#loginform-password', password);
    await page.click('[type="submit"][name="login"]');

    logger.debug("[3/5] Confirming login ...")
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    logger.debug("[4/5] Rebooting connection ...")
    const refreshButton = await page.$$('.ubnt-icon--refresh');
    await refreshButton[0].click();

    logger.debug("[5/5] Done!")
    await page.close();
    await browser.close();
};

export const toSearchParams = (obj: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const key in obj) {
        params.append(key, obj[key]);
    }
    return params;
};

const parseBoardInfo = (boardInfo: string) => {
    return boardInfo
        .split("\n")
        .map((line: string) => line.split("="))
        .reduce((acc: Record<string, string>, [key, value]: string[]) => {
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
}

const rebootWithHttpRequests = async (
    username: string,
    password: string,
    defaultGateway: string,
    staif: string,
) => {

    // At request level
    const agent = new https.Agent({
        rejectUnauthorized: false,
    });

    const authRes = await axios({
        url: defaultGateway + "/api/auth",
        httpsAgent: agent,
        method: "post",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        data: toSearchParams({ username, password }).toString(),
    });

    const xcsrfid = authRes.headers["x-csrf-id"];

    if (!xcsrfid) {
        throw new Error("x-csrf-id not found");
    }

    const boardInfo = parseBoardInfo(authRes.data.boardinfo)

    // Separate each second character with a colon: ABCDEF -> AB:CD:EF
    const staid = boardInfo["board.hwaddr"].replace(/..\B/g, '$&:')

    if (!staid) {
        throw new Error("staid not found");
    }

    const cookies = authRes.headers['set-cookie']?.map((cookie: string) => cookie.split(';')[0]).join('; ');

    await axios({
        url: defaultGateway + "/stakick.cgi",
        method: "post",
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "x-csrf-id": xcsrfid,
            "Cookie": cookies,
        },
        data: toSearchParams({ staif, staid }),
    });
}

const reboot = () => {
    logger.info("Rebooting ...")
    rebootWithHttpRequests(USERNAME, PASSWORD, DEFAULT_GATEWAY, STAIF).catch(console.error);
};

reboot();

logger.info("Running as cron job")
cron.schedule(CRON_INTERVAL, () => {
    reboot();
})
