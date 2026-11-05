import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { MediaUpload } from '@lincyaw/kernel'
import { MEDIA_UPLOAD_MESSAGES } from './media-upload-messages.ts'

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
let styles: string | undefined
const css = () => styles ??= [readFileSync(new URL(import.meta.resolve('@lincyaw/design/tokens.css')), 'utf8'), readFileSync(new URL(import.meta.resolve('@lincyaw/design/components.css')), 'utf8'), readFileSync(new URL('./media-upload.css', import.meta.url), 'utf8')].join('\n')
export function mediaUploadPage(value: MediaUpload | undefined, locale: 'zh-CN' | 'en', documentTitle?: string): Response {
  const t = MEDIA_UPLOAD_MESSAGES[locale], nonce = randomBytes(18).toString('base64'), title = value ? t[value.kind] : t.unavailable
  const ready = value?.state === 'ready', uploading = value?.state === 'uploading'
  const script = value ? `
    const form = document.querySelector('form');
    const status = document.querySelector('[role="status"]');
    const input = document.querySelector('input');
    const choose = document.querySelector('button');
    choose?.addEventListener('click', () => input.click());
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const file = input.files[0];
      if (!file || input.disabled) return;
      if (file.size > ${value.maxBytes}) { status.textContent = ${JSON.stringify(t.limit(value.maxBytes / (1 << 20)))}; input.value = ''; return; }
      input.disabled = true; choose.disabled = true;
      status.textContent = ${JSON.stringify(t.sending)};
      try {
        const answer = await fetch(location.href, { method: 'POST', credentials: 'same-origin', redirect: 'error',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Presmium-Upload-Name': encodeURIComponent(file.name) }, body: file });
        if (!answer.ok) throw Error();
        form.remove();
        status.textContent = ${JSON.stringify(t.ready)};
      } catch {
        status.textContent = ${JSON.stringify(t.failed)};
        input.disabled = false; choose.disabled = false;
        input.value = '';
      }
    });
    input?.addEventListener('change', () => form.requestSubmit());
  ` : ''
  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(title)}</title><style nonce="${nonce}">${css()}</style>
  <script nonce="${nonce}">
    const theme = matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.classList.toggle('dark', theme.matches);
    update(); theme.addEventListener('change', update);
  </script>
</head>
<body class="pm-ui pm-media-upload-body"><main class="pm-media-upload">
  <h1>${escape(title)}</h1>${documentTitle ? `<p>${escape(documentTitle)}</p>` : ''}
  ${value ? `<p>${escape(t.limit(value.maxBytes / (1 << 20)))}</p><p>${escape(t.pending)}</p>
    ${ready || uploading ? '' : `<form><button class="pm-ui-button" type="button">${escape(t.choose)}</button><input hidden type="file" name="file" aria-label="${escape(t.choose)}" accept="${value.kind}/*" required></form>`}` : ''}
  <p role="status">${ready ? escape(t.ready) : uploading ? escape(t.sending) : ''}</p>
</main><script nonce="${nonce}">${script}</script></body></html>`
  return new Response(html, { status: value ? 200 : 410, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'` } })
}
