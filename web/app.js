'use strict';
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('ko-KR').format(n||0)+'원';
const mk=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
let data=null,tab='orders',exportRows=[],exportHeaders=[],productRows=[];
let detailStore='',productStore='',mainStore='',detailMonth='';
let rangeMode='month',rangeStart='',rangeEnd='';
const names=()=>data.store_names||{},name=id=>names()[id]||('미분류 '+id);
const excluded=new Set(['텐즈힐','기타','기타분류']);
const business=o=>!!names()[o.address_id]&&!excluded.has(names()[o.address_id]);
const inRange=d=>!!d&&d.slice(0,10)>=rangeStart&&d.slice(0,10)<=rangeEnd;
const rangeLabel=()=>`${rangeStart} ~ ${rangeEnd}`;
async function load(){try{const r=await fetch('/api/data');if(!r.ok)throw Error('보고서를 읽을 수 없습니다.');data=await r.json();render();}catch(e){$('error').textContent=e.message;}}
function render(){syncMonthButtons();if(!data)return;
 $('error').textContent=data.last_error||'';
 $('update-ui').disabled=!!data.read_only||!!data.updating;$('update-ui').textContent=data.updating?'업데이트 중…':'화면 업데이트';$('update-status').textContent=data.update_message||'';
 const allStores=[...new Set(data.orders.filter(business).map(o=>name(o.address_id)))].sort((a,b)=>a.localeCompare(b,'ko'));
 if(!allStores.includes(mainStore))mainStore='';
 $('main-store').replaceChildren(new Option('전체 매장',''),...allStores.map(store=>new Option(store,store)));$('main-store').value=mainStore;
 const monthOrders=data.orders.filter(o=>inRange(o.date));
 const orders=monthOrders.filter(o=>business(o)&&(!mainStore||name(o.address_id)===mainStore)).sort((a,b)=>b.mail_time.localeCompare(a.mail_time));
 const valid=orders.filter(o=>!o.errors.length), keys=new Set(orders.map(o=>o.order_key));
 const cancels=data.cancellations.filter(c=>c.order_key?keys.has(c.order_key):inRange(c.cancel_time||c.payment_time||''));
 const sum=(rows,field)=>rows.reduce((s,o)=>s+(o[field]||0),0);

 if(!allStores.includes(productStore))productStore='';
 if(!allStores.includes(detailStore))detailStore='';
 const stores=allStores.filter(store=>{const rows=valid.filter(o=>name(o.address_id)===store);return sum(rows,'gross')-sum(rows,'suggested_refund')!==0;}).sort((a,b)=>a.localeCompare(b,'ko'));
 const gross=sum(valid,'gross'),refund=sum(valid,'suggested_refund');
 $('selected-label').textContent=(mainStore?mainStore+' · ':'')+rangeLabel();
 $('cards-title').textContent=mainStore?mainStore+' · 월별 매입':'매장별 매입';
 $('net').textContent=money(gross-refund);
 $('total-detail').textContent=`${stores.length}개 사업장 · 확인 주문 ${valid.length}건 · 주문 결제액 ${money(gross)} − 취소 연결 후보 ${money(refund)}`;
 $('business-cards').replaceChildren();
 const cardGroups=mainStore?[...new Set(valid.map(o=>o.date.slice(0,7)))].sort().map(month=>({store:mainStore,month,rows:valid.filter(o=>o.date.slice(0,7)===month)})):stores.map(store=>({store,month:'',rows:valid.filter(o=>name(o.address_id)===store)}));
 let shown=0;for(const {store,month,rows} of cardGroups){const g=sum(rows,'gross'),r=sum(rows,'suggested_refund');if(g-r===0)continue;shown++;
 const card=mk('button');card.type='button';card.className='store-card';card.dataset.store=store;card.dataset.month=month;card.setAttribute('aria-controls','store-detail');const active=detailStore===store&&detailMonth===month;card.setAttribute('aria-expanded',String(active));card.classList.toggle('active',active);
 card.onclick=()=>{detailStore=store;detailMonth=month;productStore=store;render();$('store-detail').scrollIntoView({behavior:'smooth',block:'start'});$('detail-title').focus({preventScroll:true});};
 card.append(mk('h3',month?month.replace('-','년 ')+'월':store),mk('span','매입합계 · 잠정'),mk('strong',money(g-r)),mk('p',`주문 ${rows.length}건${r?' · 취소 후보 '+money(r):''}`));if(month)card.append(mk('p',`${rangeStart>month+'-01'?rangeStart:month+'-01'} ~ ${rangeEnd<monthRange(month)[1]?rangeEnd:monthRange(month)[1]}`));$('business-cards').append(card);}
 if(!shown)$('business-cards').append(mk('p','선택한 기간에 표시할 매입 카드가 없습니다. 매입합계가 0원인 카드는 숨깁니다.'));
 $('store-detail').hidden=!detailStore;
 if(detailStore){const detailOrders=valid.filter(o=>name(o.address_id)===detailStore&&(!detailMonth||o.date.slice(0,7)===detailMonth));const rows=detailOrders.flatMap(o=>o.items.map(i=>[o.date,i.product,i.quantity,i.line_amount]));
 $('detail-title').textContent=`${detailStore} · ${detailMonth?detailMonth+" ("+rangeLabel()+" 내)":rangeLabel()} 구매제품`;
 $('detail-total').textContent=`${rows.length}개 주문 항목 · 상품금액 합계 ${money(rows.reduce((s,r)=>s+r[3],0))} · 취소·할인 배분 전`;
 fillTable('detail-head','detail-body',['날짜','제품·규격','주문수량','금액 · 취소 전'],rows,3);}
 const selector=$('product-stores');selector.replaceChildren();
 for(const store of ['',...(mainStore?[mainStore]:allStores)]){const button=mk('button',store||(mainStore?'선택 매장 전체 제품':'전체'));button.type='button';button.dataset.store=store;button.classList.toggle('active',productStore===store);button.setAttribute('aria-pressed',String(productStore===store));button.onclick=()=>{productStore=store;render();};selector.append(button);}
 const ignored=monthOrders.filter(o=>!business(o));
 $('scope-note').textContent=`텐즈힐·기타분류·미분류 ${ignored.length}건 제외 · 금액 대조 오류 ${orders.length-valid.length}건 제외. 미분류 배송지는 아래 매장 이름 지정에서 확인할 수 있습니다.`;
 const dates=data.orders.map(o=>o.date).sort();$('notice').textContent=dates.length?`현재 주문 자료: ${dates[0]} ~ ${dates.at(-1)}. 메일 수집과 취소 연결 검토가 끝나기 전까지 매입합계는 잠정 금액입니다. 확인 주문이 없는 달의 0원은 실제 매입이 없다는 뜻이 아닙니다.`:'아직 주문 자료가 없습니다. 메일을 수집해 주세요.';
 $('updated').textContent=data.updated_at?'보고서 갱신: '+new Date(data.updated_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'보고서 미생성';$('refresh').disabled=data.refreshing||!data.can_collect||data.read_only;$('refresh').textContent=data.refreshing?'메일 수집 중…':data.read_only?'외부에서는 조회만 가능':'지금 메일 수집';$('log').textContent=(data.log_tail||[]).join('\n')||'실행 기록이 없습니다.';
 const products=new Map();for(const o of valid.filter(o=>!productStore||name(o.address_id)===productStore))for(const i of o.items){const key=i.product.trim().replace(/\s+/g,' ');const row=products.get(key)||{product:key,quantity:0,amount:0,orders:new Set(),stores:new Set(),review:false};row.quantity+=i.quantity;row.amount+=i.line_amount;row.orders.add(o.order_key);row.stores.add(name(o.address_id));row.review ||= !!o.cancel_sources.length;products.set(key,row);}
 const query=$('search').value.trim().toLowerCase();productRows=[...products.values()].filter(p=>p.product.toLowerCase().includes(query)).sort((a,b)=>b.amount-a.amount).map(p=>[p.product,p.quantity,p.amount,p.orders.size,[...p.stores].sort().join(', '),p.review?'취소 연결 검토 필요':'—']);
 $('product-count').textContent=`${productStore||mainStore||'전체 사업장'} · ${productRows.length}개 제품 · 같은 상품명·규격 합산`;
 fillTable('product-head','product-body',productHeaders,productRows);
 if(tab==='orders'){table(['안내일','매장 / 배송지','주문번호','상품','결제액','취소 후보','잠정 금액','검토 상태'],orders.map(o=>[o.date,name(o.address_id),o.order_key,o.items.map(i=>`${i.product} × ${i.quantity}`).join('\n'),o.gross,o.suggested_refund,o.gross-o.suggested_refund,o.errors.join('; ')||(o.cancel_sources.length?'취소 연결 검토 필요':'취소 미확인')]));$('table-note').textContent='취소 후보가 0원이어도 취소가 없음을 보증하지 않습니다. 금액은 원 단위입니다.';}
 if(tab==='cancels'){table(['취소일','매장 / 배송지','상품 설명','취소액','PG 주문번호','쿠팡 주문 연결','상태'],cancels.map(c=>[c.cancel_time,c.address_id?name(c.address_id):'미연결',c.product,c.refund,c.pg_id,c.order_key,({'suggested_order_link_REVIEW':'연결 후보 · 확인 필요','payment_receipt_linked':'결제만 연결됨','unmatched_payment':'결제 미연결','duplicate_event':'동일 이벤트 후보','refund_exceeds_order':'주문액 초과'})[c.match]||c.match]));$('table-note').textContent='연결된 취소는 선택한 주문의 안내일 기준입니다. 미연결 취소는 선택한 기간의 취소일 기준으로 표시하며, 매입합계에서 차감하지 않습니다. 이 화면은 검토 목록이며 확정 처리 기능은 아직 없습니다.';}
 if(tab==='stores'){const groups=new Map();for(const o of data.orders){if(!groups.has(o.address_id))groups.set(o.address_id,o);}table(['주소 번호','마스킹된 배송지','수취인','분류 근거','매장 이름'],[...groups.values()].map(o=>[o.address_id,o.address,o.recipient,({'matched':'자동 규칙 일치','manual':'직접 지정','ambiguous':'규칙 충돌'}[data.classification?.[o.address_id]?.status]||'미분류'),name(o.address_id)]));let i=0;for(const o of groups.values()){const td=$('tbody').children[i++].lastChild;td.replaceChildren();const input=mk('input');input.value=names()[o.address_id]||'';input.placeholder='예: 송도점';input.maxLength=80;input.disabled=!!data.read_only;const save=mk('button','저장');save.disabled=!!data.read_only;save.onclick=async()=>{try{await post('/api/stores',{address_id:o.address_id,name:input.value});await load();}catch(e){$('error').textContent=e.message;}};td.append(input,save);}$('table-note').textContent='수취인 첫·끝 글자와 주소 규칙으로 자동 분류합니다. 같은 이름은 합산되며, 직접 저장한 이름이 자동 규칙보다 우선합니다. 빈칸으로 저장하면 자동 규칙으로 돌아갑니다.';}}
function table(headers,rows){exportHeaders=headers;exportRows=rows;$('thead').replaceChildren();const tr=mk('tr');headers.forEach(h=>tr.append(mk('th',h)));$('thead').append(tr);$('tbody').replaceChildren();for(const row of rows){const tr=mk('tr');row.forEach(v=>tr.append(mk('td',v??'')));$('tbody').append(tr);}if(!rows.length){const tr=mk('tr'),td=mk('td','표시할 데이터가 없습니다.');td.colSpan=headers.length;tr.append(td);$('tbody').append(tr);}}
async function post(url,body={}){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':data.csrf_token},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(result.error||'요청 실패');return result;}
$('update-ui').onclick=async()=>{try{await post('/api/update');await load();}catch(e){$('error').textContent=e.message;}};
$('reload-ui').onclick=()=>location.reload();
$('refresh').onclick=async()=>{try{await post('/api/refresh');await load();}catch(e){$('error').textContent=e.message;}};
function recentMonths(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).formatToParts(now);
 const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
 return Array.from({length:6},(_,i)=>{const date=new Date(Date.UTC(year,month-6+i,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;});
}

function seoulToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
function monthRange(month){const [y,m]=month.split('-').map(Number);return [month+'-01',new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)];}
function presetRange(mode){const today=seoulToday();if(/^last(3|6|12)$/.test(mode)){const [year,month]=today.split('-').map(Number);return [new Date(Date.UTC(year,month-Number(mode.slice(4)),1)).toISOString().slice(0,10),today];}if(mode==='today')return [today,today];if(mode==='month')return monthRange(today.slice(0,7));
 const day=new Date(today+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);const start=day.toISOString().slice(0,10);day.setUTCDate(day.getUTCDate()+6);return [start,day.toISOString().slice(0,10)];
}
function syncMonthButtons(){
 if(['month','week','today','last3','last6','last12'].includes(rangeMode))[rangeStart,rangeEnd]=presetRange(rangeMode);
 const group=$('recent-months');group.replaceChildren();
 for(const month of recentMonths()){const b=mk('button',month.replace('-','년 ')+'월');b.dataset.month=month;b.type='button';const [start,end]=monthRange(month),active=rangeStart===start&&rangeEnd===end;b.setAttribute('aria-pressed',String(active));b.classList.toggle('active',active);b.onclick=()=>{rangeMode='fixed';rangeStart=start;rangeEnd=end;render();};group.append(b);}
 for(const b of document.querySelectorAll('[data-period]')){const active=rangeMode===b.dataset.period;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
}
for(const button of document.querySelectorAll('[data-period]'))button.onclick=()=>{rangeMode=button.dataset.period;$('date-error').textContent='';render();};
$('range-toggle').onclick=()=>{const open=$('range-picker').hidden;$('range-picker').hidden=!open;$('range-toggle').setAttribute('aria-expanded',String(open));if(open){$('range-start').value=rangeStart;$('range-end').value=rangeEnd;$('range-start').focus();}};
$('range-picker').onsubmit=event=>{event.preventDefault();const start=$('range-start').value,end=$('range-end').value;if(!start||!end||start>end){$('date-error').textContent='시작일과 종료일을 확인하세요. 종료일은 시작일보다 빠를 수 없습니다.';return;}rangeStart=start;rangeEnd=end;rangeMode='custom';$('date-error').textContent='';render();};
function fillTable(head,body,headers,rows,moneyColumn=2){const h=mk('tr');headers.forEach(x=>h.append(mk('th',x)));$(head).replaceChildren(h);$(body).replaceChildren();for(const row of rows){const tr=mk('tr');row.forEach((v,i)=>tr.append(mk('td',i===moneyColumn&&typeof v==='number'?money(v):v)));$(body).append(tr);}if(!rows.length){const tr=mk('tr'),td=mk('td','선택한 기간에 조회할 제품이 없습니다.');td.colSpan=headers.length;tr.append(td);$(body).append(tr);}}
const productHeaders=['제품·규격','주문 수량','상품금액 · 취소 전','주문 횟수','구매 매장','검토 상태'];
$('main-store').onchange=()=>{mainStore=$('main-store').value;productStore=mainStore;detailStore='';detailMonth='';render();};
$('detail-close').onclick=()=>{const store=detailStore;detailStore='';render();[...$('business-cards').children].find(c=>c.dataset.store===store)?.focus();};
$('search').addEventListener('input',render);
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{tab=button.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));render();};
$('export').onclick=()=>{const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const csv='\ufeff'+[exportHeaders,...exportRows].map(r=>r.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=mk('a');a.href=url;a.download=`coupang_${tab}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('product-export').onclick=()=>{const oldRows=exportRows,oldHeaders=exportHeaders,oldTab=tab;exportRows=productRows;exportHeaders=productHeaders;tab='products_'+rangeStart+'_'+rangeEnd;$('export').click();exportRows=oldRows;exportHeaders=oldHeaders;tab=oldTab;};
syncMonthButtons();load();setInterval(load,5000);
