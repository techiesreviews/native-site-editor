"""Regenerate offline comparisons from catalogue 51's actual shell and row renderer.

Opening the resulting HTML requires no build or sibling resources.
"""
from pathlib import Path
import re
import json

HERE = Path(__file__).parent
REFERENCE = HERE.parent / 'atomic-catalogue/prototypes/51-page-structure.html'
reference = REFERENCE.read_text()
css = reference.split('<style>', 1)[1].split('</style>', 1)[0]
icons = reference[reference.index('const ICONS = {'):reference.index('const sleep =')]
tree = reference[reference.index('const TREE = ['):reference.index('const START =')]
row = reference[reference.index('function rowHtml('):reference.index('function attrsPanel(')]
row = row.replace('S.selected === it.id && !S.noPage', 'S.selection.includes(it.id)')
row = row.replace('data-id="${it.id}"', 'data-id="${it.id}" aria-label="${esc(label(it))}"')
row = row.replace('it.container) && mode', '(it.container || it.text !== undefined)) && mode')
# The original row anatomy stays intact; these are additions for the new tasks.
extra_css = r'''
:root { --prototype-stage: 42rem; --prototype-inspector: 19rem; --prototype-picture: 13rem; }
html { scrollbar-gutter: stable; }
body { -webkit-font-smoothing: antialiased; }
.mock .intro { max-inline-size: 85ch; }
.strip > a { margin-inline-end:auto; color:var(--link); padding:var(--space-xs); }
.editor-top { display:flex; align-items:center; gap:var(--space-s); padding:var(--space-2xs) var(--space-s); min-block-size:var(--size-touch); background:var(--surface-toolbar); }
.editor-top .project-name { font-weight:600; }
.editor-top #editor-tools { display:flex; gap:var(--space-3xs); margin-inline-start:auto; }
#page-name { color:var(--text); }
.ws { min-block-size:var(--prototype-stage); align-items:start; }
.sidebar-wrap { align-self:stretch; }
.ps-side, .sidebar { padding-block-start:var(--space-xs); }
#side .ps-meta, #side .page-structure__meta { padding-block-end:var(--space-xs); margin-block-end:var(--space-xs); }
#side .ps-meta p, #side .page-structure__meta-summary { margin:0; }
#side .ps-actions, #side .row-action-overlay { visibility:visible; }
.ps-row, .page-structure__row { touch-action:manipulation; }
.ps-row[aria-selected=true],.page-structure__row[aria-selected=true] { --row-tint:var(--current); }
button, a { touch-action:manipulation; }
button:active:not(:disabled) { background-color:var(--current); }
:focus-visible { outline:var(--focus-ring); outline-offset:var(--space-4xs); }
input,select,textarea { font:inherit; color:var(--text); }
input,select { min-block-size:var(--size-control); }
button:disabled { cursor:default; opacity:.55; }
.canvas { display:grid; align-content:start; gap:var(--space-s); border:0; }
#taskbar:empty, #under-site:empty { display:none; }
.editbar { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-3xs); padding:var(--space-2xs); border-radius:var(--radius); background:var(--surface-toolbar); box-shadow:var(--shadow-small); }
.editbar .scope { padding-inline:var(--space-xs); font-size:var(--type-small); color:var(--muted); }
.editbar .component-scope { color:var(--component-text); }
#site { overflow:visible; }
.site .site-head button, .site .site-foot button { font:inherit; color:inherit; border:0; background:transparent; padding:var(--space-xs); }
.site .hero { grid-template-columns:minmax(0,1fr); }
.site .hero h3 { font-size:clamp(1.4rem,1rem + 1.7cqi,2rem); }
.site .hero p,.site .hero .lead { font-size:var(--type-title); line-height:1.6; max-inline-size:60ch; }
.site .hero .lead p { margin-block:0 var(--space-xs); color:inherit; font:inherit; }
.site .cta { border:0; cursor:pointer; }
.site .site-photo { margin:0; border-radius:var(--radius); overflow:clip; background:var(--surface-subtle); }
.site .site-photo svg { display:block; inline-size:100%; block-size:var(--prototype-picture); }
.site .loaves { gap:var(--space-s); padding-block:var(--space-l); }
.site .loaves h3 { font:600 var(--type-heading)/1.3 Georgia,serif; }
.site .loaves ul { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr)); gap:var(--space-s); padding:0; list-style:none; margin:0; }
.site .loaves li { padding:var(--space-m); background:var(--surface-subtle); color:var(--text); border-radius:var(--radius); font:var(--type-base)/1.5 Inter,system-ui,sans-serif; }
.site .loaves li strong { display:block; margin-block-end:var(--space-3xs); }
.site .contact { padding-block:var(--space-l); }
.site .site-foot { padding-block:var(--space-m); }
.site [data-node] { cursor:pointer; }
.site [contenteditable=true] { cursor:text; }
.site .is-sel { outline:2px solid var(--primary); outline-offset:-2px; }
.site .is-component-selection { outline-color:var(--color-component); }
.site .site-wrap { margin:var(--space-xs); padding:var(--space-m); outline:1px dashed var(--primary); border-radius:var(--radius); }
.site .link-demo-selection { background:var(--current); }
.source-pane,.inspector { padding:var(--space-m); background:var(--surface-subtle); border-radius:var(--radius-panel); display:grid; gap:var(--space-s); }
.source-pane pre { white-space:pre-wrap; overflow-wrap:anywhere; font:var(--type-small)/1.6 var(--font-mono); margin:0; }
.field { display:grid; gap:var(--space-3xs); font-size:var(--type-small); color:var(--muted); }
.field input,.field select,.field textarea { inline-size:100%; min-inline-size:0; padding:var(--space-xs); background:var(--surface-input); border:0; box-shadow:inset 0 -1px var(--control-line); border-radius:var(--radius-small); color:var(--text); }
.field textarea { min-block-size:calc(var(--size-touch)*2); resize:vertical; }
.form-stack { display:grid; gap:var(--space-m); }
.controls { display:flex; gap:var(--space-xs); align-items:center; flex-wrap:wrap; }
.controls > .end { margin-inline-start:auto; }
#popup { position:fixed; inset:auto; margin:0; border:0; border-radius:var(--radius-panel); background:var(--panel-surface); color:var(--text); box-shadow:var(--shadow); padding:var(--space-s); inline-size:min(22rem,calc(100vw - var(--space-l))); max-block-size:calc(100dvh - var(--space-l)); overflow:auto; }
#popup h2 { font-size:var(--type-title); margin:0 0 var(--space-s); }
#popup form { display:grid; gap:var(--space-s); }
#popup hr { margin-block:var(--space-xs); border:0; border-block-start:1px solid var(--line); }
#popup .p-menu-item { min-inline-size:0; }
#popup .source-row { display:flex; justify-content:space-between; gap:var(--space-s); padding:var(--space-xs); font-size:var(--type-small); }
#popup .source-row.winner { background:var(--current); font-weight:600; }
#popup .source-row span { overflow-wrap:anywhere; }
#popup .permission { display:flex; align-items:center; gap:var(--space-xs); min-block-size:var(--size-touch); }
#popup .permission input { min-block-size:0; }
#media-dialog { inline-size:min(70rem,calc(100vw - var(--space-l))); max-block-size:calc(100dvh - var(--space-l)); border:0; background:var(--surface); color:var(--text); border-radius:var(--radius-dialog); padding:var(--space-m); box-shadow:var(--shadow); overflow:auto; }
#media-dialog::backdrop { background:color-mix(in oklch,var(--background) 65%,transparent); }
.media-top { display:flex; align-items:center; gap:var(--space-xs); margin-block-end:var(--space-m); }
.media-top strong { flex:1; }
.media-stage { background:var(--surface-subtle); border-radius:var(--radius); display:grid; place-items:center; min-block-size:var(--prototype-picture); }
.media-stage svg { inline-size:100%; max-block-size:26rem; }
.media-layout { display:grid; gap:var(--space-l); }
body[data-mode=today] #media-dialog { inline-size:min(47.5rem,calc(100vw - var(--space-l))); }
body[data-mode=today] .media-layout .media-stage { min-block-size:31.25rem; }
body[data-mode=today] .media-layout .media-stage svg { block-size:31.25rem; }
@media (width > 850px) { body[data-mode=after] .media-layout { grid-template-columns:minmax(0,1fr) var(--prototype-inspector); align-items:start; } }
@container app (inline-size < 40rem) {
 .ps-tree,.page-structure__tree { max-block-size:15rem; overflow:auto; }
 .ps-row,.page-structure__row { min-block-size:var(--size-touch); }
 .ps-actions,.row-action-overlay { position:static; opacity:1; pointer-events:auto; background:none; padding:0; margin-inline-start:auto; }
 .ps-row,.page-structure__row { flex-wrap:wrap; }
 .ps-actions .p-icon-button,.page-structure__action { inline-size:var(--size-touch); block-size:var(--size-touch); }
 .editor-top { flex-wrap:wrap; }
 .site .hero { padding:var(--space-m); }
 .canvas { padding:var(--space-xs); }
 .field input,.field select,.field textarea { font-size:16px; min-block-size:var(--size-touch); }
 .p-button,.p-menu-item,.seg button,.steps button { min-block-size:var(--size-touch); }
 .p-icon-button { inline-size:var(--size-touch); block-size:var(--size-touch); }
}
@media (width <= 650px), (pointer:coarse) { input,textarea,select { font-size:16px; } .seg button,.steps button,.p-menu-item { min-block-size:var(--size-touch); } .media-stage { min-block-size:8rem; } .media-stage svg { max-block-size:10rem; } }
.app.client-view .sidebar-wrap { display:none; }
.app.client-view .ws { grid-template-columns:minmax(0,1fr); }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none !important; transition:none !important; } }
'''
# The copied catalogue contains historical desktop hover rules. Keep hover pointer-specific.
css = re.sub(r'(?m)^([^@\n][^\n]*:hover[^\n]*\{[^\n]*\})$', r'@media (hover: hover) and (pointer: fine) { \1 }', css)
css = css.replace('outline: none;', 'outline-color: transparent;')
COMMON = r'''
ICONS.undo='<path d="m8 5-4 4 4 4M4 9h9a6 6 0 0 1 0 12"/>';
ICONS.back='<path d="m14 5-7 7 7 7"/>';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='today', tree, S, undo=[], sequence=0;
const m=(a,b)=>mode==='today'?a:b;
const side=$('#side'), app=$('#app');
const ib=(words,name,attrs='')=>`<button type="button" class="p-icon-button p-press" aria-label="${esc(words)}" title="${esc(words)}" ${attrs}>${icon(name,14)}</button>`;
const btn=(words,attrs='')=>`<button type="button" class="p-button p-press" ${attrs}>${esc(words)}</button>`;
const field=(name,value,attrs='')=>`<label class="field">${esc(name)}<input value="${esc(value)}" aria-label="${esc(name)}" ${attrs}></label>`;
const label=it=>it.text||it.kind;
function flatten(list=tree,depth=0,parent=null,out=[]){for(const it of list){out.push({it,depth,parent,list});if(it.children&&!S.folded.includes(it.id))flatten(it.children,depth+1,it,out);}return out;}
function all(list=tree,parent=null,out=[]){for(const it of list){out.push({it,parent,list});if(it.children)all(it.children,it,out);}return out;}
function find(id){return all().find(x=>x.it.id===id);}
function selected(){return find(S.selected)?.it;}
function saveUndo(){undo.push(structuredClone({tree,S}));$('#undo').disabled=false;}
function undoAction(){if(!undo.length)return;const editing=document.activeElement?.closest?.('[contenteditable=true]')?.dataset.node;closePopup(false);const old=undo.pop();tree=old.tree;S=old.S;render();if(editing){const el=$('#site [data-node="'+editing+'"]');if(el){el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);}}else focusRow(S.selected);}
function select(id,add=false){if(!find(id))return;S.selected=id;S.selection=add?[...new Set([...S.selection,id])]:[id];if(!add)S.anchor=id;render();}
function selectRange(id){const ids=flatten().map(x=>x.it.id),anchor=ids.includes(S.anchor)?S.anchor:S.selected;const start=ids.indexOf(anchor),end=ids.indexOf(id);S.selected=id;S.selection=ids.slice(Math.min(start,end),Math.max(start,end)+1);render();}
function focusRow(id){side.querySelector(`[data-id="${id}"]`)?.focus();}
function reveal(id){$('#site [data-node="'+id+'"]')?.scrollIntoView({block:'center',behavior:'instant'});}
function reset(){closePopup(false);$('#media-dialog').close();sequence=0;tree=structuredClone(TREE);tree[1].children[1].anchor='work';tree[1].children[1].children.push({id:'loaves-list',kind:'List',icon:'main',container:true,children:[{id:'bread1',kind:'List item',icon:'paragraph',text:'Sourdough · Long-fermented and golden'},{id:'bread2',kind:'List item',icon:'paragraph',text:'Rye · Rich, dark and full of flavour'},{id:'bread3',kind:'List item',icon:'paragraph',text:'Spelt · A light, nutty loaf'}]});
 S={selected:'h1',anchor:'h1',selection:['h1'],folded:['contact','footer'],attrs:null,editing:null,drag:null,noPage:false,typed:null,slotCard:false,route:'Home',source:'index.html',multi:false,rich:{},clipboard:[],client:false,permissions:{text:true,link:true,image:true},heading:'Fresh bread every morning',address:'/loaves/',image:'bread',brand:'Bakery',savedBrand:'Bakery',justSaved:false,local:32,screen:16,width:'phone',draft:'Saved bread illustration',savedDescription:'Saved bread illustration',collection:'Bakery',savedCollection:'Bakery',mediaView:'gallery',pasteMode:'clean'};
 undo=[];MODULE.reset?.();render();$('.demo .says').textContent=CONFIG.start;$$('[data-step]').forEach(b=>b.setAttribute('aria-pressed','false'));
}
function rowAction(words,glyph,attrs=''){return mode==='today'?`<button type="button" class="page-structure__action" title="${esc(words)}" aria-label="${esc(words)}" ${attrs}>${icon(glyph,14)}</button>`:ib(words,glyph,attrs);}
function actionsFor(it){let list=[];if(it.component)list.push(rowAction('Attributes','brackets','data-act="attrs"'),rowAction('Edit component','pencil','data-act="edit-component"'),rowAction('Disconnect this instance','detach','data-act="detach"'));if(it.slot)list.push(rowAction('Edit '+it.slot,'pencil','data-act="slot"'));if((it.container&&!it.component&&it.id!=='main')||(CONFIG.id===1&&mode==='after'&&canStructure(it.id)))list.push(rowAction('More actions','dots',`data-act="menu" aria-haspopup="menu" aria-expanded="false"`));return list.length?m(`<span class="row-action-overlay">${list.join('')}</span>`,`<span class="ps-actions">${list.join('')}</span>`):'';}
function renderTree(){const rows=flatten().map(rowHtml).join('');side.innerHTML=mode==='today'?`<aside class="sidebar" aria-label="Page structure"><div class="sidebar-heading"><span class="eyebrow">Page structure</span><button class="structure-add" data-add>${icon('plus')} Add</button></div><div class="page-structure"><div class="page-structure__meta" role="group" aria-label="Page"><span class="page-structure__meta-heading">Page</span><p class="page-structure__meta-summary">${esc(S.route)} · ${S.route==='Home'?'/':'/about/'}</p></div><div class="page-structure__tree" role="tree" aria-label="Page structure" ${CONFIG.id===7?'aria-multiselectable="true"':''}>${rows}</div></div></aside>`:`<aside class="ps-side" aria-label="Page structure"><h2 class="p-heading ps-head">Page structure ${btn('Add','data-add data-size="compact" data-tone="quiet"')}</h2><div class="ps-meta" role="group" aria-label="Page"><h3 class="p-heading">Page</h3><p>${esc(S.route)} · ${S.route==='Home'?'/':'/about/'}</p></div><div class="ps-tree" role="tree" aria-label="Page structure" ${CONFIG.id===7?'aria-multiselectable="true"':''}>${rows}</div></aside>`;}
const picture=(garden=false)=>`<svg viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${garden?'Bakery garden':'Fresh loaves on a bakery table'}"><rect width="600" height="240" fill="var(--bakery-photo-bg)"/><path fill="var(--bakery-table)" d="M0 173h600v67H0z"/>${garden?'<path fill="var(--bakery-leaf)" d="M125 173V70h8v103M280 173V36h8v137M450 173V85h8v88"/><circle cx="130" cy="60" r="42" fill="var(--bakery-leaf)"/><circle cx="284" cy="45" r="53" fill="var(--bakery-leaf)"/><circle cx="454" cy="80" r="38" fill="var(--bakery-leaf)"/>':'<path fill="var(--bakery-crust)" d="M75 153c-22-90 35-123 92-99s81 85 43 110Zm165 7c-8-107 90-143 141-83s62 98 15 103Zm185 14c-32-86 24-130 84-104s79 79 43 113Z"/><g stroke="var(--bakery-cut)" stroke-width="9" stroke-linecap="round"><path d="m112 78 43 57m2-65 35 60m86-61 56 66m-14-84 50 66m86-31 51 53m-8-69 40 49"/></g>'}<path fill="var(--bakery-leaf)" d="m48 175 25-62 8 5-22 59m-4-31-24-17-5 7 26 20"/></svg>`;
function nodeHTML(it){const attrs=`data-node="${it.id}" tabindex="0"`;const text=esc(it.text||'');if(it.id==='header')return `<header class="site-head" ${attrs}><strong class="logo" data-node="logo">${esc(S.brand)}</strong><nav><button data-route="Home">Home</button><button data-route="About">About</button></nav></header>`;
 if(it.id==='main')return `<main ${attrs}>${it.children.map(nodeHTML).join('')}</main>`;
 if(it.id==='footer')return `<footer class="site-foot" ${attrs}><span data-node="copy">© ${esc(S.brand)}</span><span>Made slowly. Shared daily.</span></footer>`;
 if(it.id==='contact'||it.kind==='Contact')return `<section class="contact" ${attrs}>Visit us at Oudegracht 12.<br>Tuesday–Saturday · 07:00–16:00</section>`;
 if(it.kind==='Div')return `<div class="site-wrap" ${attrs}>${it.children.map(nodeHTML).join('')}</div>`;
 if(it.kind==='Section'){const hero=it.id==='sec1'||it.id.startsWith('sec1-');return `<section class="${hero?'hero':'loaves'}" ${attrs}${it.anchor?` id="${esc(it.anchor)}"`:''}>${it.children.map(nodeHTML).join('')}${it.anchor?`<a class="work-link" href="#${esc(it.anchor)}" data-internal-ref="${esc(it.anchor)}">See this selection</a>`:''}</section>`;}
 if(it.kind==='List')return `<ul ${attrs}>${it.children.map(nodeHTML).join('')}</ul>`;
 if(it.kind==='List item'){const [a,b]=it.text.split(' · ');return `<li ${attrs}><strong>${esc(a)}</strong>${esc(b||'')}</li>`;}
 if(it.kind==='Heading')return `<h3 ${attrs}>${it.id==='h1'?esc(S.route==='About'?'About our bakery':S.heading):text}</h3>`;
 if(it.kind==='Paragraph')return `<div class="lead" ${attrs}${CONFIG.id===5&&it.id==='p1'?' contenteditable="true" role="textbox" aria-label="Page paragraph" aria-multiline="true"':''}>${S.rich[it.id]||'<p>'+text+'</p>'}</div>`;
 if(it.kind==='Image')return `<figure class="site-photo" ${attrs}>${picture(S.image==='garden')}</figure>`;
 if(it.kind==='Button')return `<a class="cta" ${attrs} href="${esc(S.address)}">${text}</a>`;
 return `<p ${attrs}>${text}</p>`;
}
function renderSite(){const active=document.activeElement?.closest?.('[data-node]')?.dataset.node;$('#site').innerHTML=tree.map(nodeHTML).join('');for(const el of $$('#site [data-node]')){el.classList.toggle('is-sel',S.selection.includes(el.dataset.node));el.classList.toggle('is-component-selection',!!find(el.dataset.node)?.it.component&&S.selection.includes(el.dataset.node));}if(active)$(`#site [data-node="${active}"]`)?.focus();}
function render(){const focus=document.activeElement;const rowFocus=focus?.closest?.('[data-id]')?.dataset.id;const controlFocus=focus?.getAttribute?.('data-tool');renderTree();renderSite();$('#page-name').textContent=CONFIG.id===3&&mode==='today'?S.source==='index.html'?'Home':'About':S.route;$('#taskbar').innerHTML=MODULE.bar?.()||'';$('#under-site').innerHTML=MODULE.under?.()||'';$('#undo').disabled=!undo.length;app.classList.toggle('client-view',S.client);MODULE.bind?.();if(rowFocus)focusRow(rowFocus);else if(controlFocus)$(`[data-tool="${controlFocus}"]`)?.focus();}
function closePopup(focus=true){const p=$('#popup');if(p.matches(':popover-open'))p.hidePopover();if(focus)focusRow(S.selected);}
function popup(html,trigger,options={}){const p=$('#popup');closePopup(false);p.innerHTML=html;p.style.maxBlockSize='';p.showPopover({source:trigger||$('#taskbar')});const r=(trigger||$('#taskbar')).getBoundingClientRect();const box=p.getBoundingClientRect();p.style.insetInlineStart=Math.max(12,Math.min(r.left,innerWidth-box.width-12))+'px';p.style.insetBlockStart=Math.max(12,Math.min(r.bottom+8,innerHeight-box.height-12))+'px';p.querySelector('input,textarea,button,select')?.focus();if(options.bind)options.bind(p);}
function contextTrigger(){return $(`#side [data-id="${S.selected}"] [data-act="menu"]`)||$('#taskbar');}
function canStructure(id=S.selected){const f=find(id);return !!(f?.parent&&!f.it.part);}
function focusTool(name){($('[data-tool="'+name+'"]:not(:disabled)')||$('#taskbar [data-tool]:not(:disabled)')||$('#undo'))?.focus();}
function duplicate(id,unique=false){const f=find(id);if(!canStructure(id))return;saveUndo();const copy=structuredClone(f.it);const anchors=new Set(all().map(x=>x.it.anchor).filter(Boolean));function visit(n){n.id=n.id+'-copy-'+(++sequence);if(n.anchor&&unique){const base=n.anchorBase||n.anchor;n.anchorBase=base;let candidate=base,i=2;while(anchors.has(candidate))candidate=base+'-'+i++;n.anchor=candidate;anchors.add(candidate);}n.children?.forEach(visit);}visit(copy);f.list.splice(f.list.indexOf(f.it)+1,0,copy);S.selected=copy.id;S.selection=[copy.id];render();focusRow(copy.id);return copy;}
function move(direction){const f=find(S.selected);if(!canStructure())return;const i=f.list.indexOf(f.it),j=i+direction;if(j<0||j>=f.list.length)return;saveUndo();[f.list[i],f.list[j]]=[f.list[j],f.list[i]];render();focusRow(S.selected);}
function removeSelection(fromToolbar=false){const f=find(S.selected);if(!canStructure())return;popup(`<h2>Remove ${esc(f.it.kind.toLowerCase())}?</h2><div class="controls">${btn('Cancel','data-close')}${btn('Remove element','data-remove data-tone="danger"')}</div>`,fromToolbar?$('[data-tool="remove"]'):contextTrigger(),{bind:p=>{p.querySelector('[data-remove]').onclick=()=>{closePopup(false);saveUndo();const i=f.list.indexOf(f.it);f.list.splice(i,1);const next=f.list[i]||f.list[i-1]||f.parent;S.selected=next.id;S.selection=[next.id];render();if(fromToolbar)focusTool('remove');else focusRow(next.id);};}});}
function openRowMenu(id,trigger){select(id);const it=selected();const f=find(id),index=f.list.indexOf(it);const actions=[...(it.children&&!it.component&&canStructure(id)?[['Make component','component']]:[]),...(mode==='after'&&CONFIG.id===1&&canStructure(id)?[['Duplicate','duplicate'],['Move up','up'],['Move down','down'],['Remove','remove']]:[])];popup(`<div class="p-menu" role="menu" aria-label="Element actions">${actions.map(([name,key])=>`<button class="p-menu-item" role="menuitem" data-menu-action="${key}" ${key==='up'&&index===0||key==='down'&&index===f.list.length-1?'disabled':''}>${esc(name)}</button>`).join('')||'<button class="p-menu-item" disabled>No actions</button>'}</div>`,contextTrigger(),{bind:p=>p.querySelectorAll('[data-menu-action]').forEach(b=>b.onclick=()=>{const key=b.dataset.menuAction;closePopup(false);if(key==='duplicate')duplicate(id);if(key==='up')move(-1);if(key==='down')move(1);if(key==='remove')removeSelection();if(key==='component'){saveUndo();it.component=true;render();focusRow(id);}})});}
function editText(id,trigger){const it=find(id)?.it;if(!it)return;popup(`<form>${field(it.kind+' text',it.text||S.heading,'id="generic-text"')}<div class="controls">${btn('Close','type="submit"')}</div></form>`,trigger,{bind:p=>{let recorded=false;p.querySelector('input').oninput=e=>{if(!recorded){saveUndo();recorded=true;}it.text=e.target.value;if(id==='h1')S.heading=it.text;renderTree();renderSite();};p.querySelector('form').onsubmit=e=>{e.preventDefault();closePopup();};}});}
function runStep(index){$$('[data-step]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.step===index)));S.demoStep=index;MODULE.steps[index]();$('#says').textContent=MODULE.say?.(index)||CONFIG.messages[index];}
$('#side').onclick=e=>{const row=e.target.closest('[data-id]');if(e.target.closest('[data-add]')){insertElement('Paragraph');return;}if(!row)return;const id=row.dataset.id,it=find(id).it,act=e.target.closest('[data-act]')?.dataset.act;if(act){if(act==='menu')openRowMenu(id,e.target);else if(act==='attrs')popup(`<h2>${esc(it.kind)}</h2>${field('Name',label(it),'readonly')}${field('Scope',it.component?'All pages':'This page','readonly')}`,e.target);else if(act==='edit-component'){select(id);$('#taskbar').innerHTML='<span class="component-scope">'+esc(it.kind)+' · All pages</span>'+btn('Done','data-done-component');$('[data-done-component]').onclick=()=>render();}else if(act==='detach'){saveUndo();it.component=false;it.children?.forEach(n=>n.part=false);render();}else if(act==='slot')editText(id,e.target);return;}if(e.target.closest('[data-toggle]')&&it.children){S.folded=S.folded.includes(id)?S.folded.filter(x=>x!==id):[...S.folded,id];render();focusRow(id);return;}if(CONFIG.id===7&&mode==='after'&&e.shiftKey)selectRange(id);else select(id,CONFIG.id===7&&mode==='after'&&(e.ctrlKey||e.metaKey||S.multi));focusRow(id);};
$('#side').oncontextmenu=e=>{const row=e.target.closest('[data-id]');if(row){e.preventDefault();openRowMenu(row.dataset.id,row);}};
$('#side').onkeydown=e=>{const row=e.target.closest('[role=treeitem]');if(!row||e.target!==row)return;const rows=flatten(),i=rows.findIndex(x=>x.it.id===row.dataset.id);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=rows[i+(e.key==='ArrowDown'?1:-1)];if(next){if(CONFIG.id===7&&mode==='after'&&e.shiftKey)selectRange(next.it.id);else select(next.it.id);focusRow(next.it.id);}}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const id=row.dataset.id;S.folded=e.key==='ArrowRight'?S.folded.filter(x=>x!==id):[...new Set([...S.folded,id])];render();focusRow(id);}if(e.key==='Enter'){e.preventDefault();if(!MODULE.activate?.(row.dataset.id,row)){select(row.dataset.id);focusRow(row.dataset.id);}}if(e.key==='F10'&&e.shiftKey){e.preventDefault();openRowMenu(row.dataset.id,row);}if(e.key===' '){e.preventDefault();select(row.dataset.id,CONFIG.id===7&&mode==='after');focusRow(row.dataset.id);}};
$('#site').onclick=e=>{const route=e.target.closest('[data-route]');if(route){e.preventDefault();navigate(route.dataset.route);return;}const el=e.target.closest('[data-node]');if(!el)return;if(e.target.closest('a'))e.preventDefault();if(CONFIG.id===5&&el.dataset.node==='p1')return;if(MODULE.activate?.(el.dataset.node,el))return;if(CONFIG.id===7&&mode==='after'&&e.shiftKey)selectRange(el.dataset.node);else select(el.dataset.node,CONFIG.id===7&&mode==='after'&&(e.ctrlKey||e.metaKey||S.multi));$(`#site [data-node="${el.dataset.node}"]`)?.focus();};
$('#site').onkeydown=e=>{if(e.target.closest('[contenteditable]')||e.target.matches('button,a,input,textarea,select'))return;const el=e.target.closest('[data-node]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();MODULE.activate?.(el.dataset.node,el)||select(el.dataset.node);}};
function navigate(route){S.route=route;render();}
function insertElement(kind){saveUndo();const f=find(S.selected);const list=f?.it.children||f?.list||tree[1].children;const id='new-'+(++sequence);const item={id,kind,icon:kind==='Heading'?'heading':'paragraph',text:kind==='Heading'?'Made for your morning':'Baked with care, shared with you.'};list.push(item);S.selected=id;S.selection=[id];render();focusRow(id);}
$('#undo').onclick=undoAction;
$('#popup').onclick=e=>{if(e.target.closest('[data-close]'))closePopup();};
$('#popup').onkeydown=e=>{if(e.key==='Escape'){closePopup();return;}const controls=[...$('#popup').querySelectorAll('button:not(:disabled),input,select,textarea')];if(e.key==='Tab'&&controls.length){const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!e.target.matches('input,textarea,select')){e.preventDefault();const i=controls.indexOf(document.activeElement);controls[(i+(e.key==='ArrowDown'?1:-1)+controls.length)%controls.length]?.focus();}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePopup(false);if(!$('#media-dialog').open)focusRow(S.selected);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target.matches('input,textarea')){if(e.target.closest('[contenteditable]')&&CONFIG.id!==5)return;e.preventDefault();undoAction();}MODULE.key?.(e);});
$$('[data-mode-set]').forEach(b=>b.onclick=()=>{mode=document.body.dataset.mode=b.dataset.modeSet;$$('[data-mode-set]').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));reset();});
$$('[data-theme-set]').forEach(b=>b.onclick=()=>{document.documentElement.style.colorScheme=b.dataset.themeSet;$$('[data-theme-set]').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));});
'''
TASKS = [
('01-row-menu','Element row actions',
 ['Select a nested section','Open its row menu','Duplicate from the tree','Move the copy'],
 'Open the nested Our loaves section and compare the menu with the canvas edit bar.',
 ['The section has real neighbours, child rows and a matching selection on the page.','Today only Make component is in the tree menu; After has the same structure actions as the edit bar.','Today leaves the row menu open; After duplicates the selected section in both tree and page.','The selected section moves in the tree and on the page.'],r'''
const MODULE={reset(){S.selected='sec2';S.selection=['sec2'];},bar(){const f=find(S.selected),allowed=canStructure();return `<span class="scope">${esc(selected()?.kind||'Element')} · This page</span>${ib('Duplicate element','copy',`data-tool="duplicate" ${!allowed?'disabled':''}`)}${ib('Move element up','up',`data-tool="up" ${!allowed||f.list.indexOf(f.it)===0?'disabled':''}`)}${ib('Move element down','down',`data-tool="down" ${!allowed||f.list.indexOf(f.it)===f.list.length-1?'disabled':''}`)}${ib('Remove selected element','trash',`data-tool="remove" ${!allowed?'disabled':''}`)}`;},bind(){$$('[data-tool]').forEach(b=>b.onclick=()=>{const a=b.dataset.tool;if(a==='duplicate')duplicate(S.selected);if(a==='up')move(-1);if(a==='down')move(1);if(a==='remove')removeSelection(true);else focusTool(a);});},steps:[()=>{select('sec2');focusRow('sec2');},()=>openRowMenu(S.selected,contextTrigger()),()=>{if(mode==='today')openRowMenu(S.selected,contextTrigger());else{closePopup(false);duplicate(S.selected);}},()=>{closePopup(false);move(-1);}]};
'''),
('02-link-popup','Link popup outside the selected words',
 ['Select the paragraph','Open the link popup','Choose About','Link the words'],
 'The Address popup works on the actual hero paragraph. Today covers the selected words.',
 ['The selected words are in the hero, with their heading and image still in view.','Today covers the words. After places Address below the complete paragraph.','The existing page choice fills the Address control.','The paragraph now contains the link; the Link control shows Linked.'],r'''
function openLink(){select('p1');reveal('p1');const paragraph=$('#site [data-node="p1"]');paragraph.classList.add('link-demo-selection');const range=document.createRange();range.selectNodeContents(paragraph);getSelection().removeAllRanges();getSelection().addRange(range);popup(`<form id="link-form">${field('Address',S.linkAddress||'/loaves/','id="link-address" required')}<div class="controls">${btn('About','id="choose-about"')}${btn('Link','id="submit-link" type="submit" data-tone="primary"')}</div></form>`,$('#link-trigger'),{bind:p=>{p.querySelector('#choose-about').onclick=()=>{p.querySelector('input').value='/about/';p.querySelector('input').focus();};p.querySelector('form').onsubmit=e=>{e.preventDefault();const input=p.querySelector('input'),value=input.value.trim();if(!/^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(value)){input.setCustomValidity('Use a page, web address or email link.');input.reportValidity();return;}saveUndo();S.linkAddress=value;S.rich.p1='<p><a href="'+esc(value)+'">'+esc(find('p1').it.text)+'</a></p>';closePopup(false);render();$('#link-trigger')?.focus();};p.querySelector('input').oninput=e=>e.target.setCustomValidity('');}});const p=$('#popup'),r=paragraph.getBoundingClientRect(),box=p.getBoundingClientRect();p.style.insetInlineStart=Math.max(12,Math.min(r.left,innerWidth-box.width-12))+'px';p.style.insetBlockStart=(mode==='today'?r.top:r.bottom+12)+'px';if(mode==='after'&&r.bottom+box.height+24>innerHeight){if(r.top>box.height+24)p.style.insetBlockStart=(r.top-box.height-12)+'px';else{p.style.maxBlockSize=Math.max(80,innerHeight-r.bottom-24)+'px';}}}
const MODULE={reset(){S.selected='p1';S.selection=['p1'];},bar(){return `<span class="scope">Paragraph · This page</span>${ib(S.linkAddress?'Linked':'Link selected words',S.linkAddress?'check':'link','id="link-trigger" data-tool="link"')}`;},bind(){$('#link-trigger').onclick=openLink;},activate(id){if(id==='p1'){openLink();return true;}},key(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if($('#popup').matches(':popover-open')&&$('#link-address'))return;openLink();}},steps:[()=>{select('p1');reveal('p1');},openLink,()=>{if(!$('#popup').matches(':popover-open')||!$('#choose-about'))openLink();$('#choose-about').click();},()=>{if(!$('#popup').matches(':popover-open')||!$('#submit-link'))openLink();$('#link-form').requestSubmit();}]};
'''),
('03-canvas-page','Canvas page identity',
 ['Follow About on the page','Inspect the source title','Select the About heading','Return to Home'],
 'Follow a page link and compare the canvas page control with the independently opened source.',
 ['Today still says Home while the page shows About. After names the canvas About immediately.','The source pane still identifies index.html; independent source browsing remains available.','Selecting the heading opens that page’s source, as it does today.','Home is shown again, with its own page identity.'],r'''
const MODULE={bar(){return `<span class="scope">Canvas · ${esc(S.route)}</span>`;},under(){return `<section class="source-pane"><h2 class="p-heading">Source · <span id="source-title">${esc(S.source)}</span></h2><pre>${esc(S.source==='index.html'?'<h1>Fresh bread every morning</h1>':'<h1>About our bakery</h1>')}</pre></section>`;},activate(id){if(id==='h1'){S.source=S.route==='Home'?'index.html':'about.html';select(id);return true;}},steps:[()=>navigate('About'),()=>$('#source-title').scrollIntoView({block:'center'}),()=>{S.source=S.route==='Home'?'index.html':'about.html';select('h1');},()=>navigate('Home')]};
'''),
('04-media-details','Media details without losing unfinished work',
 ['Open file details','Write an unfinished description','Go Back','Reopen the same file','Discard the unfinished form'],
 'Compare the image and primary fields, then leave an unfinished description through Back.',
 ['Today stacks a large stage before the fields. After puts the inspector near the top on desktop.','The description is unfinished; Save details is still a separate transaction.','Back returns to Media. Today discards the unfinished form; After retains it.','The same file opens with the state that survived Back.','After restores the saved description explicitly; Today already lost the unfinished words.'],r'''
function mediaDirty(){return S.draft!==S.savedDescription||S.collection!==S.savedCollection;}
function mediaButtons(){const dirty=mediaDirty();$('#save-details').disabled=!dirty;$('#save-details').textContent=dirty?'Save details':'Saved';if($('#discard-details'))$('#discard-details').disabled=!dirty;}
function showMedia(view=S.mediaView){const previousPlay=document.activeElement?.dataset.play;S.mediaView=view;const d=$('#media-dialog');const restoreFocus=()=>d.querySelector(previousPlay!==undefined?'[data-play="'+previousPlay+'"]':view==='gallery'?'#open-bread':'#media-back')?.focus();d.innerHTML=`<section class="demo media-demo" aria-label="Media mock-up steps"><h2>Play a step (not part of the editor)</h2><div class="steps">${CONFIG.steps.map((name,i)=>`<button data-play="${i}" aria-pressed="${S.demoStep===i}">${esc(name)}</button>`).join('')}</div></section><header class="media-top">${view==='details'?ib('Back to media','back','id="media-back"'):''}<strong>${view==='details'?'Morning loaves':'Media'}</strong>${ib('Close media','x','id="media-close"')}</header>`+(view==='gallery'?`<button class="p-tile" data-look="raised" id="open-bread" aria-label="Open Morning loaves"><span class="media-stage">${picture()}</span><span class="title">Morning loaves</span></button>`:`<div class="media-layout"><div class="media-stage">${picture()}</div><form class="form-stack" id="media-form"><h2>Morning loaves</h2><label class="field">Description<textarea id="description" aria-label="Description">${esc(S.draft)}</textarea></label><label class="field">Collection<select id="collection" aria-label="Collection"><option ${S.collection==='Bakery'?'selected':''}>Bakery</option><option ${S.collection==='Work'?'selected':''}>Work</option></select></label><div class="controls">${mode==='after'?btn('Discard','id="discard-details"'):''}${btn('Save details','id="save-details" type="submit" data-tone="primary"')}</div></form></div>`);if(!d.open)d.showModal();d.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>runStep(+b.dataset.play));$('#media-close').onclick=()=>d.close();if(view==='gallery'){$('#open-bread').onclick=()=>showMedia('details');restoreFocus();return;}$('#media-back').onclick=()=>{if(mode==='today'){S.draft=S.savedDescription;S.collection=S.savedCollection;}showMedia('gallery');};$('#description').oninput=e=>{S.draft=e.target.value;mediaButtons();};$('#collection').onchange=e=>{S.collection=e.target.value;mediaButtons();};$('#discard-details')?.addEventListener('click',()=>{S.draft=S.savedDescription;S.collection=S.savedCollection;showMedia('details');$('#description').focus();});$('#media-form').onsubmit=e=>{e.preventDefault();saveUndo();S.savedDescription=S.draft;S.savedCollection=S.collection;mediaButtons();};mediaButtons();restoreFocus();}
const MODULE={reset(){S.selected='img';S.selection=['img'];},bar(){return `<span class="scope">Image · This page</span>${btn('Media','id="media-trigger"')}`;},bind(){$('#media-trigger').onclick=()=>showMedia('gallery');},activate(id){if(id==='img'){showMedia('details');return true;}},steps:[()=>showMedia('details'),()=>{showMedia('details');S.draft='Unfinished description';$('#description').value=S.draft;mediaButtons();$('#description').focus();},()=>{showMedia('details');$('#media-back').click();},()=>showMedia('details'),()=>{showMedia('details');$('#discard-details')?.click();}]};
'''),
('05-clean-paste','Paste that keeps the structure',
 ['Select the hero paragraph','Paste prepared copy','Undo the paste','Use Plain text'],
 'Paste into the real hero paragraph. The prepared clipboard has paragraphs, bold words, a link and a list.',
 ['The hero paragraph accepts normal typing and a real paste.','Today flattens the copy and loses the list. After retains structure and safe links, dropping foreign styling.','One Undo restores the previous paragraph.','The format control itself selects Plain text before the next paste.'],r'''
const SAMPLE='<p style="font-family:serif;color:red">Meet our <strong>small bakery</strong>.</p><p>Explore <a href="/loaves/">our loaves</a>.</p><ul><li>Sourdough</li><li>Rye</li></ul>';
function cleanPaste(raw){const doc=new DOMParser().parseFromString(raw,'text/html');const allowed=new Set(['P','BR','UL','OL','LI','STRONG','EM','B','I','A']);function walk(n){if(n.nodeType===3)return document.createTextNode(n.textContent);const out=document.createDocumentFragment();if(n.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT'].includes(n.tagName))return out;const el=allowed.has(n.tagName)?document.createElement(n.tagName.toLowerCase()):out;if(n.tagName==='A'){const h=n.getAttribute('href')||'';if(/^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(h))el.setAttribute('href',h);}n.childNodes.forEach(c=>el.append(walk(c)));return el;}const result=document.createElement('div');doc.body.childNodes.forEach(n=>result.append(walk(n)));return result.innerHTML;}
function pasteCopy(rich=SAMPLE,plain='Meet our small bakery. Explore our loaves. Sourdough Rye',sample=true){const el=$('#site [data-node="p1"]');saveUndo();S.typingActive=false;const content=mode==='after'&&S.pasteMode==='clean'?cleanPaste(rich||'<p>'+esc(plain)+'</p>'):'<p>'+esc(plain.replace(/\s+/g,' ').trim())+'</p>';if(sample)S.rich.p1=content;else{const selection=getSelection();let range=selection?.rangeCount?selection.getRangeAt(0):null;if(!range||!el.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(el);range.collapse(false);}range.deleteContents();let block=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement).closest('p');const fragment=range.createContextualFragment(content);if(block&&block.parentElement===el){const tailRange=range.cloneRange();tailRange.setEnd(block,block.childNodes.length);const after=document.createElement('p');after.append(tailRange.extractContents());const last=fragment.lastChild;block.after(fragment);if(after.textContent)last.after(after);if(!block.textContent)block.remove();}else range.insertNode(fragment);S.rich.p1=el.innerHTML;}S.pasted=true;render();$('[data-node="p1"]').focus();}
const MODULE={reset(){S.selected='p1';S.selection=['p1'];},bar(){return `<span class="scope">Paragraph · This page</span>${mode==='after'?`<label class="field">Paste format<select id="paste-format" aria-label="Paste format"><option value="clean" ${S.pasteMode==='clean'?'selected':''}>Keep structure</option><option value="plain" ${S.pasteMode==='plain'?'selected':''}>Plain text</option></select></label>`:''}${ib('Undo paste','undo',`id="undo-paste" ${!undo.length?'disabled':''}`)}`;},bind(){const el=$('#site [data-node="p1"]');el.onpaste=e=>{e.preventDefault();pasteCopy(e.clipboardData.getData('text/html'),e.clipboardData.getData('text/plain'),false);};el.onbeforeinput=()=>{if(!S.typingActive){saveUndo();S.typingActive=true;}};el.onblur=()=>S.typingActive=false;el.oninput=()=>{S.rich.p1=el.innerHTML;};$('#paste-format')?.addEventListener('change',e=>S.pasteMode=e.target.value);$('#undo-paste').onclick=undoAction;},steps:[()=>{select('p1');reveal('p1');$('#site [data-node="p1"]').focus();},()=>{reveal('p1');pasteCopy();},undoAction,()=>{if(mode==='after'){S.pasteMode='plain';render();}pasteCopy();}]};
'''),
('06-unique-anchors','Unique section anchors on duplicate',
 ['Select the linked section','Duplicate the section','Duplicate once more','Inspect the copied link'],
 'The Our loaves section has an anchor and a link inside it. Duplicate it to compare addresses.',
 ['The selected section is linked from its own content; its anchor is shown on the control.','Today copies the same anchor. After chooses the next unused name and rewrites the copied link.','Repeated duplication produces another distinct name in After.','The source view shows the selected section’s actual anchor and link together.'],r'''
const MODULE={reset(){S.selected='sec2';S.selection=['sec2'];},bar(){const it=selected();return `<span class="scope">Section · This page</span>${btn('Duplicate section','id="duplicate-section"')}<label class="field">Anchor name<input id="anchor-name" aria-label="Anchor name" value="${esc(it?.anchor||'')}" readonly></label>`;},under(){const it=selected();return `<section class="source-pane"><h2 class="p-heading">Source · Selected section</h2><pre id="anchor-source">${esc('<section id="'+(it?.anchor||'')+'">\n  <a href="#'+(it?.anchor||'')+'">See this selection</a>\n</section>')}</pre></section>`;},bind(){$('#duplicate-section').onclick=()=>{closePopup(false);duplicate(S.selected,mode==='after');};},steps:[()=>{select('sec2');reveal('sec2');},()=>{$('#duplicate-section').click();},()=>{$('#duplicate-section').click();},()=>$('#anchor-source').scrollIntoView({block:'center'})]};
'''),
('07-multi-select','Select elements across the real tree and page',
 ['Select two hero children','Wrap the selection','Unwrap it','Copy and paste the elements','Select across depths'],
 'Use Shift-click, the Select several control, or Shift with arrow keys. Different parent scopes stay visible.',
 ['Today selects only the last row. After highlights both the heading and paragraph in tree and page.','After wraps adjacent siblings in a real Div, visible in the tree and on the page.','Unwrap removes that Div while retaining its children.','Copy and paste create new elements in both tree and page.','After selects a hero paragraph and a deeper list item. Wrap is unavailable across their different parents.'],r'''
function roots(){return all().filter(x=>S.selection.includes(x.it.id)&&!all().some(y=>S.selection.includes(y.it.id)&&y.it.id!==x.it.id&&contains(y.it,x.it.id)));}
function contains(it,id){return !!it.children?.some(n=>n.id===id||contains(n,id));}
function canWrap(){const list=roots();if(!list.length||!list.every(x=>canStructure(x.it.id)&&x.parent.id===list[0].parent.id))return false;const indices=list.map(x=>x.list.indexOf(x.it)).sort((a,b)=>a-b);return indices.at(-1)-indices[0]+1===indices.length;}
function wrap(){if(!canWrap())return;saveUndo();const items=roots(),list=items[0].list,index=list.indexOf(items[0].it),wrapper={id:'wrap-'+(++sequence),kind:'Div',icon:'div',container:true,children:items.map(x=>x.it)};list.splice(index,items.length,wrapper);S.selected=wrapper.id;S.selection=[wrapper.id];render();focusRow(wrapper.id);}
function unwrap(){const f=find(S.selected);if(f?.it.kind!=='Div')return;saveUndo();f.list.splice(f.list.indexOf(f.it),1,...f.it.children);S.selection=f.it.children.map(x=>x.id);S.selected=S.selection[0];render();focusRow(S.selected);}
function canCopy(){const items=roots();return items.length>0&&items.every(x=>canStructure(x.it.id));}
function copyElements(){if(!canCopy())return;S.clipboard=structuredClone(roots().map(x=>x.it));S.copied=true;render();focusRow(S.selected);}
function pasteElements(){if(!S.clipboard.length)return;const f=find(S.selected);if(!f?.parent||f.it.part)return;saveUndo();const copies=structuredClone(S.clipboard);function visit(n){n.id=n.id+'-paste-'+(++sequence);if(n.anchor)n.anchor+='-'+sequence;n.children?.forEach(visit);}copies.forEach(visit);f.list.splice(f.list.indexOf(f.it)+1,0,...copies);S.selection=copies.map(n=>n.id);S.selected=S.selection[0];render();focusRow(S.selected);}
const MODULE={bar(){return mode==='after'?`<span class="scope">Selection · This page</span>${btn('Select several',`id="multi-toggle" aria-pressed="${S.multi}"`)}${btn('Wrap',`id="wrap" ${!canWrap()?'disabled':''}`)}${btn('Unwrap',`id="unwrap" ${selected()?.kind!=='Div'?'disabled':''}`)}${ib(S.copied?'Elements copied':'Copy elements',S.copied?'check':'copy',`id="copy-elements" ${!canCopy()?'disabled':''}`)}${btn('Paste elements',`id="paste-elements" ${!S.clipboard.length||!canStructure()?'disabled':''}`)}`:`<span class="scope">${esc(selected()?.kind||'Element')} · This page</span>${ib('Duplicate element','copy','id="duplicate-one"')}`;},bind(){if(mode==='today'){$('#duplicate-one').onclick=()=>duplicate(S.selected);return;}$('#multi-toggle').onclick=()=>{S.multi=!S.multi;render();$('#multi-toggle').focus();};$('#wrap').onclick=wrap;$('#unwrap').onclick=unwrap;$('#copy-elements').onclick=copyElements;$('#paste-elements').onclick=pasteElements;},key(e){if(mode!=='after'||!e.target.closest('#side,#site,#taskbar')||e.target.matches('input,textarea'))return;if((e.ctrlKey||e.metaKey)&&['c','v'].includes(e.key.toLowerCase())){e.preventDefault();if(e.key.toLowerCase()==='c')copyElements();else pasteElements();}},steps:[()=>{select('h1');select('p1',mode==='after');focusRow('p1');},()=>{if(mode==='after'){if(!canWrap()){select('h1');select('p1',true);}wrap();}},()=>{if(mode==='after'){const w=all().find(x=>x.it.kind==='Div');if(w){select(w.it.id);unwrap();}}},()=>{if(mode==='after'){select('h1');select('p1',true);copyElements();pasteElements();}},()=>{select('p1');select('bread1',mode==='after');focusRow('bread1');}]};
'''),
('08-command-search','Extend the existing command palette',
 ['Open command search','Insert a heading','Find the paragraph','Duplicate the selection'],
 'Existing insertion remains in Today. After adds element finding and selection actions in that same palette.',
 ['The same command window includes pages, actions and existing primitive insertion.','Add Heading already works in Today and After; it is not presented as a new feature.','Only After finds the live paragraph in its ancestor context.','Only After exposes Duplicate selection; it acts on the selection just found.'],r'''
let commandActive=0;
function commandList(q=''){const list=[{name:'Add Heading',run:()=>insertElement('Heading')},{name:'Add Paragraph',run:()=>insertElement('Paragraph')},{name:'Home',run:()=>navigate('Home')},{name:'About',run:()=>navigate('About')},{name:'Show code',run:()=>{S.code=true;render();}}];if(mode==='after')list.push(...all().map(x=>({name:'Find '+label(x.it),keywords:x.it.kind+' '+x.it.id,run:()=>{let parent=x.parent;while(parent){S.folded=S.folded.filter(id=>id!==parent.id);parent=find(parent.id)?.parent;}select(x.it.id);focusRow(x.it.id);reveal(x.it.id);}})),{name:'Duplicate selection',run:()=>duplicate(S.selected)});return list.filter(c=>(c.name+' '+(c.keywords||'')).toLowerCase().includes(q.toLowerCase()));}
function commandResults(){const list=commandList($('#query').value);commandActive=Math.min(commandActive,Math.max(0,list.length-1));$('#command-results').innerHTML=list.length?list.map((c,i)=>`<button class="p-menu-item" role="option" aria-selected="${i===commandActive}" id="command-${i}" data-command="${i}">${esc(c.name)}</button>`).join(''):'<div class="p-empty">No commands</div>';$('#query').setAttribute('aria-activedescendant',list.length?'command-'+commandActive:'');$$('[data-command]').forEach(b=>b.onclick=()=>executeCommand(+b.dataset.command));}
function executeCommand(i=commandActive){const c=commandList($('#query').value)[i];if(!c)return;closePopup(false);c.run();focusRow(S.selected);}
function openCommands(query=''){commandActive=0;popup(`<form id="command-form"><label class="field">Search commands<input id="query" role="combobox" aria-label="Search commands" aria-controls="command-results" aria-expanded="true" autocomplete="off"></label><div id="command-results" role="listbox" aria-label="Commands"></div></form>`,$('#command-trigger'),{bind:p=>{p.querySelector('#query').value=query;p.querySelector('#query').oninput=()=>{commandActive=0;commandResults();};p.querySelector('#query').onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=commandList(e.target.value).length;if(n)commandActive=(commandActive+(e.key==='ArrowDown'?1:-1)+n)%n;commandResults();}};p.querySelector('form').onsubmit=e=>{e.preventDefault();executeCommand();};commandResults();}});}
const MODULE={reset(){S.selected='sec1';S.selection=['sec1'];},bar(){return `<span class="scope">${esc(selected()?.kind||'Page')} · This page</span>${ib('Command palette','search','id="command-trigger"')}`;},under(){return S.code?'<section class="source-pane"><h2 class="p-heading">Source · index.html</h2><pre>&lt;main&gt;…&lt;/main&gt;</pre></section>':'';},bind(){$('#command-trigger').onclick=()=>openCommands();},key(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommands();}},steps:[()=>openCommands(),()=>{openCommands('Add Heading');executeCommand(0);},()=>{openCommands('Find Baked before');if(mode==='after')executeCommand(0);},()=>{openCommands('Duplicate selection');if(mode==='after')executeCommand(0);}]};
'''),
('09-shared-change','Preview the pages a shared change touches',
 ['Edit the shared brand','Review affected pages','Open About','Save on both pages','Undo the save'],
 'Edit Site header in its existing shared scope, then inspect each affected page before saving.',
 ['The header changes in the draft, with the shared scope kept visible.','Today saves directly. After lists both affected pages before saving.','The same shared draft is shown on About; the review remains open.','The Save control now says Saved on both pages.','Undo returns the save to a pending draft.'],r'''
function sharedReview(){if(mode==='today'){sharedSave();return;}popup(`<h2>Site header · All pages</h2>${['Home','About'].map(route=>`<button class="p-menu-item" data-affected="${route}" aria-current="${S.route===route}" aria-label="Open ${route}"><span>${route}</span><span>${esc(S.savedBrand)} → ${esc(S.brand)}</span></button>`).join('')}<hr><div class="controls">${btn('Cancel','data-close')}${btn('Save on both pages','id="save-both" data-tone="primary"')}</div>`,$('#save-shared'),{bind:p=>{p.querySelectorAll('[data-affected]').forEach(b=>b.onclick=()=>{navigate(b.dataset.affected);p.querySelectorAll('[data-affected]').forEach(x=>x.setAttribute('aria-current',String(x===b)));b.focus();});p.querySelector('#save-both').onclick=sharedSave;}});}
function sharedSave(){if(!S.brand.trim()||S.brand===S.savedBrand)return;saveUndo();S.savedBrand=S.brand;S.justSaved=true;closePopup(false);render();$('#brand-name').focus();}
const MODULE={reset(){S.selected='header';S.selection=['header'];},bar(){return `<span class="scope component-scope">Site header · All pages</span><label class="field">Brand name<input id="brand-name" aria-label="Brand name" value="${esc(S.brand)}" required></label>${btn(S.justSaved?'Saved on both pages':'Save shared change',`id="save-shared" ${!S.brand.trim()||S.brand===S.savedBrand?'disabled':''}`)}`;},bind(){$('#brand-name').oninput=e=>{S.brand=e.target.value;S.justSaved=false;$('#site [data-node="logo"]').textContent=S.brand;$('#save-shared').textContent='Save shared change';$('#save-shared').disabled=!S.brand.trim()||S.brand===S.savedBrand;};$('#save-shared').onclick=sharedReview;},steps:[()=>{S.brand='Morning Bakery';S.justSaved=false;render();$('#brand-name').focus();},()=>{if(S.brand===S.savedBrand){S.brand='Morning Bakery';render();}sharedReview();},()=>{if(mode==='after'){if(!$('#popup').matches(':popover-open')||!$('#save-both'))sharedReview();$('[data-affected="About"]')?.click();}else navigate('About');},()=>{if(S.brand===S.savedBrand){S.brand='Morning Bakery';render();}sharedSave();},undoAction]};
'''),
('10-client-bar','A client edit bar over the actual page',
 ['Choose approved fields','Preview as client','Edit the heading','Change the picture','Return to designer'],
 'The designer previews approved text, links and images over the complete site, without structure or publishing controls.',
 ['After lets the designer approve the three field kinds. Today has the existing guest text route.','The complete page stays visible; only approved field controls appear in the client bar.','Text changes immediately on the page.','After offers an approved image choice; Today remains text-only.','The designer returns to the same page, tree and current draft.'],r'''
function permissions(trigger){popup(`<h2>Client edits · Home</h2>${[['text','Text'],['link','Links'],['image','Images']].map(([key,name])=>`<label class="permission"><input type="checkbox" data-permission="${key}" ${S.permissions[key]?'checked':''}>${name}</label>`).join('')}`,trigger,{bind:p=>p.querySelectorAll('[data-permission]').forEach(b=>b.onchange=()=>S.permissions[b.dataset.permission]=b.checked)});}
function clientEdit(kind,trigger){if(!S.client||mode!=='after'||!S.permissions[kind])return;if(kind==='image'){popup(`<h2>Image</h2>${btn('Choose bakery table',`data-image="bread" aria-pressed="${S.image==='bread'}"`)}${btn('Choose garden',`data-image="garden" aria-pressed="${S.image==='garden'}"`)}`,trigger,{bind:p=>p.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{saveUndo();S.image=b.dataset.image;closePopup(false);render();$('#edit-image').focus();})});return;}const text=kind==='text',name=text?'Heading':'Address';popup(`<form>${field(name,text?S.heading:S.address,'id="client-value" required')}<div class="controls">${btn('Close','type="submit"')}</div></form>`,trigger,{bind:p=>{let remembered=false;p.querySelector('input').oninput=e=>{const value=e.target.value;if(text&&!value.trim()){e.target.setCustomValidity('The heading needs words.');return;}if(!text&&!/^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(value)){e.target.setCustomValidity('Use a page, web address or email link.');return;}e.target.setCustomValidity('');if(!remembered){saveUndo();remembered=true;}if(text)S.heading=value;else S.address=value;renderSite();};p.querySelector('form').onsubmit=e=>{e.preventDefault();closePopup(false);$('#edit-'+(text?'text':'link'))?.focus();};}});}
const MODULE={bar(){if(mode==='today')return `<span class="scope">Share to edit · Guest text</span>${btn(S.client?'Back to designer':'Preview guest text','id="client-toggle"')}`;if(!S.client)return `<span class="scope">Home · Designer</span>${btn('Approved fields','id="approve-fields"')}${btn('Preview as client','id="client-toggle"')}`;return `<span class="scope">Client edits · Home</span>${S.permissions.text?ib('Edit approved heading','pencil','id="edit-text"'):''}${S.permissions.link?ib('Edit approved link','link','id="edit-link"'):''}${S.permissions.image?ib('Edit approved image','image','id="edit-image"'):''}${btn('Back to designer','id="client-toggle"')}`;},bind(){$('#client-toggle').onclick=()=>{closePopup(false);S.client=!S.client;render();$('#client-toggle').focus();};$('#approve-fields')?.addEventListener('click',e=>permissions(e.currentTarget));for(const kind of ['text','link','image'])$('#edit-'+kind)?.addEventListener('click',e=>clientEdit(kind,e.currentTarget));if(mode==='today'&&S.client){const h=$('#site [data-node="h1"]');h.contentEditable='true';h.oninput=()=>S.heading=h.textContent;}},activate(id,trigger){if(!S.client)return false;const kind=id==='h1'?'text':id==='btn'?'link':id==='img'?'image':null;if(kind){clientEdit(kind,trigger);return true;}return true;},steps:[()=>{if(mode==='after'){if(S.client){S.client=false;render();}permissions($('#approve-fields'));}},()=>{closePopup(false);S.client=true;render();$('#client-toggle').focus();},()=>{if(!S.client){S.client=true;render();}if(mode==='after')clientEdit('text',$('#edit-text'));else{$('#site [data-node="h1"]').focus();}},()=>{if(mode==='after'){if(!S.client){S.client=true;render();}clientEdit('image',$('#edit-image'));}},()=>{closePopup(false);S.client=false;render();focusRow('h1');}]};
'''),
('11-style-source','Where one style value comes from',
 ['Inspect the selected section','Open Padding source','Reset this screen width','Reset this element','Undo Reset'],
 'This adds only the per-value source chain missing from styling v3; its existing scope and width controls remain the starting point.',
 ['Today shows the shipped source route. After adds the source entry beside one value.','The chain identifies the site token, component, element and winning screen-width override.','Removing the width override reveals the element’s value.','Removing the element override reveals the component’s site token.','Undo restores the removed override and its visible value.'],r'''
function padding(){return S.width==='phone'&&S.screen!==null?S.screen:S.local!==null?S.local:24;}
function styleSource(){const rows=[['Site token · Section space','24 px',false],['Component · Hero','Section space',S.local===null&&(S.width!=='phone'||S.screen===null)],['This element',S.local===null?'Inherited':S.local+' px',S.local!==null&&(S.width!=='phone'||S.screen===null)]];if(S.width==='phone')rows.push(['This screen width · Phone',S.screen===null?'Inherited':S.screen+' px',S.screen!==null]);popup(`<h2>Padding source</h2>${rows.map(([name,value,win])=>`<div class="source-row ${win?'winner':''}"><span>${name}</span><span>${win?'✓ ':''}${value}</span></div>`).join('')}<hr>${btn('Reset this element',`data-reset-style="local" ${S.local===null?'disabled':''}`)}${S.width==='phone'?btn('Reset this screen width',`data-reset-style="screen" ${S.screen===null?'disabled':''}`):''}${btn('Undo Reset',`id="undo-reset" ${!undo.length?'disabled':''}`)}`,$('#padding-source'),{bind:p=>{p.querySelectorAll('[data-reset-style]').forEach(b=>b.onclick=()=>{saveUndo();S[b.dataset.resetStyle]=null;closePopup(false);render();styleSource();});p.querySelector('#undo-reset').onclick=()=>{undoAction();styleSource();};}});}
const MODULE={reset(){S.selected='sec1';S.selection=['sec1'];},bar(){return mode==='after'?`<span class="scope">Hero · This element</span><label class="field">Screen width<select id="style-width" aria-label="Screen width"><option value="phone" ${S.width==='phone'?'selected':''}>Phone</option><option value="all" ${S.width==='all'?'selected':''}>All sizes</option></select></label><span class="scope">Padding <strong id="padding-value">${padding()} px</strong></span>${btn('Padding source','id="padding-source"')}`:'<span class="scope">Hero · Source</span>';},under(){return mode==='today'?'<section class="source-pane"><h2 class="p-heading">Source · Hero</h2><pre>section { padding: 32px; }\n@media (width &lt;= 390px) {\n  section { padding: 16px; }\n}</pre></section>':'';},bind(){if(mode==='after'){$('#site [data-node="sec1"]').style.padding=padding()+'px';$('#padding-source').onclick=styleSource;$('#style-width').onchange=e=>{S.width=e.target.value;render();$('#style-width').focus();};}},steps:[()=>{select('sec1');reveal('sec1');},()=>{if(mode==='after')styleSource();else $('#under-site').scrollIntoView({block:'center'});},()=>{if(mode==='after'){styleSource();$('[data-reset-style="screen"]')?.click();}},()=>{if(mode==='after'){styleSource();$('[data-reset-style="local"]')?.click();}},()=>{undoAction();if(mode==='after')styleSource();}]};
'''),
]
row = row.replace('S.folded.has(it.id)', 'S.folded.includes(it.id)')
row = row.replace('tabindex="${sel ? 0 : -1}"', 'tabindex="${S.selected === it.id ? 0 : -1}"')
extra_css += r'''
:root { --bakery-photo-bg:oklch(94% 0.035 75); --bakery-table:oklch(72% 0.085 60); --bakery-crust:oklch(62% 0.12 65); --bakery-cut:oklch(88% 0.08 80); --bakery-leaf:oklch(43% 0.06 140); }
.site :is(h3,p,ul,figure) { margin:0; }
.strip { position:static; }
.site a:not(.cta) { color:oklch(40% 0.1 50); }
.media-demo { margin-block-end:var(--space-m); }
@media (width <= 650px) { body[data-mode=today] .media-layout .media-stage { min-block-size:10rem; } body[data-mode=today] .media-layout .media-stage svg { block-size:10rem; } }
.site .loaves li { background:var(--bakery-photo-bg); color:oklch(30% 0.04 60); }
#popup [aria-selected=true],#popup [aria-current=true] { background:var(--current); }
.site .lead ul { padding-inline-start:var(--space-l); }
#taskbar:empty { display:none; }
'''
for number, (slug,title,steps,start,messages,module) in enumerate(TASKS,1):
    config=json.dumps(dict(id=number,start=start,messages=messages,steps=steps))
    buttons=''.join(f'<button type="button" data-step="{i}">{name}</button>' for i,name in enumerate(steps))+'<button type="button" data-restart>Start again</button>'
    html=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta content="width=device-width, initial-scale=1" name="viewport">
<meta content="light dark" name="color-scheme">
<title>Prototype · {title} · Today / After</title>
<!-- Offline planning comparison. The shell CSS, rowHtml renderer, component/slot row anatomy,
     icon paths and bakery page structure are reused from atomic-catalogue prototype 51.
     Only this task's proposal and its mock-up controls are added. -->
<style>{css}\n{extra_css}</style>
</head>
<body data-mode="today">
<main class="mock">
<header><h1>{title} <span class="tag">throwaway prototype</span></h1><p class="intro">Comparison, theme and Play a step controls belong to this mock-up. The editor below is freely clickable.</p></header>
<div class="strip"><a href="index.html">All prototypes</a><span class="seg" role="group" aria-label="Compare"><button data-mode-set="today" aria-pressed="true">Today</button><button data-mode-set="after" aria-pressed="false">After</button></span><span class="seg" role="group" aria-label="Theme"><button data-theme-set="light dark" aria-pressed="true">System</button><button data-theme-set="light" aria-pressed="false">Light</button><button data-theme-set="dark" aria-pressed="false">Dark</button></span></div>
<p class="summary">{start}</p>
<section class="demo" aria-label="Demo steps"><h2>Play a step (these buttons are not part of the editor)</h2><div class="steps">{buttons}</div><p class="says" id="says" aria-live="polite">{start}</p></section>
<article class="app" id="app" aria-label="Editor prototype"><header class="editor-top"><span class="project-name">Bakery</span><span id="page-name">Home</span><div id="editor-tools"><button type="button" class="p-icon-button p-press" id="undo" title="Undo" aria-label="Undo" disabled><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5-4 4 4 4M4 9h9a6 6 0 0 1 0 12"/></svg></button></div></header><div class="ws"><div class="sidebar-wrap" id="side"></div><div class="canvas" aria-label="Page canvas"><div class="editbar" id="taskbar"></div><div class="site" id="site"><footer data-node="footer"></footer></div><div id="under-site"></div></div></div></article>
</main><div id="popup" popover></div><dialog id="media-dialog" aria-label="Media"></dialog>
<script>{icons}\n{tree}\nconst CONFIG={config};\n{COMMON}\n{row}\n{module}\n$$('[data-step]').forEach(b=>b.onclick=()=>runStep(+b.dataset.step));\n$('[data-restart]').onclick=reset;\nreset();</script>
</body>
</html>'''
    (HERE/'prototypes'/f'{slug}.html').write_text(html)
print(f'Generated {len(TASKS)} standalone comparisons from catalogue 51.')
