// Floating chat widget. Pasang di website: <script src="https://CRM/chat.js" async></script>
(function () {
  if (window.__crmChat) return; window.__crmChat = 1;
  var base = new URL(document.currentScript.src).origin;
  var vid; try { vid = localStorage.getItem('crm_chat_id'); } catch (e) {}
  if (!/^[a-f0-9]{16}$/.test(vid || '')) {
    vid = Array.from(crypto.getRandomValues(new Uint8Array(8)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { localStorage.setItem('crm_chat_id', vid); } catch (e) {}
  }
  var last = 0, timer, cfg;
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  fetch(base + '/public/chat/config').then(function (r) { return r.json(); }).then(function (c) {
    cfg = c;
    var host = document.createElement('div');
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' +
      '*{box-sizing:border-box;font-family:system-ui,sans-serif}' +
      '.btn{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;border:0;background:' + c.color + ';color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:2147483646}' +
      '.box{position:fixed;right:20px;bottom:90px;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 110px);background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483647}' +
      '.box.open{display:flex}' +
      '.hd{background:' + c.color + ';color:#fff;padding:14px 16px}.hd b{display:block;font-size:16px}.hd small{opacity:.9}' +
      '.ms{flex:1;overflow-y:auto;padding:12px;background:#f4f5f7;display:flex;flex-direction:column;gap:6px}' +
      '.m{max-width:80%;padding:8px 11px;border-radius:12px;font-size:14px;line-height:1.35;white-space:pre-wrap;word-wrap:break-word;color:#222}' +
      '.in{align-self:flex-end;background:' + c.color + ';color:#fff}.out{align-self:flex-start;background:#fff}' +
      '.m i{display:block;font-size:11px;opacity:.65;font-style:normal;margin-bottom:2px}' +
      'form{display:flex;gap:6px;padding:10px;border-top:1px solid #eee}' +
      'input{flex:1;padding:9px 11px;border:1px solid #ddd;border-radius:20px;font-size:14px;outline:none}' +
      'button.s{border:0;background:' + c.color + ';color:#fff;border-radius:20px;padding:0 14px;cursor:pointer}' +
      '</style>' +
      '<div class="box"><div class="hd"><b>' + esc(c.title) + '</b><small>' + esc(c.agent) + '</small></div>' +
      '<div class="ms"></div><form><input placeholder="Tulis pesan…" maxlength="2000" aria-label="Pesan"><button class="s">Kirim</button></form></div>' +
      '<button class="btn" aria-label="Buka chat">💬</button>';
    document.body.appendChild(host);
    var box = root.querySelector('.box'), ms = root.querySelector('.ms'), input = root.querySelector('input');
    if (c.greeting) add({ direction: 'out', body: c.greeting });
    root.querySelector('.btn').onclick = function () {
      box.classList.toggle('open');
      clearInterval(timer);
      if (box.classList.contains('open')) { poll(); timer = setInterval(poll, 4000); input.focus(); }
    };
    root.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var body = input.value.trim(); if (!body) return;
      input.value = '';
      fetch(base + '/public/chat/' + vid, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: body }) })
        .then(poll);
    };
    function add(m) {
      var d = document.createElement('div');
      d.className = 'm ' + m.direction;
      d.innerHTML = (m.direction === 'out' ? '<i>' + esc(c.agent) + '</i>' : '') + esc(m.body);
      ms.appendChild(d); ms.scrollTop = ms.scrollHeight;
    }
    function poll() {
      return fetch(base + '/public/chat/' + vid + '/messages?after=' + last).then(function (r) { return r.json(); }).then(function (list) {
        list.forEach(function (m) { last = Math.max(last, m.id); add(m); });
      }).catch(function () {});
    }
  });
})();
