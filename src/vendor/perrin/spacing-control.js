const instances = new WeakMap();
let sequence = 0;

/** Mount an isolated spacing editor; returns set/get/save/reset/open/destroy. */
export function mountSpacingControl(options = {}) {


  const key = options.storageKey || 'perrin-ui-spacing-v1';
  const defaults = {unit: 4, section: 24, card: 18, grid: 16, controls: 8, form: 16};
  const labels = {unit: '基础间距', section: '区块上下间距', card: '卡片内边距', grid: '卡片之间', controls: '按钮之间', form: '表单行之间'};
  let values = {...defaults};
  let saved = {...defaults};
  let savedEnabled = false;
  const root = options.root || document.querySelector('.ui-app, .shell') || document.documentElement;
  if (instances.has(root)) instances.get(root).destroy();
  const token = 's' + (++sequence);
  const previousScope = root.getAttribute('data-perrin-spacing');
  const style = document.createElement('style');
  style.dataset.spacingControl = token;
  document.head.append(style);
  const host = document.createElement('div');
  host.dataset.spacingControl = token;
  // Shadow DOM keeps the control panel independent of site styles.
  const shadow = host.attachShadow({mode: 'open'});
  shadow.innerHTML = `<style>
  :host{position:fixed;right:20px;bottom:20px;z-index:2147483000;font:14px/1.6 system-ui,sans-serif;color:#302b32}
  *{box-sizing:border-box}button,input{font:inherit}button{min-height:40px;padding:8px 14px;border:1px solid #b9aeb7;border-radius:7px;background:#fff;color:#302b32;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #7194ad;outline-offset:2px}
  #toggle{float:right;background:#315f7d;color:white;border-color:#315f7d}
  section{width:min(320px,calc(100vw - 40px));max-height:calc(100dvh - 100px);overflow:auto;margin-bottom:10px;padding:18px;background:#fffdfa;border:1px solid #cfc4cc;border-radius:12px;box-shadow:0 8px 32px #0003}
  [hidden]{display:none!important}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}h2{font-size:17px;margin:0}#close{padding:4px 10px;min-height:36px}
  label{display:grid;grid-template-columns:1fr auto;gap:8px;margin:0 0 16px}input[type=range]{grid-column:1/-1;width:100%;accent-color:#315f7d;min-height:24px}output{font-variant-numeric:tabular-nums;color:#655261}
  footer{display:flex;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid #e3dce1}p{margin:10px 0 0;font-size:13px;color:#635a62}#save{background:#315f7d;color:#fff}#status{min-height:21px}
  </style><section hidden role="region" aria-label="电脑版间距设置"><header><h2>电脑版间距</h2><button id="close" aria-label="关闭间距设置">×</button></header><div id="fields"></div><footer><button id="save">保存</button><button id="cancel">取消修改</button><button id="reset">恢复默认</button></footer><p>修改即时预览，保存后刷新仍生效。仅调整电脑版间距。</p><p id="status" role="status"></p></section><button id="toggle" aria-expanded="false">间距</button>`;
  document.body.append(host);
  const panel = shadow.querySelector('section');
  const toggle = shadow.querySelector('#toggle');
  const status = shadow.querySelector('#status');
  const fields = shadow.querySelector('#fields');
  for (const name of Object.keys(defaults)) {
    const label = document.createElement('label');
    label.textContent = labels[name];
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range'; input.min = name === 'unit' ? '2' : '0';
    input.max = name === 'unit' ? '8' : '64'; input.step = '1';
    input.dataset.name = name; input.setAttribute('aria-label', labels[name]);
    input.id = 'perrin-gap-' + name; output.htmlFor = input.id;
    input.addEventListener('input', () => {values[name] = Number(input.value); apply(); status.textContent = '未保存';});
    label.append(output, input); fields.append(label);
  }
  function clean(input) {
    const next = {...values};
    if (!input || typeof input !== 'object') return next;
    for (const name of Object.keys(defaults)) {
      if (typeof input[name] === 'number' && Number.isFinite(input[name]))
        next[name] = Math.round(Math.min(name === 'unit' ? 8 : 64, Math.max(name === 'unit' ? 2 : 0, input[name])));
    }
    return next;
  }
  function restoreScope() {
    if (previousScope === null) root.removeAttribute('data-perrin-spacing');
    else root.setAttribute('data-perrin-spacing', previousScope);
  }
  function apply() {
    const v = values;
    root.setAttribute('data-perrin-spacing', token);
    const scope = '[data-perrin-spacing="' + token + '"]';
    style.textContent = `@media(min-width:769px){
      ${scope}{--space-1:${v.unit}px!important;--space-2:${v.unit*2}px!important;--space-3:${v.unit*3}px!important;--space-4:${v.unit*4}px!important;--space-5:${v.unit*6}px!important;--space-6:${v.unit*8}px!important;--section-gap:${v.section}px!important;--card-padding:${v.card}px!important;--panel-padding:${v.card}px!important}
      ${scope} .section{padding-block:${v.section}px!important}
      ${scope} :is(.panel,.config-page,.section-block){padding:${v.card}px!important}
      ${scope} :is(.study-columns,.metrics-grid,.stats,.live-services,.control-grid,.control-stack,.receipts-layout,.message-workspace,.detail-grid,.operator-lists,.asset-grid,.memory-list,.card-grid){gap:${v.grid}px!important}
      ${scope} :is(.deadline-controls,.context-tabs,.actions,.config-actions,.asset-type-tabs,.main-config-modules,.pager,.asset-pager,.calendar-controls){gap:${v.controls}px!important}
      ${scope} :is(.auth-form,.token-form,.auth-methods,.config-form,.sample-form,.platform-form){row-gap:${v.form}px!important}
      ${scope} .main-config-modules{margin-bottom:${v.section}px!important}
      ${scope} .pager{margin-block:${v.section}px!important}
    }`;
    for (const input of fields.querySelectorAll('input')) {
      input.value = String(v[input.dataset.name]);
      input.previousElementSibling.textContent = input.value + ' px';
    }
  }
  function show(open) {
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    if (open) fields.querySelector('input').focus(); else toggle.focus();
  }
  function save() {
    try {localStorage.setItem(key, JSON.stringify(values)); saved = {...values}; savedEnabled = true; status.textContent = '已保存在此浏览器'; return true;}
    catch (_) {status.textContent = '保存失败，当前仅预览'; return false;}
  }
  function reset() {
    values = {...defaults}; saved = {...defaults}; savedEnabled = false;
    try {localStorage.removeItem(key); status.textContent = '已恢复网站默认间距';}
    catch (_) {status.textContent = '已恢复显示，浏览器存储未能清除';}
    style.textContent = ''; restoreScope();
    for (const input of fields.querySelectorAll('input')) {
      input.value = String(values[input.dataset.name]); input.previousElementSibling.textContent = input.value + ' px';
    }
  }
  toggle.onclick = () => show(panel.hidden);
  shadow.querySelector('#close').onclick = () => show(false);
  shadow.querySelector('#save').onclick = save;
  shadow.querySelector('#cancel').onclick = () => {if (savedEnabled) {values = {...saved}; apply();} else reset(); status.textContent = '已取消未保存的修改';};
  shadow.querySelector('#reset').onclick = reset;
  shadow.addEventListener('keydown', event => {if (event.key === 'Escape') show(false);});
  const api = {
    set(patch) {values = clean(patch); apply(); status.textContent = '未保存'; return {...values};},
    get() {return {...values};}, save, reset,
    open() {show(true);},
    destroy() {style.remove(); host.remove(); restoreScope(); instances.delete(root);}
  };
  try {
    const stored = localStorage.getItem(key);
    if (stored) {values = clean(JSON.parse(stored)); saved = {...values}; savedEnabled = true; apply();}
    else reset();
  } catch (_) {reset(); status.textContent = '无法读取已保存设置';}

  instances.set(root, api);
  return api;
}
