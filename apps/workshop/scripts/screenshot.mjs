#!/usr/bin/env node
/**
 * Workshop UI screenshot utility
 *
 * Usage:
 *   node scripts/workshop-screenshot.mjs [--url /crm/companies] [--out /tmp/shot.png] [--auth]
 *
 * Prerequisites:
 *   - pnpm dev:platform running (workshop on :3002)
 *   - TEST_EMAIL / TEST_PASSWORD env vars set for --auth
 */

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import process from 'node:process'

const BASE_URL = process.env.WORKSHOP_URL ?? 'http://localhost:3002'
const EMAIL = process.env.TEST_EMAIL ?? 'aiwahlabs@gmail.com'
const PASSWORD = process.env.TEST_PASSWORD ?? ''

function parseArgs(argv) {
  const args = { url: '/', out: '/tmp/workshop-shot.png', auth: false, width: 1280, height: 900 }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i]
    if (argv[i] === '--out') args.out = argv[++i]
    if (argv[i] === '--auth') args.auth = true
    if (argv[i] === '--width') args.width = Number(argv[++i])
    if (argv[i] === '--height') args.height = Number(argv[++i])
  }
  return args
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`)
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(dashboard|crm|content|agents|bots|users|workshop|workflows|messaging|settings)/, { timeout: 10000 })
}

async function main() {
  const args = parseArgs(process.argv)
  fs.mkdirSync(path.dirname(args.out), { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: args.width, height: args.height } })

  if (args.auth) await login(page)

  await page.goto(`${BASE_URL}${args.url}`)
  await page.waitForLoadState('networkidle').catch(() => page.waitForLoadState('domcontentloaded'))
  await page.screenshot({ path: args.out, fullPage: true })

  await browser.close()
  console.log(`Screenshot saved: ${args.out}`)
}

main().catch(err => { console.error(err); process.exit(1) })
