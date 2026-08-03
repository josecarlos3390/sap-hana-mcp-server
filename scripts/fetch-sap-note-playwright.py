#!/usr/bin/env python3
"""Fetch SAP Note content using Playwright (Chromium) and SAP for Me login."""
import os
import sys
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

NOTE = os.environ.get('SAP_NOTE', '3733425')
USER = os.environ.get('SAP_USER', '')
PASS = os.environ.get('SAP_PASS', '')

if not USER or not PASS:
    print('Set SAP_USER and SAP_PASS environment variables.')
    sys.exit(1)

URL = f'https://me.sap.com/notes/{NOTE}'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport={'width': 1920, 'height': 1080},
    )
    page = context.new_page()

    try:
        print('Navigating to', URL)
        page.goto(URL, wait_until='domcontentloaded', timeout=60000)
        print('Current URL:', page.url)

        # Handle SAP ID login flow
        if 'accounts.sap.com' in page.url or 'authentication' in page.url:
            print('SAP ID login flow detected.')
            page.wait_for_selector('input#j_username', timeout=30000)
            page.fill('input#j_username', USER)
            with page.expect_navigation(wait_until='domcontentloaded', timeout=30000):
                page.click('button[type="submit"], input[type="submit"]', timeout=30000)
            print('After username submit URL:', page.url)

            page.wait_for_selector('input#j_password', timeout=30000)
            page.fill('input#j_password', PASS)
            with page.expect_navigation(wait_until='domcontentloaded', timeout=120000):
                page.click('button[type="submit"], input[type="submit"]', timeout=30000)
            print('After password submit URL:', page.url)

        # Wait for note heading (visible text contains the note number)
        page.wait_for_selector(f'text=/{NOTE}/', timeout=120000)
        print('Note heading visible. Final URL:', page.url)

        # Scroll to bottom to load any lazy content
        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        page.wait_for_timeout(3000)

        content = page.content()
        text = page.inner_text('body')

        with open(f'sap-note-{NOTE}-playwright.html', 'w', encoding='utf-8') as f:
            f.write(content)
        with open(f'sap-note-{NOTE}-playwright.txt', 'w', encoding='utf-8') as f:
            f.write(text)

        print('Saved HTML and text. Length:', len(text))
        # Print relevant section
        lower = text.lower()
        for keyword in ['solución', 'solution', 'resolución', 'resolution', 'causa', 'cause', 'reproducción']:
            idx = lower.find(keyword)
            if idx != -1:
                print(f'--- {keyword.upper()} SECTION ---')
                print(text[idx:idx+6000])
                break
        else:
            print('--- BEGIN TEXT ---')
            print(text[:4000])

    except PlaywrightTimeout as e:
        print('Timeout:', e)
        page.screenshot(path=f'sap-note-{NOTE}-timeout.png')
        # Still try to save whatever is loaded
        try:
            with open(f'sap-note-{NOTE}-playwright-timeout.html', 'w', encoding='utf-8') as f:
                f.write(page.content())
            with open(f'sap-note-{NOTE}-playwright-timeout.txt', 'w', encoding='utf-8') as f:
                f.write(page.inner_text('body'))
            print('Saved timeout content.')
        except Exception as ex:
            print('Could not save timeout content:', ex)
    except Exception as e:
        print('Error:', e)
        page.screenshot(path=f'sap-note-{NOTE}-error.png')
    finally:
        browser.close()
