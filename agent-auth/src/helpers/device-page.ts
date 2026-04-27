export const DEVICE_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo Bank — Approve Agent</title>
  <style>
    * { margin: 0 }
    * { padding: 0 }
    * { box-sizing: border-box }

    body { font-family: system-ui, -apple-system, sans-serif }
    body { background: #f5f5f5 }
    body { display: flex }
    body { align-items: center }
    body { justify-content: center }
    body { min-height: 100vh }

    .card { background: white }
    .card { border-radius: 12px }
    .card { box-shadow: 0 2px 12px rgba(0,0,0,0.1) }
    .card { padding: 2rem }
    .card { max-width: 440px }
    .card { width: 100% }

    h1 { font-size: 1.25rem }
    h1 { margin-bottom: 0.5rem }

    p { color: #666 }
    p { margin-bottom: 1rem }
    p { font-size: 0.9rem }

    label { display: block }
    label { font-weight: 600 }
    label { margin-bottom: 0.25rem }

    input { width: 100% }
    input { padding: 0.5rem }
    input { border: 1px solid #ddd }
    input { border-radius: 6px }
    input { font-size: 1rem }
    input { margin-bottom: 1rem }

    .actions { display: flex }
    .actions { gap: 0.75rem }

    button { flex: 1 }
    button { padding: 0.6rem 1rem }
    button { border: none }
    button { border-radius: 6px }
    button { font-size: 0.95rem }
    button { cursor: pointer }
    button { font-weight: 600 }

    .approve { background: #2563eb }
    .approve { color: white }

    .deny { background: #ef4444 }
    .deny { color: white }

    .result { margin-top: 1rem }
    .result { padding: 0.75rem }
    .result { border-radius: 6px }
    .result { font-size: 0.85rem }
    .result { display: none }

    .result.ok { background: #dcfce7 }
    .result.ok { color: #166534 }
    .result.ok { display: block }

    .result.err { background: #fee2e2 }
    .result.err { color: #991b1b }
    .result.err { display: block }
  </style>
</head>
<body>
  <div class="card">
    <h1>🏦 Demo Bank — Agent Approval</h1>
    <p>An AI agent is requesting access to your account. Enter the code shown by the agent to approve or deny.</p>
    <label for="code">User Code</label>
    <input id="code" type="text" placeholder="ABCD-1234" autofocus />
    <div class="actions">
      <button class="approve" onclick="handle('approve')">Approve</button>
      <button class="deny" onclick="handle('deny')">Deny</button>
    </div>
    <div id="result" class="result"></div>
  </div>
  <script>
    const params = new URLSearchParams(location.search)
    if (params.get('code')) document.getElementById('code').value = params.get('code')

    async function handle(action) {
      const code = document.getElementById('code').value.trim()
      const el = document.getElementById('result')
      if (!code) {
        el.className = 'result err'
        el.textContent = 'Please enter the user code.'
        return
      }
      try {
        const res = await fetch('/api/auth/agent/approve-capability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ userCode: code, action }),
        })
        const data = await res.json()
        if (res.ok) {
          el.className = 'result ok'
          el.textContent = action === 'approve' ? 'Agent approved! You can close this page.' : 'Agent denied.'
        } else {
          el.className = 'result err'
          el.textContent = data.message || data.error || 'Something went wrong.'
        }
      } catch (e) {
        el.className = 'result err'
        el.textContent = 'Network error: ' + e.message
      }
    }
  </script>
</body>
</html>`
