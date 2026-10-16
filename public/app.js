/* Salon Finder | zero-dependency browser client | all provider data is untrusted */
'use strict';
const $=id=>document.getElementById(id);
const key='salonfinder.v1';
const catLabels={hair:'Hair & barber',beauty:'Beauty & nails',spa:'Spa & massage'};
const catIcons={hair:'✂',beauty:'✿',spa:'☼'};
const state={tab:'discover',mode:'demo',results:[],saved:{},notes:{},compare:[],view:'list',coords:null,center:null,radius:5,category:'all',location:'London, United Kingdom',unit:'km',searching:false,error:'',controller:null};
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=escapeHTML;
function safeWeb(x) {try{const u=new URL(x);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function dist(s) {const v=state.unit==='mi'?s.distanceKm*.621371:s.distanceKm;return `${v.toFixed(1)} ${state.unit}`;}
function localRead() {try{const x=JSON.parse(localStorage.getItem(key)||'{}');if(x&&typeof x==='object'){state.saved=x.saved&&typeof x.saved==='object'?x.saved:{};state.notes=x.notes&&typeof x.notes==='object'?x.notes:{};state.unit=x.unit==='mi'?'mi':'km';}}catch{}}
function localWrite(){try{localStorage.setItem(key,JSON.stringify({saved:state.saved,notes:state.notes,unit:state.unit}));}catch{showToast('Browser storage is unavailable. Changes may not be saved.');}}
function showToast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{el.hidden=true;},3600);}
function setBusy(v){state.searching=v;$('loading').hidden=!v;$('results-list').setAttribute('aria-busy',String(v));$('search-form').querySelector('button[type="submit"]').disabled=v;}
function formInput(){const form=$('search-form');return {location:$('location').value.trim(),category:form.querySelector('[name="category"]:checked')?.value||'all',radius:Number($('radius').value),coords:state.coords};}
function syncUrl(input){if(input.coords)return;const u=new URL(window.location.href);u.searchParams.set('location',input.location);u.searchParams.set('category',input.category);u.searchParams.set('radius',String(input.radius));history.replaceState(null,'',u.pathname+u.search+u.hash);}
async function doSearch(){const input=formInput();if(!input.coords&&(input.location.length<2||input.location.length>120)){showToast('Enter a city, town or postcode.');$('location').focus();return;}
  if(state.controller)state.controller.abort();const controller=new AbortController();state.controller=controller;
  state.tab='discover';state.error='';state.compare=[];state.location=input.location;state.category=input.category;state.radius=input.radius;
  setBusy(true);$('error').hidden=true;$('empty').hidden=true;$('results-list').replaceChildren();$('map-panel').hidden=true;updateTabs();updateCompare();
  const params=new URLSearchParams({location:input.coords?'Nearby':input.location,category:input.category,radius:String(input.radius)});
  if(input.coords){params.set('lat',String(input.coords.lat));params.set('lon',String(input.coords.lon));}
  else syncUrl(input);
  try {const response=await fetch('/api/search?'+params.toString(),{signal:controller.signal});const data=await response.json();
    if(!response.ok)throw Error(data.message||'Search is temporarily unavailable.');
    if(controller!==state.controller)return;
    state.results=Array.isArray(data.salons)?data.salons:[];state.center=data.center;state.mode=data.mode;
    const banner=$('mode-banner');banner.classList.toggle('demo',data.mode==='demo');banner.innerHTML=`<span class="mode-symbol" aria-hidden="true">${data.mode==='demo'?'⚠':'ⓘ'}</span><span>${escapeHTML(data.notice||'')}</span>`;
    $('results-title').textContent=data.mode==='demo'?'Explore the experience':'Salons near '+(data.center?.label||input.location);
    $('results-sub').textContent=data.mode==='demo'?'Fictional examples · explore all features safely':'Discover options, then verify services and appointments directly.';
    updateAll();
  } catch(e){if(e.name==='AbortError'||controller!==state.controller)return;state.error=e.message||'Something went wrong';$('error-message').textContent=state.error;updateAll();}
  finally{if(controller===state.controller){setBusy(false);renderResults();}}
}
function visibleItems(){let items=state.tab==='saved'?Object.values(state.saved):state.results.slice();const needWeb=$('filter-web').checked,needPhone=$('filter-phone').checked,needAccess=$('filter-access').checked,onlySaved=$('filter-saved').checked;
  items=items.filter(s=>!needWeb||!!safeWeb(s.website)).filter(s=>!needPhone||!!s.phone).filter(s=>!needAccess||!!s.wheelchair).filter(s=>!onlySaved||!!state.saved[s.id]);
  const sort=$('sort').value;
  if(sort==='name')items.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='contact')items.sort((a,b)=>Number(!!b.website)+Number(!!b.phone)-Number(!!a.website)-Number(!!a.phone)||a.distanceKm-b.distanceKm);
  else items.sort((a,b)=>a.distanceKm-b.distanceKm);
  return items;
}
function updateAll(){updateTabs();updateCounters();renderResults();updateCompare();}
function updateTabs(){document.querySelectorAll('[data-tab]').forEach(btn=>{const active=btn.dataset.tab===state.tab;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});$('results-title').textContent=state.tab==='saved'?'Your saved favourites':state.mode==='demo'?'Explore the experience':'Salons near '+(state.center?.label||state.location);if(state.tab==='saved')$('results-sub').textContent='Your local shortlist, kept privately in this browser.';}
function updateCounters(){$('saved-count').textContent=Object.keys(state.saved).length;$('compare-count').textContent=state.compare.length;}
function card(s,index){const saved=!!state.saved[s.id],compared=state.compare.includes(s.id),color=['sage','peach','lilac','cream'][index%4];const hasWeb=!!safeWeb(s.website);const type=catLabels[s.category]||'Salon';
  return `<article class="salon-card" data-id="${attr(s.id)}"><div class="salon-portrait ${color}" aria-hidden="true"><div class="portrait-shape">${catIcons[s.category]||'✳'}</div><span class="portrait-dots">✦</span></div><div class="salon-info"><div class="salon-heading"><div><p class="salon-kicker">${escapeHTML(type)} ${s.demo?'<span class="demo-chip">FICTIONAL DEMO</span>':''}</p><h3>${escapeHTML(s.name)}</h3></div><button type="button" class="heart-btn ${saved?'is-saved':''}" data-action="save" data-id="${attr(s.id)}" aria-label="${saved?'Remove':'Save'} ${attr(s.name)}" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div><p class="salon-address">⌖ ${escapeHTML(s.address||'Address not listed')}</p><div class="salon-meta"><span class="meta-pill"><strong>${escapeHTML(dist(s))}</strong> away</span>${s.wheelchair?'<span class="meta-pill positive">♿ Access listed</span>':''}${hasWeb?'<span class="meta-pill">↗ Website</span>':''}${s.phone?'<span class="meta-pill">☎ Phone</span>':''}</div><div class="salon-bottom"><button class="details-button" type="button" data-action="details" data-id="${attr(s.id)}">View details <span>↗</span></button><button class="compare-button ${compared?'selected':''}" type="button" data-action="toggle-compare" data-id="${attr(s.id)}" aria-pressed="${compared}">${compared?'✓ Selected':'+ Compare'}</button></div></div></article>`;
}
function renderResults(){if(state.searching)return;const items=visibleItems();$('result-count').textContent=`${items.length} ${items.length===1?'salon':'salons'}`;$('result-range').textContent=state.tab==='saved'?'saved on this device':`within ${state.radius} km`;
  $('error').hidden=!state.error;
  const empty=!state.error&&!items.length;$('empty').hidden=!empty;
  if(empty){$('empty').querySelector('h3').textContent=state.tab==='saved'?'Your saved list is empty':state.mode==='demo'?'No fictional examples match':'No salons match these filters';$('empty').querySelector('p').textContent=state.tab==='saved'?'Tap the heart on any salon to save it here.':'Try widening your radius or clearing a filter.';}
  const list=$('results-list');list.hidden=state.view==='map'||!!state.error||empty;list.innerHTML=state.error||empty?'':items.map(card).join('');
  const mp=$('map-panel');mp.hidden=state.view!=='map'||!!state.error||empty;if(!mp.hidden)renderMap(items);
  $('result-footnote').textContent=state.mode==='demo'?'Fictional demonstration listings only.':`Distances are straight-line estimates; not travel times. ${items.length>=100?'Results are capped at 100. Narrow your radius for more coverage.':''}`;
}
function renderMap(items){const pane=$('map-canvas');const center=state.tab==='saved'?state.center||{lat:51.5074,lon:-.1278}:state.center||{lat:51.5074,lon:-.1278};const lats=items.map(x=>x.lat).concat(center.lat),lons=items.map(x=>x.lon*Math.cos(center.lat*Math.PI/180)).concat(center.lon*Math.cos(center.lat*Math.PI/180));const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons),latRange=Math.max(.018,maxLat-minLat),lonRange=Math.max(.018,maxLon-minLon);
  const position=(lat,lon)=>{const x=((lon*Math.cos(center.lat*Math.PI/180)-minLon)/lonRange)*70+15;const y=85-((lat-minLat)/latRange)*70;return {x:Math.max(8,Math.min(92,x)),y:Math.max(8,Math.min(92,y))};};
  const origin=position(center.lat,center.lon);
  pane.innerHTML=`<div class="map-grid" aria-hidden="true"></div><div class="map-route" aria-hidden="true"></div><div class="map-centre" style="left:${origin.x}%;top:${origin.y}%" title="Search centre" aria-label="Search centre">◎</div>${items.map((s,i)=>{const p=position(s.lat,s.lon);return `<button type="button" class="map-pin ${s.category}" style="left:${p.x}%;top:${p.y}%" data-action="details" data-id="${attr(s.id)}" title="${attr(s.name)}" aria-label="View ${attr(s.name)}">${i+1}</button>`;}).join('')}<span class="map-hint">Tap a pin to open salon details</span>`;
  const u=new URL('https://www.openstreetmap.org/');u.searchParams.set('mlat',String(center.lat));u.searchParams.set('mlon',String(center.lon));u.hash=`map=13/${center.lat}/${center.lon}`;$('map-open').href=u.href;
}
function findSalon(id){return state.results.find(x=>x.id===id)||state.saved[id]||null;}
function toggleSave(id){const s=findSalon(id);if(!s)return;
  if(state.saved[id]){delete state.saved[id];showToast('Removed from saved places.');}
  else {if(Object.keys(state.saved).length>=150){showToast('Saved list is full (150 places).');return;}state.saved[id]={...s};showToast(`${s.name} saved on this device.`);}
  localWrite();updateAll();if($('details-dialog').open&&s.id===$('details-dialog').dataset.id)openDetails(id);
}
function toggleCompare(id){const s=findSalon(id);if(!s)return;const index=state.compare.indexOf(id);if(index>=0){state.compare.splice(index,1);}else{if(state.compare.length>=3){showToast('You can compare up to three salons.');return;}state.compare.push(id);}updateCompare();renderResults();}
function updateCompare(){const n=state.compare.length;$('compare-count').textContent=n;const bar=$('comparison-bar');bar.hidden=n===0;$('comparison-label').textContent=`${n} ${n===1?'place':'places'} selected`;
}
function directions(s){return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.lat},${s.lon}`)}`;}
function openDetails(id){const s=findSalon(id);if(!s)return;const dlg=$('details-dialog');dlg.dataset.id=id;
  const web=safeWeb(s.website);const tel=s.phone?`tel:${s.phone.replace(/[^+\d]/g,'')}`:null;const demo=s.demo;
  $('details-content').innerHTML=`<div class="details-hero"><div class="details-icon" aria-hidden="true">${catIcons[s.category]||'✳'}</div><button class="icon-button close-white" data-action="close-dialog" aria-label="Close details">✕</button><p class="small-eyebrow">${escapeHTML(catLabels[s.category]||'Salon')}</p><h2 id="details-title">${escapeHTML(s.name)}</h2><p>${escapeHTML(s.address||'Address unavailable')}</p>${demo?'<span class="details-demo">FICTIONAL DEMONSTRATION LISTING</span>':''}</div><div class="details-body"><div class="quick-facts"><div><small>DISTANCE</small><strong>${escapeHTML(dist(s))}</strong></div><div><small>ACCESSIBILITY</small><strong>${s.wheelchair?'Wheelchair listed':'Not confirmed'}</strong></div><div><small>OPENING HOURS</small><strong>${escapeHTML(s.openingHours||'Ask the salon')}</strong></div></div><h3>Get in touch</h3><p class="muted">${demo?'Demonstration salons cannot be contacted.':'Contact the salon directly to confirm pricing, availability and treatments.'}</p><div class="contact-actions">${web&&!demo?`<a class="button-primary" href="${attr(web)}" target="_blank" rel="noopener noreferrer">Visit website ↗</a>`:''}${tel&&!demo?`<a class="button-secondary" href="${attr(tel)}">☎ ${escapeHTML(s.phone)}</a>`:''}${!demo?`<a class="button-secondary" href="${attr(directions(s))}" target="_blank" rel="noopener noreferrer">⌖ Directions ↗</a>`:''}${(!web&&!tel||demo)?'<span class="unavailable-contact">No contact details listed</span>':''}</div><div class="private-notes"><label for="salon-note">Your private notes <span>Only saved in this browser</span></label><textarea id="salon-note" data-id="${attr(s.id)}" maxlength="800" rows="3" placeholder="Remember the stylist, ask about a patch test, note quoted prices…">${escapeHTML(state.notes[id]||'')}</textarea></div><div class="details-tip"><strong>Helpful questions to ask</strong><ul><li>What is included in the quoted price?</li><li>Do I need a consultation or patch test first?</li><li>What's the cancellation or rescheduling policy?</li></ul></div><div class="dialog-actions"><button class="button-secondary" type="button" data-action="save" data-id="${attr(id)}">${state.saved[id]?'♥ Saved':'♡ Save salon'}</button><button class="button-primary" type="button" data-action="brief">✦ Create enquiry</button></div></div>`;
  if(!dlg.open)dlg.showModal();
}
function openCompare(){const selected=state.compare.map(findSalon).filter(Boolean);if(!selected.length){showToast('Choose up to three salons using + Compare.');return;}
  $('compare-content').innerHTML=`<div class="comparison-table-wrap"><table class="comparison-table"><caption>Comparison of selected salons. Data not shown is unverified.</caption><thead><tr><th scope="col">What matters</th>${selected.map(s=>`<th scope="col">${escapeHTML(s.name)}</th>`).join('')}</tr></thead><tbody>${[
    ['Service',s=>catLabels[s.category]||'Salon'],['Distance',s=>dist(s)],['Website listed',s=>s.website?'Yes':'Not listed'],['Phone listed',s=>s.phone?'Yes':'Not listed'],['Wheelchair access',s=>s.wheelchair?'Listed':'Not confirmed'],['Hours',s=>s.openingHours||'Not listed'],['Your notes',s=>state.notes[s.id]||'—']
  ].map(([label,fn])=>`<tr><th scope="row">${label}</th>${selected.map(s=>`<td>${escapeHTML(fn(s))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="form-caption">No ratings, pricing or appointment availability are inferred. Contact each business to verify.</p><div class="dialog-actions"><button type="button" class="button-secondary" data-action="close-dialog">Close</button><button type="button" class="button-primary" data-action="copy-compare">Copy comparison ↗</button></div>`;
  $('compare-dialog').showModal();
}
async function copy(text,success='Copied to clipboard.'){try{await navigator.clipboard.writeText(text);showToast(success);}catch{const tmp=document.createElement('textarea');tmp.value=text;document.body.appendChild(tmp);tmp.select();const ok=document.execCommand('copy');tmp.remove();showToast(ok?success:'Copy failed — select the text manually.');}}
function copyCompare(){const selected=state.compare.map(findSalon).filter(Boolean);copy(selected.map(s=>`${s.name}\n${catLabels[s.category]||'Salon'} · ${dist(s)}\n${s.address}\nWebsite: ${s.website||'Not listed'}\nPhone: ${s.phone||'Not listed'}\nAccessibility: ${s.wheelchair?'Listed':'Not confirmed'}\nNotes: ${state.notes[s.id]||'—'}`).join('\n\n---\n\n'),'Shortlist copied.');}
function copyBrief(ev){ev.preventDefault();const service=$('brief-service').value,date=$('brief-date').value,time=$('brief-time').value,budget=$('brief-budget').value.trim(),details=$('brief-details').value.trim(),requirements=$('brief-requirements').value.trim();
  const message=[`Hello, I'd like to enquire about ${service.toLowerCase()}.`,date?`Preferred date: ${date}`:null,`Preferred time: ${time}`,budget?`Budget: ${budget}`:null,details?`What I'm looking for: ${details}`:null,requirements?`Questions / requirements: ${requirements}`:null,'Could you please let me know your availability, price, what is included and any preparation needed? Thank you.'].filter(Boolean).join('\n\n');copy(message,'Enquiry copied. Paste it into your message to the salon.');}
function exportSaved(){const saved=Object.values(state.saved);if(!saved.length){showToast('Save a salon first.');return;}const cols=['name','category','address','distanceKm','website','phone','lat','lon','notes'];const csv=[cols.join(','),...saved.map(s=>cols.map(k=>{let val=k==='notes'?state.notes[s.id]||'':s[k]??'';val=String(val).replace(/^[\s]*[=+@-]/,v=>"'"+v);return '"'+val.replace(/"/g,'""')+'"';}).join(','))].join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='salonfinder-saved.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function updateView(view){state.view=view;$('view-list').classList.toggle('active',view==='list');$('view-map').classList.toggle('active',view==='map');$('view-list').setAttribute('aria-pressed',view==='list');$('view-map').setAttribute('aria-pressed',view==='map');renderResults();}
function handleAction(action,button){const id=button.dataset.id;
  switch(action){case 'save':toggleSave(id);break;case 'toggle-compare':toggleCompare(id);break;case 'details':openDetails(id);break;case 'compare':openCompare();break;case 'clear-compare':state.compare=[];updateCompare();renderResults();break;
  case 'share':if(state.coords){showToast('Precise location is private. Enter a town to create a shareable search.');break;}copy(window.location.href,'Search link copied.');break;
  case 'brief':{const d=$('details-dialog');if(d.open)d.close();$('brief-dialog').showModal();break;}
  case 'privacy':$('privacy-dialog').showModal();break;
  case 'close-dialog':button.closest('dialog')?.close();break;
  case 'copy-compare':copyCompare();break;
  case 'reset-filters':document.querySelectorAll('.filter-group input[type="checkbox"]').forEach(e=>e.checked=false);updateAll();break;
  case 'retry':doSearch();break;
  case 'top':window.scrollTo({top:0,behavior:'smooth'});break;
  case 'near-me':useGeolocation();break;
  case 'export':exportSaved();break;
  case 'unit':state.unit=state.unit==='km'?'mi':'km';localWrite();updateAll();break;
  case 'clear-storage':if(window.confirm('Delete every saved salon, note and preference from this browser?')){state.saved={};state.notes={};state.compare=[];localWrite();updateAll();$('privacy-dialog').close();showToast('Local saved data cleared.');}break;
  }
}
function useGeolocation(){if(!navigator.geolocation){showToast('Your browser does not support location sharing.');return;}
  const button=document.querySelector('[data-action="near-me"]');button.disabled=true;button.textContent='Locating…';
  navigator.geolocation.getCurrentPosition(pos=>{state.coords={lat:pos.coords.latitude,lon:pos.coords.longitude};$('location').value='Near my location';button.disabled=false;button.innerHTML='◎ <span>Near me</span>';doSearch();},()=>{button.disabled=false;button.innerHTML='◎ <span>Near me</span>';showToast('Location unavailable or not permitted. Enter a town instead.');},{timeout:9000,maximumAge:180_000,enableHighAccuracy:false});
}
function setup(){localRead();const query=new URLSearchParams(window.location.search);const searchLocation=query.get('location'),category=query.get('category'),radius=query.get('radius');
  if(searchLocation?.length>=2&&searchLocation.length<=120)$('location').value=searchLocation;
  if(['all','hair','beauty','spa'].includes(category))document.querySelector(`[name="category"][value="${category}"]`).checked=true;
  if(['1','3','5','10','20','30'].includes(radius))$('radius').value=radius;
  $('search-form').addEventListener('submit',event=>{event.preventDefault();doSearch();});
  $('location').addEventListener('input',()=>state.coords=null);
  for(const id of ['filter-web','filter-phone','filter-access','filter-saved'])$(id).addEventListener('change',renderResults);
  $('sort').addEventListener('change',renderResults);
  $('brief-form').addEventListener('submit',copyBrief);
  document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(a){e.preventDefault();handleAction(a.dataset.action,a);return;}const t=e.target.closest('[data-tab]');if(t){state.tab=t.dataset.tab;state.compare=[];updateAll();return;}const v=e.target.closest('[data-view]');if(v){updateView(v.dataset.view);return;}});
  document.addEventListener('change',e=>{if(e.target?.id==='salon-note'){const id=e.target.dataset.id;if(id){state.notes[id]=e.target.value.slice(0,800);localWrite();showToast('Private note saved.');}}});
  for(const dlg of document.querySelectorAll('dialog'))dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
  for(const dlg of document.querySelectorAll('dialog'))dlg.addEventListener('close',()=>{if(dlg.id==='details-dialog')dlg.dataset.id='';});
  // Add a small set of useful saved-view actions without crowding the hero.
  const tools=document.createElement('div');tools.className='saved-tools';tools.id='saved-tools';tools.innerHTML='<button class="button-ghost" type="button" data-action="export">↓ Export saved CSV</button><button class="button-ghost" type="button" data-action="unit">↔ km / miles</button>';
  $('results-sub').after(tools);
  // Render actions on both tabs; exports are also a discovery convenience.
  tools.hidden=false;
  updateCounters();doSearch();
  if('serviceWorker' in navigator&&window.location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
setup();