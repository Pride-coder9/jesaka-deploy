/** Shared UI kit: toasts, modal, formatters, tables, CSV export, printing. */
const Toast = (() => {
  function show(type, title, msg = '', ms = 4200) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<div><div class="toast-title">${title}</div>${msg ? `<div class="toast-msg">${msg}</div>` : ''}</div>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
  }
  return {
    success: (t, m) => show('success', '✅ ' + t, m),
    error: (t, m) => show('error', '⚠️ ' + t, m, 6000),
    info: (t, m) => show('info', 'ℹ️ ' + t, m)
  };
})();

const Modal = (() => {
  const bd = () => document.getElementById('modal-backdrop');
  function open(title, bodyHTML, { footHTML = '', wide = false } = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-foot').innerHTML = footHTML;
    document.getElementById('modal-foot').style.display = footHTML ? 'flex' : 'none';
    document.getElementById('modal').classList.toggle('wide', wide);
    bd().classList.add('open');
  }
  function close() { bd().classList.remove('open'); }
  function confirm(title, msg, onYes, danger = false) {
    open(title, `<p style="font-size:.9rem; color:var(--text-2);">${msg}</p>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-yes">Confirm</button>`
    });
    document.getElementById('modal-yes').onclick = () => { close(); onYes(); };
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('modal-x').addEventListener('click', close);
    bd().addEventListener('click', e => { if (e.target === bd()) close(); });
  });
  return { open, close, confirm };
})();

const Fmt = {
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  currency(v) {
    if (v == null || isNaN(v)) return '—';
    const cur = window.APP?.store?.currency || 'UGX';
    return `${cur} ${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  },
  num(v, d = 0) { return v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  date(s) { return s ? new Date(s.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; },
  datetime(s) { return s ? new Date(s.replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; },
  today() { return new Date().toLocaleDateString('en-CA'); },
  monthStart() { return Fmt.today().slice(0, 8) + '01'; },
  initials(n) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); },
  method(m) {
    const map = { cash: ['badge-green', '💵 Cash'], mobile_money: ['badge-gold', '📱 MoMo'], bank: ['badge-blue', '🏦 Bank'], credit: ['badge-purple', '📝 Credit'] };
    const [c, l] = map[m] || ['badge-gray', m];
    return `<span class="badge ${c}">${l}</span>`;
  },
  move(t) {
    const map = { receipt: ['badge-green', '↓ Receipt'], sale: ['badge-blue', '↑ Sale'], adjustment: ['badge-gold', '± Adjust'], return_in: ['badge-purple', '↩ Return'], write_off: ['badge-red', '✕ Write-off'] };
    const [c, l] = map[t] || ['badge-gray', t];
    return `<span class="badge ${c}">${l}</span>`;
  },
  profit(v) { return `<span class="pos-neg ${v >= 0 ? 'pos' : 'neg'}">${Fmt.currency(v)}</span>`; },
  qtyDelta(q) { return `<span class="${q > 0 ? 'pos' : 'neg'}">${q > 0 ? '+' : ''}${q}</span>`; }
};

const Tbl = {
  render(columns, rows, { empty = 'No records found', rowAttrs } = {}) {
    if (!rows || !rows.length) return `<div class="empty"><div class="icon">📦</div>${empty}</div>`;
    const head = columns.map(c => `<th class="${c.cls || ''}">${c.h}</th>`).join('');
    const body = rows.map((r, i) => {
      const tds = columns.map(c => `<td class="${c.cls || ''}">${c.v(r, i)}</td>`).join('');
      return `<tr ${rowAttrs ? rowAttrs(r) : ''}>${tds}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  },
  pager(el, { page, pages, total }, onPage) {
    if (!el) return;
    if (pages <= 1) { el.innerHTML = total ? `<span class="pager-info">${total} records</span>` : ''; return; }
    let h = `<button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">‹</button>`;
    for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++)
      h += `<button class="${i === page ? 'on' : ''}" data-p="${i}">${i}</button>`;
    h += `<button ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">›</button><span class="pager-info">${total} records</span>`;
    el.innerHTML = h;
    el.querySelectorAll('button[data-p]:not(:disabled)').forEach(b => b.onclick = () => onPage(+b.dataset.p));
  }
};

function exportCSV(filename, headers, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  Toast.success('Exported', filename);
}

async function printHTML(html) {
  const area = document.getElementById('print-area');
  area.innerHTML = html;
  // Wait for embedded images (QR codes) to load before opening the print dialog
  const imgs = [...area.querySelectorAll('img')];
  await Promise.race([
    Promise.all(imgs.map(i => i.complete ? true : new Promise(r => { i.onload = i.onerror = r; }))),
    new Promise(r => setTimeout(r, 3000))
  ]);
  window.print();
}

const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
