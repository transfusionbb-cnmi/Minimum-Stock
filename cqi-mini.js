/* Mini Mobile Blood Donation CQI. This page intentionally reuses the existing TRC dependency and bag-family rules. */
let miniCqiPeriod={from:'',to:''};
let miniCqiResult=null;
let miniCqiOutings=[];
let miniCqiMobileLoaded=false;
let miniCqiActiveTab='overview';
const miniCqiHtml=value=>escapeOutreachHtml(String(value??''));
const miniCqiPct=(n,d)=>d>0?(100*n/d).toFixed(1)+'%':'—';
const miniCqiMonth=date=>String(date||'').slice(0,7);
const miniCqiDateTimeLocal=date=>{const d=new Date(date);return Number.isNaN(d.valueOf())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
function miniCqiRange(){
  const from=miniCqiPeriod.from||getTodayYmd().slice(0,7);
  const to=miniCqiPeriod.to||from;
  return {from:`${from}-01`,to:outreachLastDayOfMonth(to)};
}
function miniCqiSummary(outings){
  const started=outings.filter(row=>new Date(row.start_at)<=new Date());
  const passed=started.filter(row=>row.confirmed_at&&new Date(row.confirmed_at)<new Date(row.start_at)&&new Date(row.created_at)<new Date(row.start_at));
  return {passed:passed.length,total:started.length,missing:started.filter(row=>!row.confirmed_at),late:started.filter(row=>new Date(row.created_at)>=new Date(row.start_at))};
}
function miniCqiClassifyFamilies(rows){
  const families=new Map();
  rows.filter(row=>row?.aggregateEligible!==false && row.sourceGroup===OUTREACH_GROUP_SELF_OUTREACH).forEach(row=>{
    const key=outreachFamilyKeyClient(row.bagNumber,row.productType);
    if(!key)return;
    if(!families.has(key)) families.set(key,[]);
    families.get(key).push(row);
  });
  return [...families].map(([key,members])=>{
    const outcomes=members.map(effectiveOutreachOutcomeCode);
    const used=outcomes.includes('used'),expired=outcomes.includes('expired');
    const rejected=outcomes.includes('rejected');
    const conflicting=outcomes.includes('conflict')||outcomes.includes('other_discard')||members.some(row=>row.needsReview)||
      (expired&&rejected&&!used)||
      new Set(members.map(row=>String(row.sourceGroup||''))).size>1||
      new Set(members.map(row=>String(row.bloodGroup||'')+'|'+String(row.rh||''))).size>1;
    const representative=members.find(row=>row.sourceGroup===OUTREACH_GROUP_SELF_OUTREACH)||members[0];
    const firstCohort=members.map(row=>String(row.cohortDate||row.dateStockIn||'').slice(0,10)).filter(Boolean).sort()[0]||'';
    const usedRows=members.filter(row=>effectiveOutreachOutcomeCode(row)==='used');
    const beforeExpiry=usedRows.every(row=>row.dateStockOut&&row.expireDate&&String(row.dateStockOut).slice(0,10)<=String(row.expireDate).slice(0,10));
    const status=conflicting||(!beforeExpiry&&used)?'ต้องตรวจสอบ':used?'ใช้/จ่าย/ส่งต่อ':rejected?'ไม่เหมาะสมต่อการใช้':expired?'หมดอายุ':'รอติดตามผล';
    return {key,bagNumber:representative.bagNumber,productType:representative.productType,site:representative.donateSource,
      cohortDate:firstCohort,status,members:members.length};
  });
}
function miniCqiCard(label,n,d,target,pass,note){
  const state=d===0?'ยังไม่มีฐานข้อมูล':pass?'ผ่าน':'ไม่ผ่าน';
  return `<div class="simple-kpi mini-cqi-card ${d?pass?'is-good':'is-alert':''}"><span>${miniCqiHtml(label)}</span><strong>${miniCqiPct(n,d)}</strong><div>${n.toLocaleString()} / ${d.toLocaleString()} · เป้าหมาย ${miniCqiHtml(target)}</div><b>${state}</b><small>${miniCqiHtml(note||'')}</small></div>`;
}
function miniCqiSetPeriod(){
  const from=document.getElementById('miniCqiFrom')?.value,to=document.getElementById('miniCqiTo')?.value;
  if(!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to)||from>to)return showModal('error','ช่วงเวลาไม่ถูกต้อง','เลือกเดือนเริ่มต้นก่อนหรือเท่ากับเดือนสิ้นสุด');
  miniCqiPeriod={from,to};loadMiniCqi();
}
async function loadMiniCqi(){
  const box=document.getElementById('miniCqiDashboard');if(!box)return;
  const range=miniCqiRange();
  box.innerHTML='<div class="simple-panel">กำลังคำนวณผล CQI...</div>';
  try{
    const compareFrom=`${Number(range.from.slice(0,4))-1}${range.from.slice(4)}`;
    const compareTo=`${Number(range.to.slice(0,4))-1}${range.to.slice(4)}`;
    const [outings,dep,previous,families]=await Promise.all([
      MinimumStockBackend.getCqiOutings(range.from,range.to),
      ensureBloodKpiDependencyRange({dateFrom:range.from,dateTo:range.to}),
      ensureBloodKpiDependencyRange({dateFrom:compareFrom,dateTo:compareTo}),
      MinimumStockBackend.getOutreachFamilyRows({dateFrom:range.from,dateTo:range.to,sourceGroups:[OUTREACH_GROUP_SELF_OUTREACH]})
    ]);
    const k1=miniCqiSummary(outings), k2={num:Number(dep.summary.routineTrcRbc||0),den:Number(dep.summary.adjustedTotalRbc||0)};
    const details=miniCqiClassifyFamilies(families.rows||[]).filter(row=>row.cohortDate>=range.from&&row.cohortDate<=range.to);
    const counts=Object.fromEntries(['ใช้/จ่าย/ส่งต่อ','หมดอายุ','ไม่เหมาะสมต่อการใช้','รอติดตามผล','ต้องตรวจสอบ'].map(key=>[key,details.filter(row=>row.status===key).length]));
    const k3={num:counts['ใช้/จ่าย/ส่งต่อ'],den:counts['ใช้/จ่าย/ส่งต่อ']+counts['หมดอายุ']};
    const monthlyBagCounts=new Map();details.forEach(row=>{const month=miniCqiMonth(row.cohortDate);if(!month)return;if(!monthlyBagCounts.has(month))monthlyBagCounts.set(month,{used:0,expired:0,pending:0,rejected:0,review:0});const entry=monthlyBagCounts.get(month);const field={'ใช้/จ่าย/ส่งต่อ':'used','หมดอายุ':'expired','รอติดตามผล':'pending','ไม่เหมาะสมต่อการใช้':'rejected','ต้องตรวจสอบ':'review'}[row.status];if(field)entry[field]++});
    miniCqiResult={range,outings,months:dep.months,previousMonths:previous.months,details,counts,k1,k2,k3};
    const monthRow=m=>{const num=Number(m.routineTrcRbc||0),den=Number(m.adjustedTotalRbc||0);return `<tr><td>${m.month}/${Number(m.year)+543}</td><td>${num}</td><td>${den}</td><td>${miniCqiPct(num,den)}</td></tr>`};
    const yearsMap=new Map(previous.months.map(m=>[`${m.year}-${m.month}`,m]));
    const compareRows=dep.months.map(m=>{const p=yearsMap.get(`${Number(m.year)-1}-${m.month}`);const curNum=Number(m.routineTrcRbc||0),curDen=Number(m.adjustedTotalRbc||0),prevNum=Number(p?.routineTrcRbc||0),prevDen=Number(p?.adjustedTotalRbc||0);return {year:Number(m.year),month:Number(m.month),value:curDen?curNum/curDen*100:null,previousYear:Number(p?.year||Number(m.year)-1),previousValue:prevDen?prevNum/prevDen*100:null};});
    const comparison=[...new Map(compareRows.flatMap(m=>[{year:m.year,month:m.month,value:m.value},{year:m.previousYear,month:m.month,value:m.previousValue}]).map(m=>[`${m.year}-${m.month}`,m])).values()];
    box.innerHTML=`<div class="simple-page-head"><div><h1>ผล CQI: Mini Mobile Blood Donation</h1><div class="small-muted">แสดงข้อมูลตามช่วงเดือนที่รับเข้าหรือวันที่ออกหน่วย</div></div><button class="btn btn-light no-print" onclick="exportMiniCqi()">ส่งออก CSV รวมพร้อมสูตร</button></div>
      <div class="simple-panel mini-cqi-filters no-print"><label>จากเดือน <input type="month" id="miniCqiFrom" value="${miniCqiHtml(miniCqiPeriod.from||miniCqiMonth(range.from))}"></label><label>ถึงเดือน <input type="month" id="miniCqiTo" value="${miniCqiHtml(miniCqiPeriod.to||miniCqiMonth(range.to))}"></label><button class="btn btn-main" onclick="miniCqiSetPeriod()">แสดงผล</button></div>
      <nav class="mini-cqi-tabs no-print" aria-label="เมนูย่อย CQI">${[['overview','ภาพรวม'],['kpi1','KPI 1 · ความพร้อม'],['kpi2','KPI 2 · กาชาด Routine'],['kpi3','KPI 3 · ใช้ก่อนหมดอายุ']].map(([key,label])=>`<button type="button" data-mini-tab="${key}" onclick="miniCqiOpenTab('${key}')">${label}</button>`).join('')}</nav>
      <div data-mini-panel="overview" class="simple-kpi-grid blood-kpi-main-grid mb-3">${miniCqiCard('1 · ตรวจความพร้อมก่อนเริ่ม',k1.passed,k1.total,'100%',k1.passed===k1.total,`${k1.missing.length} ครั้งยังไม่ยืนยัน · ${k1.late.length} ครั้งบันทึกย้อนหลัง`)}${miniCqiCard('2 · พึ่งกาชาด Routine',k2.num,k2.den,'≤ 20%',k2.num/k2.den<=.20,'ตัดเลือดหายาก/จำเป็นตามนิยามหน้า KPI เดิม')}${miniCqiCard('3 · ใช้เลือดออกหน่วยก่อนหมดอายุ',k3.num,k3.den,'≥ 95%',k3.num/k3.den>=.95,`${counts['รอติดตามผล']} รอติดตาม · ${counts['ต้องตรวจสอบ']} ต้องตรวจสอบ`)}</div>
      <div data-mini-panel="kpi1" class="simple-panel mb-3"><div class="panel-heading-row"><h3>KPI 1 · รายการออกหน่วย</h3><div class="no-print"><button class="btn btn-main" onclick="navigateToPageRoute('mobile')">+ ลงทะเบียน/กรอกแบบตรวจก่อนเริ่ม</button> <button class="btn btn-light" onclick="exportMiniCqiSection('kpi1')">ส่งออก KPI 1</button></div></div><div class="small-muted">ขั้นตอน: เปิดเมนูออกหน่วย → ลงทะเบียนวันที่ สถานที่ เวลาเริ่ม → ตรวจทุกข้อ → บันทึกปัญหาและการแก้ไข → กดยืนยันพร้อมเริ่มก่อนเวลารับบริจาค · รายการที่ไม่มี checklist ยังอยู่ในตัวหาร</div><div class="table-responsive"><table class="table simple-table"><thead><tr><th>วันที่</th><th>สถานที่</th><th>เวลาเริ่ม</th><th>ผู้ตรวจ</th><th>ผู้ยืนยัน</th><th>เวลายืนยัน</th><th>ผล</th></tr></thead><tbody>${outings.map(row=>`<tr><td>${miniCqiHtml(row.outing_date)}</td><td>${miniCqiHtml(row.site)}</td><td>${miniCqiHtml(row.start_at)}</td><td>${miniCqiHtml(row.inspected_by_name||'-')}</td><td>${miniCqiHtml(row.confirmed_by_email||'-')}</td><td>${miniCqiHtml(row.confirmed_at||'-')}</td><td>${row.confirmed_at&&new Date(row.confirmed_at)<new Date(row.start_at)&&new Date(row.created_at)<new Date(row.start_at)?'ผ่าน':new Date(row.start_at)>new Date()?'ยังไม่เริ่ม':new Date(row.created_at)>=new Date(row.start_at)?'บันทึกย้อนหลัง':'ไม่ผ่าน/ไม่ได้บันทึก'}</td></tr>`).join('')||'<tr><td colspan="7">ยังไม่มีรายการออกหน่วยในช่วงนี้ · ไปที่เมนูออกหน่วยเพื่อเริ่มลงทะเบียน</td></tr>'}</tbody></table></div></div>
      <div data-mini-panel="kpi2" class="simple-panel mb-3"><div class="panel-heading-row"><h3>KPI 2 · พึ่งกาชาด Routine</h3><div class="no-print"><button class="btn btn-light" onclick="exportMiniCqiChart('kpi2')">PNG กราฟนี้</button> <button class="btn btn-light" onclick="exportMiniCqiSection('kpi2')">ส่งออก KPI 2</button></div></div><div class="small-muted">ตัวตั้ง ${k2.num} / ตัวหาร ${k2.den} ถุง · สรุปรวมจากจำนวนถุง ไม่เฉลี่ยเปอร์เซ็นต์รายเดือน</div>${renderKpiYearOverlayChart(comparison,'value',{title:'เทียบเดือนเดียวกันของปีก่อน · Routine (%)',unit:'%',yMax:100,target:20})}<div class="table-responsive"><table class="table simple-table"><thead><tr><th>เดือน</th><th>กาชาด Routine</th><th>Routine รับเข้าทั้งหมด</th><th>อัตรา</th></tr></thead><tbody>${dep.months.map(monthRow).join('')}</tbody></table></div></div>
      <div data-mini-panel="kpi3" class="simple-panel"><div class="panel-heading-row"><h3>KPI 3 · ผลระดับถุงต้นทาง</h3><button class="btn btn-light no-print" onclick="exportMiniCqiSection('kpi3')">ส่งออก KPI 3</button></div><div class="mini-cqi-counts">${Object.entries(counts).map(([key,count])=>`<span>${miniCqiHtml(key)} <b>${count}</b></span>`).join('')}</div><div class="small-muted">ตัวตั้ง ${k3.num} / ตัวหาร ${k3.den} · Rejected, รอติดตาม และต้องตรวจสอบ ไม่อยู่ในตัวหาร</div><div class="table-responsive"><table class="table simple-table"><thead><tr><th>เดือนรับเข้า</th><th>ใช้</th><th>หมดอายุ</th><th>Rejected</th><th>รอติดตาม</th><th>ต้องตรวจสอบ</th><th>ผล</th></tr></thead><tbody>${[...monthlyBagCounts].sort((a,b)=>a[0].localeCompare(b[0])).map(([month,c])=>`<tr><td>${miniCqiHtml(month)}</td><td>${c.used}</td><td>${c.expired}</td><td>${c.rejected}</td><td>${c.pending}</td><td>${c.review}</td><td>${miniCqiPct(c.used,c.used+c.expired)}</td></tr>`).join('')}</tbody></table></div><details><summary>ดูรายถุง (${details.length.toLocaleString()} ถุง)</summary><div class="table-responsive mini-cqi-bag-scroll"><table class="table simple-table"><thead><tr><th>Bag No.</th><th>รับเข้า</th><th>จุดออกหน่วย</th><th>ผลิตภัณฑ์</th><th>ผล</th></tr></thead><tbody>${details.map(row=>`<tr><td>${miniCqiHtml(row.bagNumber)}</td><td>${miniCqiHtml(row.cohortDate)}</td><td>${miniCqiHtml(row.site)}</td><td>${miniCqiHtml(row.productType)}</td><td>${miniCqiHtml(row.status)}</td></tr>`).join('')}</tbody></table></div></details></div>`;
    miniCqiOpenTab(miniCqiActiveTab);
  }catch(err){box.innerHTML=`<div class="simple-panel"><h3>เปิดผล CQI ไม่ได้</h3><p>${miniCqiHtml(err.message)}</p><small>ตรวจว่าได้รัน SQL-v2.9.76-CQI-MINIMUM-AND-CHECKLIST.sql แล้ว</small></div>`;}
}
function miniCqiCsvCell(value){return '"'+String(value??'').replaceAll('"','""')+'"'}
function miniCqiOpenTab(tab){
 miniCqiActiveTab=['overview','kpi1','kpi2','kpi3'].includes(tab)?tab:'overview';
 document.querySelectorAll('#miniCqiDashboard [data-mini-panel]').forEach(el=>{el.hidden=el.dataset.miniPanel!==miniCqiActiveTab});
 document.querySelectorAll('#miniCqiDashboard [data-mini-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.miniTab===miniCqiActiveTab);el.setAttribute('aria-current',el.dataset.miniTab===miniCqiActiveTab?'page':'false')});
 document.querySelectorAll('[data-mini-side]').forEach(el=>el.classList.toggle('active',el.dataset.miniSide===miniCqiActiveTab));
}
function miniCqiGo(tab){miniCqiActiveTab=tab;document.getElementById('miniCqiTree')?.classList.add('open');navigateToPageRoute('mini-cqi');if(miniCqiResult)miniCqiOpenTab(tab)}
function miniCqiDownloadCsv(rows,name){
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(miniCqiCsvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`CQI-${name}-${miniCqiResult.range.from}-${miniCqiResult.range.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);
}
function exportMiniCqiSection(key){
 const r=miniCqiResult;if(!r)return;
 const names={kpi1:'ตรวจความพร้อมก่อนเริ่ม',kpi2:'พึ่งกาชาด Routine',kpi3:'ใช้เลือดก่อนหมดอายุ'};
 const s={kpi1:r.k1,kpi2:r.k2,kpi3:r.k3}[key],num=key==='kpi1'?s.passed:s.num,den=key==='kpi1'?s.total:s.den;
 const formulas={kpi1:'ตรวจครบและยืนยันพร้อมก่อนเริ่ม / ครั้งออกหน่วยที่ลงทะเบียนทั้งหมด',kpi2:'จำนวนถุงกาชาด Routine / จำนวนถุง Routine รับเข้าทั้งหมด',kpi3:'ถุงต้นทางที่ใช้ก่อนหมดอายุ / (ถุงที่ใช้ก่อนหมดอายุ + ถุงหมดอายุ)'};
 const rows=[['CQI '+names[key],r.range.from,r.range.to],['ตัวตั้ง','ตัวหาร','ร้อยละ','เป้าหมาย','สูตร'],[num,den,miniCqiPct(num,den),{kpi1:'100%',kpi2:'≤20%',kpi3:'≥95%'}[key],formulas[key]]];
 if(key==='kpi1'){rows.push([],['วันที่','สถานที่','ผู้ตรวจ','เวลาเริ่ม','ผู้ยืนยัน','เวลายืนยัน','ผล']);r.outings.forEach(o=>rows.push([o.outing_date,o.site,o.inspected_by_name,o.start_at,o.confirmed_by_email,o.confirmed_at,o.confirmed_at&&new Date(o.confirmed_at)<new Date(o.start_at)&&new Date(o.created_at)<new Date(o.start_at)?'ผ่าน':new Date(o.created_at)>=new Date(o.start_at)?'ย้อนหลัง':'ไม่ผ่าน']))}
 if(key==='kpi2'){rows.push([],['เดือน','กาชาด Routine','Routine รับเข้าทั้งหมด','ร้อยละ']);r.months.forEach(m=>rows.push([`${m.year}-${m.month}`,m.routineTrcRbc,m.adjustedTotalRbc,miniCqiPct(Number(m.routineTrcRbc||0),Number(m.adjustedTotalRbc||0))]))}
 if(key==='kpi3'){rows.push([],['Bag No.','วันที่รับเข้า','สถานที่','ผลิตภัณฑ์','ผล']);r.details.forEach(d=>rows.push([d.bagNumber,d.cohortDate,d.site,d.productType,d.status]))}
 miniCqiDownloadCsv(rows,key);
}
function exportMiniCqiChart(key){
 const svg=document.querySelector(`#miniCqiDashboard [data-mini-panel="${key}"] svg.kpi-exec-chart`);
 if(!svg)return showModal('error','ยังไม่มีกราฟ','เลือกช่วงเดือนที่มีข้อมูลก่อน');
 const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 const img=new Image();img.onload=()=>{try{const size=svg.viewBox.baseVal,canvas=document.createElement('canvas');canvas.width=(size.width||1100)*2;canvas.height=(size.height||450)*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`CQI-${key}-${miniCqiResult.range.from}-${miniCqiResult.range.to}.png`;a.click()}finally{URL.revokeObjectURL(url)}};
 img.onerror=()=>{URL.revokeObjectURL(url);showModal('error','ส่งออกกราฟไม่สำเร็จ','ลองใหม่อีกครั้ง')};img.src=url;
}
function exportMiniCqi(){
 const r=miniCqiResult;if(!r)return;
 const lines=[['ผล CQI Mini Mobile Blood Donation',r.range.from,r.range.to],['KPI','ตัวตั้ง','ตัวหาร','ร้อยละ','เป้าหมาย','สูตร'],['KPI 1',r.k1.passed,r.k1.total,miniCqiPct(r.k1.passed,r.k1.total),'100%','ตรวจครบและยืนยันพร้อมก่อนเริ่ม / ออกหน่วยที่ลงทะเบียนทั้งหมด'],['KPI 2',r.k2.num,r.k2.den,miniCqiPct(r.k2.num,r.k2.den),'≤20%','กาชาด Routine / รับเข้า Routine ทั้งหมด; ไม่รวม Rare'],['KPI 3',r.k3.num,r.k3.den,miniCqiPct(r.k3.num,r.k3.den),'≥95%','ใช้/จ่าย/ส่งต่อ / (ใช้/จ่าย/ส่งต่อ + หมดอายุ); นับถุงต้นทาง'],[],['เดือน','กาชาด Routine','Routine รับเข้าทั้งหมด','อัตรา']];
 r.months.forEach(m=>{const n=Number(m.routineTrcRbc||0),d=Number(m.adjustedTotalRbc||0);lines.push([`${m.year}-${m.month}`,n,d,miniCqiPct(n,d)]);});
 lines.push([],['วันออกหน่วย','สถานที่','ผู้ตรวจ','เวลาเริ่ม','ผู้ยืนยัน','เวลายืนยัน','ผล']);
 r.outings.forEach(o=>lines.push([o.outing_date,o.site,o.inspected_by_name,o.start_at,o.confirmed_by_email,o.confirmed_at,o.confirmed_at&&new Date(o.confirmed_at)<new Date(o.start_at)&&new Date(o.created_at)<new Date(o.start_at)?'ผ่าน':new Date(o.created_at)>=new Date(o.start_at)?'ย้อนหลัง':'ไม่ผ่าน']));
 lines.push([],['Bag No.','วันที่รับเข้า','สถานที่','ผลิตภัณฑ์','ผล']);r.details.forEach(d=>lines.push([d.bagNumber,d.cohortDate,d.site,d.productType,d.status]));
 const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(miniCqiCsvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`CQI-Mini-Mobile-${r.range.from}-${r.range.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);
}
async function loadMiniCqiOutings(){
 const box=document.getElementById('miniCqiOutingPanel');if(!box)return;
 box.innerHTML='<div class="simple-panel">กำลังโหลดรายการออกหน่วย...</div>';
 try{
  const today=new Date(), year=today.getFullYear();
  miniCqiOutings=await MinimumStockBackend.getCqiOutings(`${year-1}-01-01`,`${year+1}-12-31`);
  renderMiniCqiOutings();
 }catch(err){box.innerHTML=`<div class="simple-panel"><h3>แบบตรวจความพร้อม</h3><p>${miniCqiHtml(err.message)}</p><small>ติดตั้ง SQL-v2.9.76-CQI-MINIMUM-AND-CHECKLIST.sql ก่อนใช้งาน</small></div>`;}
}
function renderMiniCqiOutings(editId=''){
 const box=document.getElementById('miniCqiOutingPanel');if(!box)return;
 const record=miniCqiOutings.find(r=>r.id===editId)||{};
 const checks=[['area_ok','พื้นที่เหมาะสมและจัดทางเดินปลอดภัย'],['ventilation_ok','การระบายอากาศ'],['workstations_ok','จุดลงทะเบียน คัดกรอง และเจาะเลือด'],['equipment_ok','เครื่องมือรับบริจาคและการทำงาน'],['donor_beds_ok','เตียงและพื้นที่พักผู้บริจาค'],['consumables_ok','ถุงเลือด วัสดุปลอดเชื้อ และของใช้สิ้นเปลือง'],['emergency_kit_ok','ชุดฉุกเฉินและการช่วยเหลือผู้บริจาค'],['cold_chain_ok','ภาชนะเก็บและขนส่งโลหิต'],['facilities_ok','ไฟฟ้า น้ำ ห้องน้ำ และสิ่งอำนวยความสะดวก']];
 box.innerHTML=`<div class="simple-panel mb-3 mini-cqi-outing"><div class="panel-heading-row"><div><h3>แบบตรวจความพร้อมก่อนออกหน่วย</h3><div class="small-muted">ลงทะเบียนทุกครั้ง แม้ยังไม่ได้ตรวจ ระบบนับเป็นครั้งออกหน่วยและแสดงรายการที่ยังไม่ผ่าน</div></div><button class="btn btn-light" onclick="navigateToPageRoute('mini-cqi')">ดูผล CQI</button></div>
 <form id="miniCqiOutingForm" onsubmit="saveMiniCqiOuting(event)"><input type="hidden" name="id" value="${miniCqiHtml(record.id||'')}">
 <div class="mini-cqi-form-grid"><label>วันที่ออกหน่วย<input class="form-control" name="outing_date" type="date" required value="${miniCqiHtml(record.outing_date||getTodayYmd())}"></label><label>สถานที่<input class="form-control" name="site" required value="${miniCqiHtml(record.site||'')}"></label><label>เวลาเริ่มรับบริจาค<input class="form-control" name="start_at" type="datetime-local" required value="${miniCqiHtml(record.start_at?miniCqiDateTimeLocal(record.start_at):'')}"></label><label>ผู้ตรวจ<input class="form-control" name="inspected_by_name" value="${miniCqiHtml(record.inspected_by_name||'')}"></label></div>
 <div class="mini-cqi-checks">${checks.map(([key,label])=>`<label><input type="checkbox" name="${key}" ${record[key]?'checked':''}> ${label}</label>`).join('')}</div><div class="mini-cqi-form-grid"><label>ปัญหาที่พบ<textarea class="form-control" name="issue_text">${miniCqiHtml(record.issue_text||'')}</textarea></label><label>การแก้ไขก่อนเริ่ม<textarea class="form-control" name="resolution_text">${miniCqiHtml(record.resolution_text||'')}</textarea></label></div><button class="btn btn-main" type="submit">${record.id?'บันทึกการตรวจ':'ลงทะเบียนออกหน่วย'}</button>${record.id?'<button class="btn btn-light" type="button" onclick="renderMiniCqiOutings()">ยกเลิกแก้ไข</button>':''}</form>
 <div class="small-muted mt-2">เวลายืนยันพร้อมและผู้ยืนยันบันทึกโดยระบบตามเวลาจริง · บันทึกย้อนหลังได้ แต่ไม่นับผ่าน KPI 1</div>
 <div class="table-responsive mt-3"><table class="table simple-table"><thead><tr><th>วันที่</th><th>สถานที่</th><th>เริ่มรับบริจาค</th><th>สถานะ</th><th></th></tr></thead><tbody>${miniCqiOutings.map(r=>{const late=new Date(r.created_at)>=new Date(r.start_at);return `<tr><td>${miniCqiHtml(r.outing_date)}</td><td>${miniCqiHtml(r.site)}</td><td>${miniCqiHtml(r.start_at)}</td><td>${r.confirmed_at?'พร้อม · '+miniCqiHtml(r.confirmed_at):late?'บันทึกย้อนหลัง':'ยังไม่ยืนยัน'}</td><td>${r.confirmed_at?'':`<button class="btn btn-light btn-sm" onclick="renderMiniCqiOutings('${r.id}')">แก้ไข</button> <button class="btn btn-main btn-sm" onclick="confirmMiniCqiOuting('${r.id}')">ยืนยันพร้อมเริ่ม</button>`}</td></tr>`}).join('')||'<tr><td colspan="5">ยังไม่มีรายการออกหน่วย</td></tr>'}</tbody></table></div></div>`;
}
async function saveMiniCqiOuting(event){
 event.preventDefault();const form=event.currentTarget, f=new FormData(form);
 const date=f.get('outing_date'),local=f.get('start_at');
 if(String(local).slice(0,10)!==date)return showModal('error','วันเวลาไม่ตรงกัน','วันที่ออกหน่วยต้องตรงกับวันเริ่มรับบริจาค');
 const payload={id:f.get('id')||undefined,outing_date:date,site:String(f.get('site')||'').trim(),start_at:new Date(local).toISOString(),inspected_by_name:String(f.get('inspected_by_name')||'').trim(),area_ok:f.has('area_ok'),ventilation_ok:f.has('ventilation_ok'),workstations_ok:f.has('workstations_ok'),equipment_ok:f.has('equipment_ok'),donor_beds_ok:f.has('donor_beds_ok'),consumables_ok:f.has('consumables_ok'),emergency_kit_ok:f.has('emergency_kit_ok'),cold_chain_ok:f.has('cold_chain_ok'),facilities_ok:f.has('facilities_ok'),issue_text:String(f.get('issue_text')||'').trim(),resolution_text:String(f.get('resolution_text')||'').trim()};
 try{await MinimumStockBackend.saveCqiOuting(payload);await loadMiniCqiOutings()}catch(err){showModal('error','บันทึกไม่ได้',err.message)}
}
async function confirmMiniCqiOuting(id){
 try{await MinimumStockBackend.confirmCqiOuting(id);await loadMiniCqiOutings()}catch(err){showModal('error','ยืนยันไม่ได้',err.message)}
}
