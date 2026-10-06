'use strict';
const $=id=>document.getElementById(id),mk=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
let updateCompletionRecorded=false,updateRequestedHere=false,updateSeen=false,loadedUpdateVersion='';
const eventNames={order:'주문',shipped:'발송·배송 중',delivered:'배송완료',refund:'환불',return:'반품·취소'};
const net=o=>o.net_minor??o.amount_minor;
let data=null,selectedMonth='',selectedCurrency='',rangeStart='',rangeEnd='',visible=[];
function today(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
function preset(n){rangeEnd=today();const [y,m]=rangeEnd.split('-').map(Number);rangeStart=new Date(Date.UTC(y,m-n,1)).toISOString().slice(0,10);$('start').value=rangeStart;$('end').value=rangeEnd;selectedMonth='';selectedCurrency='';render();}
const money=(minor,currency)=>{const value=new Intl.NumberFormat('ko-KR',{minimumFractionDigits:currency==='KRW'?0:2,maximumFractionDigits:2}).format(minor/100);return currency==='KRW'?value+'원':'$'+value;};
async function load(){try{const r=await fetch('/api/data');if(!r.ok)throw Error('보고서를 읽지 못했습니다.');data=await r.json();render();}catch(e){$('error').textContent=e.message;}}
function render(){if(!data)return;renderUpdateStatus();$('update-ui').disabled=!!data.updating;$('update-ui').textContent=data.updating?'업데이트 중…':'화면 업데이트';$('status').textContent=data.message||'아마존 메일 가져오기를 눌러 시작하세요.';$('collect').disabled=data.running||!data.can_collect;$('rebuild').disabled=data.running;
 const stats=data.collection;if(stats){$('collection-summary').textContent=`계정 ${stats.account||'dayepapa@naver.com'} · ${stats.status||''} · 다른 배송지 제외 ${stats.excluded_recipient||0}개`;table('folders',(stats.folders||[]).map(r=>[r.folder,r.total??'—',r.matched,r.checked??'—',r.candidates??'—',(r.fallback?'헤더 직접 확인 · ':'검색 · ')+(r.status||'')]),6);}
 $('fx-note').textContent='환율: ECB 공시 참고환율(Frankfurter) · 주문 안내일(한국 시간)별 환산 · 휴일은 직전 공시일 · 주문별 원 단위 반올림 후 합산'+(data.fx?.error?' · '+data.fx.error:'');
 table('won-orders',data.orders.filter(o=>o.currency==='KRW').map(o=>[o.order_id,o.date,money(o.amount_minor,'KRW')]),3);
 const orders=data.orders.filter(o=>o.date>=rangeStart&&o.date<=rangeEnd),months=new Map();
 for(const o of orders){const month=o.date.slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(o);}
 $('totals').replaceChildren();if(orders.length){const card=mk('article');card.append(mk('span','선택 기간 전체'));appendPurchaseAmounts(card,orders);$('totals').append(card);}else $('totals').append(mk('p','선택 기간에 집계 가능한 주문이 없습니다.'));
 $('months').replaceChildren();for(const [month,rows] of [...months].sort((a,b)=>b[0].localeCompare(a[0]))){const card=mk('button');card.type='button';card.className='month-card';card.dataset.month=month;card.classList.toggle('active',selectedMonth===month);card.append(mk('h3',month));appendPurchaseAmounts(card,rows);card.append(mk('span',rows.length+'건'));card.onclick=()=>{selectedMonth=month;selectedCurrency='';render();$('list-title').scrollIntoView({behavior:'smooth'});};$('months').append(card);}
 visible=orders.filter(o=>!selectedMonth||o.date.startsWith(selectedMonth));$('list-title').textContent=(selectedMonth||'선택 기간 전체')+' 구매 목록';
 table('rows',visible.map(o=>[o.date,o.summary||'제품 상세 미확인',o.quantity??'미확인',money(o.amount_minor,o.currency),money(o.refund_minor||0,o.currency),money(net(o),o.currency),o.currency,o.krw_converted==null?'—':new Intl.NumberFormat('ko-KR').format(o.krw_converted)+'원',o.fx_rate||'—',o.fx_date||'—',o.order_id]),11);
 const events=(data.events||[]).filter(e=>(!$('event-type').value||e.type===$('event-type').value)&&(!e.date||(e.date>=rangeStart&&e.date<=rangeEnd)));table('events',events.map(e=>[e.date,eventNames[e.type]||e.type,e.order_id||'미확인',e.amount_minor==null?'—':money(e.amount_minor,e.currency),e.status,e.issues.join(' / ')]),6);$('event-counts').textContent=Object.entries(data.mail_types||{}).map(([type,n])=>(eventNames[type]||type)+' '+n+'개').join(' · ');
 table('reviews',data.review.map(o=>[o.date,o.order_id,o.issues.join(' / ')]),3);$('review-title').textContent='검토 필요 · '+data.review.length+'건 (전체 기간)';
 $('counts').textContent=`저장 파일 ${data.files}개 · 집계 주문 ${data.orders.length}건 · 동일 주문 중복 ${data.duplicate_orders||0}건 · 조건 제외 ${data.excluded||0}건 · 파싱 실패 ${data.parse_failures||0}건`;
}
function appendPurchaseAmounts(card,rows){
 const usd=rows.filter(o=>o.currency==='USD'||o.currency==='$ (통화 미확인)'),won=rows.filter(o=>o.currency==='KRW');
 card.append(mk('strong',usd.length?money(usd.reduce((sum,o)=>sum+net(o),0),'USD'):'USD 금액 미확인'));
 if(usd.length){appendKrw(card,usd);const refund=usd.reduce((s,o)=>s+(o.refund_minor||0),0);card.append(mk('p','주문 '+money(usd.reduce((s,o)=>s+o.amount_minor,0),'USD')+' − 환불 '+money(refund,'USD')));}
 if(won.length){const note=mk('p','원화 표시 주문 '+money(won.reduce((sum,o)=>sum+net(o),0),'KRW')+' · USD 합계 미포함');note.className='original-won';card.append(note);}
}
function appendKrw(card,rows){const converted=rows.filter(o=>o.krw_converted!=null),missing=rows.length-converted.length;card.append(mk('p',converted.length?'≈ '+new Intl.NumberFormat('ko-KR').format(converted.reduce((s,o)=>s+o.krw_converted,0))+'원'+(missing?' (일부 환산)':''):'원화 환산 대기'));if(missing)card.append(mk('span','환율 미확인 '+missing+'건'));}
function table(id,rows,cols){$(id).replaceChildren();for(const row of rows){const tr=mk('tr');row.forEach(v=>tr.append(mk('td',v)));$(id).append(tr);}if(!rows.length){const tr=mk('tr'),td=mk('td','표시할 내역이 없습니다.');td.colSpan=cols;tr.append(td);$(id).append(tr);}}
async function post(path){try{$('error').textContent='';const r=await fetch(path,{method:'POST',headers:{'X-CSRF-Token':data.token}});if(!r.ok)throw Error((await r.json()).error);await load();}catch(e){$('error').textContent=e.message;}}
$('collect').onclick=()=>post('/api/collect');$('rebuild').onclick=()=>post('/api/rebuild');
$('range').onsubmit=e=>{e.preventDefault();if($('start').value>$('end').value){$('error').textContent='시작일과 종료일을 확인하세요.';return;}$('error').textContent='';rangeStart=$('start').value;rangeEnd=$('end').value;selectedMonth='';selectedCurrency='';render();};
for(const b of document.querySelectorAll('[data-months]'))b.onclick=()=>preset(Number(b.dataset.months));$('all').onclick=()=>{selectedMonth='';selectedCurrency='';render();};
$('export').onclick=()=>{const cell=v=>'"'+(/^[\s]*[=+@-]/.test(String(v))?"'":'')+String(v).replaceAll('"','""')+'"';const rows=[['날짜','상품 요약','주문수량','주문액','환불액','환불 반영액','통화','KRW 환산','적용 환율','환율 공시일','주문번호'],...visible.map(o=>[o.date,o.summary,o.quantity??'',(o.amount_minor/100).toFixed(2),((o.refund_minor||0)/100).toFixed(2),(net(o)/100).toFixed(2),o.currency,o.krw_converted??'',o.fx_rate||'',o.fx_date||'',o.order_id])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=mk('a');a.href=url;a.download='amazon_orders.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('event-type').onchange=render;
preset(12);load();setInterval(load,5000);

function setReloadState(latest,applied=false){
 const button=$('reload-ui');button.textContent=latest?'최신 버전':'화면 새로고침';
 button.classList.toggle('needs-reload',applied&&!latest);
 button.classList.toggle('is-latest',latest);
 button.setAttribute('aria-label',latest?'최신 버전 · 화면 다시 불러오기':applied?'새 버전 적용을 위해 화면 새로고침':'화면 새로고침');
}
function renderUpdateStatus(){
 $('update-status').classList.remove('version-label');
 const message=data.update_message||'',match=message.match(/^적용 완료 \(([0-9a-f]+)\)/);
 if(!updateSeen){updateSeen=true;if(match&&!updateRequestedHere)loadedUpdateVersion=match[1];}
 if(data.updating){$('update-status').textContent='업데이트 중…';setReloadState(false);return;}
 if(!match){$('update-status').textContent=message;setReloadState(false);return;}
 const version=match[1],key='amazon-update-applied-'+version;
 let applied;try{applied=localStorage.getItem(key);}catch(e){}
 if((updateRequestedHere&&!updateCompletionRecorded)||!applied||!Number.isFinite(Date.parse(applied))){applied=new Date().toISOString();try{localStorage.setItem(key,applied);}catch(e){}}
 updateCompletionRecorded=true;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(applied));
 const part=type=>parts.find(p=>p.type===type).value;
 $('update-status').classList.add('version-label');
 $('update-status').textContent=`Ver.${part('year')}${part('month')}${part('day')}T${part('hour')}${part('minute')}`;
 setReloadState(!updateRequestedHere&&loadedUpdateVersion===version,true);

}


$('update-ui').onclick=()=>{updateRequestedHere=true;updateCompletionRecorded=false;setReloadState(false);post('/api/update');};
$('reload-ui').onclick=()=>location.reload();
$('today').onclick=()=>{rangeStart=rangeEnd=today();applyRange();};
$('week').onclick=()=>{const date=new Date(today()+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);rangeStart=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6);rangeEnd=date.toISOString().slice(0,10);applyRange();};
function applyRange(){$('start').value=rangeStart;$('end').value=rangeEnd;selectedMonth='';selectedCurrency='';render();}
