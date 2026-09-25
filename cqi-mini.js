/* Mini Mobile Blood Donation CQI. This page intentionally reuses the existing TRC dependency and bag-family rules. */
let miniCqiPeriod={from:'',to:''};
let miniCqiResult=null;
let miniCqiOutings=[];
let miniCqiMobileLoaded=false;
let miniCqiActiveTab='overview';
let miniCqiEditingId=null;
let miniCqiSelectedPlanId=null;
let miniCqiProductScope='red';
let miniCqiProductGroups=['RBC'];
let miniCqiYears=[];
const miniCqiHtml=value=>escapeOutreachHtml(String(value??''));
const miniCqiPct=(n,d)=>d>0?(100*n/d).toFixed(1)+'%':'—';
const miniCqiMonth=date=>String(date||'').slice(0,7);
const miniCqiDateTimeLocal=date=>{const d=new Date(date);return Number.isNaN(d.valueOf())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
function miniCqiRange(){
  const from=miniCqiPeriod.from||getTodayYmd().slice(0,7);
  const to=miniCqiPeriod.to||from;
  return {from:`${from}-01`,to:outreachLastDayOfMonth(to)};
}
function miniCqiPlanPassed(row){return row.forecast?.canEvaluate===true && Array.isArray(row.forecast?.groups) && row.forecast.groups.length===4 && Array.isArray(row.forecast?.riskGroups) && row.forecast.riskGroups.length>0}
function miniCqiSummary(plans){
  const started=plans.filter(row=>row.outing_date<=getTodayYmd());
  const passed=started.filter(miniCqiPlanPassed);
  return {passed:passed.length,total:started.length,missing:started.filter(row=>!row.forecast?.canEvaluate||row.forecast?.groups?.length!==4),
    retrospective:started.filter(row=>row.evidence_kind==='reconstructed'),
    risk:passed};
}
function miniCqiRoutineCounts(m){const rare=Number(m?.rareTrcRbc||0);return {num:Number(m?.routineTrcRbc ?? Math.max(0,Number(m?.trcRbc||0)-rare)),den:Number(m?.adjustedTotalRbc ?? Math.max(0,Number(m?.totalRbc||0)-rare))}}
function miniCqiYearRows(rows,makeValue){return rows.map(row=>({year:Number(row.year),month:Number(row.month),value:makeValue(row)})).filter(row=>miniCqiYears.includes(row.year))}
function miniCqiKpi3CountChart(monthlyCounts){
 const months=[...monthlyCounts].sort((a,b)=>a[0].localeCompare(b[0]));
 if(!months.length)return '<div class="small-muted py-3">ยังไม่มีจำนวนถุงในช่วงที่เลือก</div>';
 const max=Math.max(1,...months.map(([,c])=>Math.max(c.used,c.expired))),w=Math.max(720,110+months.length*76),h=310,left=58,base=250,top=86,step=(w-left-32)/months.length;
 const grid=[0,.5,1].map(f=>{const n=Math.round(max*f),y=base-(base-top)*f;return `<line x1="${left}" y1="${y}" x2="${w-30}" y2="${y}" stroke="#e6eef4"/><text x="${left-10}" y="${y+4}" text-anchor="end" font-size="12" fill="#60798c">${n}</text>`}).join('');
 const bars=months.map(([month,c],i)=>{const x=left+i*step+step/2,scale=(base-top)/max;return `<rect x="${x-22}" y="${base-c.used*scale}" width="19" height="${c.used*scale}" rx="3" fill="#279675"><title>${month} ใช้/จ่าย/ส่งต่อ ${c.used} ถุง</title></rect><text x="${x-12}" y="${Math.max(top+13,base-c.used*scale-6)}" text-anchor="middle" font-size="12" font-weight="700" fill="#20755c">${c.used}</text><rect x="${x+3}" y="${base-c.expired*scale}" width="19" height="${c.expired*scale}" rx="3" fill="#e28a44"><title>${month} หมดอายุ ${c.expired} ถุง</title></rect><text x="${x+13}" y="${Math.max(top+13,base-c.expired*scale-6)}" text-anchor="middle" font-size="12" font-weight="700" fill="#ad6030">${c.expired}</text><text x="${x}" y="${base+22}" text-anchor="middle" font-size="11" fill="#526b7d">${month.slice(5)}/${Number(month.slice(0,4))+543}</text>`}).join('');
 return `<div class="kpi-year-chart-scroll mini-cqi-kpi3-count-chart"><svg class="kpi-exec-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="จำนวนถุงใช้หรือจ่ายหรือส่งต่อ เทียบกับจำนวนถุงหมดอายุ แยกรายเดือน"><rect x="5" y="5" width="${w-10}" height="${h-10}" rx="20" fill="#fff" stroke="#e7eff5"/><text x="${left}" y="34" font-size="17" font-weight="700" fill="#234969">จำนวนถุงแยกผลรายเดือน (ถุง)</text><rect x="${left}" y="49" width="13" height="13" fill="#279675"/><text x="${left+20}" y="60" font-size="12" fill="#34566a">ใช้/จ่าย/ส่งต่อ</text><rect x="${left+154}" y="49" width="13" height="13" fill="#e28a44"/><text x="${left+174}" y="60" font-size="12" fill="#34566a">หมดอายุ</text>${grid}${bars}</svg></div>`;
}
function miniCqiYearChoices(from,to){let choices='';for(let year=2019;year<=Math.max(Number(to.slice(0,4)),Number(getTodayYmd().slice(0,4)));year++){choices+=`<label><input type="checkbox" name="miniCqiYear" value="${year}" ${miniCqiYears.includes(year)?'checked':''}> ${year+543}</label>`}return choices}
function miniCqiPreset(which){const today=getTodayYmd().slice(0,7),year=today.slice(0,4);if(which==='year'){document.getElementById('miniCqiFrom').value=`${year}-01`;document.getElementById('miniCqiTo').value=today}else if(which==='all'){document.getElementById('miniCqiFrom').value='2025-01';document.getElementById('miniCqiTo').value=today}else{const date=new Date(`${today}-01T12:00:00`);date.setMonth(date.getMonth()-11);document.getElementById('miniCqiFrom').value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;document.getElementById('miniCqiTo').value=today}miniCqiYears=Array.from({length:Number(document.getElementById('miniCqiTo').value.slice(0,4))-Number(document.getElementById('miniCqiFrom').value.slice(0,4))+1},(_,i)=>Number(document.getElementById('miniCqiFrom').value.slice(0,4))+i);miniCqiProductGroups=[...document.querySelectorAll('#miniCqiDashboard input[name=miniCqiProduct]:checked')].map(el=>el.value);if(!miniCqiProductGroups.length)return showModal('error','ยังไม่ได้เลือกผลิตภัณฑ์','เลือกผลิตภัณฑ์อย่างน้อยหนึ่งกลุ่ม');miniCqiProductScope=miniCqiProductGroups.length===4?'all':miniCqiProductGroups.length===1&&miniCqiProductGroups[0]==='RBC'?'red':'custom';miniCqiPeriod={from:document.getElementById('miniCqiFrom').value,to:document.getElementById('miniCqiTo').value};loadMiniCqi()}
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
    const familyExpiry=members.map(row=>String(row.expireDate||'').slice(0,10)).filter(Boolean).sort()[0]||'';
    const missingExpiry=usedRows.length>0&&!familyExpiry;
    const beforeExpiry=usedRows.every(row=>row.dateStockOut&&familyExpiry&&String(row.dateStockOut).slice(0,10)<=familyExpiry);
    const usedAfterExpiry=usedRows.some(row=>row.dateStockOut&&familyExpiry&&String(row.dateStockOut).slice(0,10)>familyExpiry);
    const status=conflicting||usedAfterExpiry?'ต้องตรวจสอบ':used?'ใช้/จ่าย/ส่งต่อ':rejected?'ไม่เหมาะสมต่อการใช้':expired?'หมดอายุ':'รอติดตามผล';
    return {key,bagNumber:representative.bagNumber,productType:representative.productType,site:representative.donateSource,
      cohortDate:firstCohort,status,members:members.length,missingExpiry,
      reason:missingExpiry?'ใช้แล้ว · ยังยืนยันวันหมดอายุไม่ได้':usedAfterExpiry?'วันที่ใช้หลังวันหมดอายุ · ต้องตรวจสอบ':'',
      beforeExpiry};
  });
}
function miniCqiCard(label,n,d,target,pass,note,provisional=false){
  const state=provisional?'รอตรวจสอบข้อมูล':d===0?'ยังไม่มีฐานข้อมูล':pass?'ผ่าน':'ไม่ผ่าน';
  return `<div class="simple-kpi mini-cqi-card ${!provisional&&d?pass?'is-good':'is-alert':''}"><span>${miniCqiHtml(label)}</span><strong>${provisional?'—':miniCqiPct(n,d)}</strong><div>${n.toLocaleString()} / ${d.toLocaleString()} · เป้าหมาย ${miniCqiHtml(target)}</div><b>${state}</b><small>${miniCqiHtml(note||'')}</small></div>`;
}
function miniCqiSetPeriod(){
  const from=document.getElementById('miniCqiFrom')?.value,to=document.getElementById('miniCqiTo')?.value;
  if(!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to)||from>to)return showModal('error','ช่วงเวลาไม่ถูกต้อง','เลือกเดือนเริ่มต้นก่อนหรือเท่ากับเดือนสิ้นสุด');
  miniCqiYears=[...document.querySelectorAll('#miniCqiDashboard input[name=miniCqiYear]:checked')].map(el=>Number(el.value));if(!miniCqiYears.length)return showModal('error','ยังไม่ได้เลือกปี','เลือกอย่างน้อยหนึ่งปีเพื่อแสดงผล');miniCqiPeriod={from,to};miniCqiProductGroups=[...document.querySelectorAll('#miniCqiDashboard input[name=miniCqiProduct]:checked')].map(el=>el.value);if(!miniCqiProductGroups.length)return showModal('error','ยังไม่ได้เลือกผลิตภัณฑ์','เลือกผลิตภัณฑ์อย่างน้อยหนึ่งกลุ่ม');miniCqiProductScope=miniCqiProductGroups.length===4?'all':miniCqiProductGroups.length===1&&miniCqiProductGroups[0]==='RBC'?'red':'custom';loadMiniCqi();
}
async function loadMiniCqi(){
  const box=document.getElementById('miniCqiDashboard');if(!box)return;
  const range=miniCqiRange();
  if(!miniCqiYears.length)miniCqiYears=[Number(range.to.slice(0,4))-1,Number(range.to.slice(0,4))].filter(year=>year>=2025);
  box.innerHTML='<div class="simple-panel">กำลังคำนวณผล CQI...</div>';
  try{
    const compareFrom=`${Math.min(...miniCqiYears)}-01-01`;
    const compareTo=`${Math.max(...miniCqiYears)}-12-31`;
    const [allOutings,dep,families]=await Promise.all([
      MinimumStockBackend.getCqiPlans(compareFrom,compareTo),
      ensureBloodKpiDependencyRange({dateFrom:compareFrom,dateTo:compareTo}),
      MinimumStockBackend.getOutreachFamilyRows({dateFrom:compareFrom,dateTo:compareTo,sourceGroups:[OUTREACH_GROUP_SELF_OUTREACH]})
    ]);
    const fromMonth=range.from.slice(5,7),toMonth=range.to.slice(5,7),crossYear=range.from.slice(0,4)!==range.to.slice(0,4);
    const inScope=date=>{const month=String(date||'').slice(5,7),year=Number(String(date||'').slice(0,4));return miniCqiYears.includes(year)&&(crossYear&&fromMonth>toMonth?month>=fromMonth||month<=toMonth:month>=fromMonth&&month<=toMonth)};
    const outings=allOutings.filter(row=>inScope(row.outing_date));
    const months=dep.months.filter(row=>inScope(`${row.year}-${String(row.month).padStart(2,'0')}-01`));
    const k1=miniCqiSummary(outings), k2={num:months.reduce((n,m)=>n+miniCqiRoutineCounts(m).num,0),den:months.reduce((n,m)=>n+miniCqiRoutineCounts(m).den,0)};
    const details=miniCqiClassifyFamilies(families.rows||[]).filter(row=>inScope(row.cohortDate)&&miniCqiProductGroups.includes(row.key.split('||').at(-1)));
    const counts=Object.fromEntries(['ใช้/จ่าย/ส่งต่อ','หมดอายุ','ไม่เหมาะสมต่อการใช้','รอติดตามผล','ต้องตรวจสอบ'].map(key=>[key,details.filter(row=>row.status===key).length]));
    const k3={num:counts['ใช้/จ่าย/ส่งต่อ'],den:counts['ใช้/จ่าย/ส่งต่อ']+counts['หมดอายุ']};
    const monthlyBagCounts=new Map();details.forEach(row=>{const month=miniCqiMonth(row.cohortDate);if(!month)return;if(!monthlyBagCounts.has(month))monthlyBagCounts.set(month,{used:0,expired:0,pending:0,rejected:0,review:0});const entry=monthlyBagCounts.get(month);const field={'ใช้/จ่าย/ส่งต่อ':'used','หมดอายุ':'expired','รอติดตามผล':'pending','ไม่เหมาะสมต่อการใช้':'rejected','ต้องตรวจสอบ':'review'}[row.status];if(field)entry[field]++});
    const missingExpiryUsed=details.filter(row=>row.missingExpiry && row.status==='ใช้/จ่าย/ส่งต่อ').length;
    miniCqiResult={range,outings,months,details,counts,k1,k2,k3,productScope:miniCqiProductScope,productGroups:[...miniCqiProductGroups],missingExpiryUsed,years:[...miniCqiYears]};
    const monthRow=m=>{const num=miniCqiRoutineCounts(m).num,den=miniCqiRoutineCounts(m).den;return `<tr><td>${m.month}/${Number(m.year)+543}</td><td>${num}</td><td>${den}</td><td>${miniCqiPct(num,den)}</td></tr>`};
    const comparison=miniCqiYearRows(months,m=>miniCqiRoutineCounts(m).den>0?miniCqiRoutineCounts(m).num/miniCqiRoutineCounts(m).den*100:null);
    const k1Monthly=new Map(),k3Monthly=new Map();
    outings.filter(o=>o.outing_date<=getTodayYmd()).forEach(o=>{const month=miniCqiMonth(o.outing_date),entry=k1Monthly.get(month)||{passed:0,total:0,missing:0,reconstructed:0};entry.total++;if(miniCqiPlanPassed(o))entry.passed++;if(!o.forecast?.canEvaluate)entry.missing++;if(o.evidence_kind==='reconstructed')entry.reconstructed++;k1Monthly.set(month,entry)});
    details.forEach(d=>{const month=miniCqiMonth(d.cohortDate),entry=k3Monthly.get(month)||{used:0,expired:0};if(d.status==='ใช้/จ่าย/ส่งต่อ')entry.used++;if(d.status==='หมดอายุ')entry.expired++;k3Monthly.set(month,entry)});
    const yearChart=map=>[...map].map(([ym,c])=>({year:Number(ym.slice(0,4)),month:Number(ym.slice(5)),value:c.total?c.passed/c.total*100:c.used+c.expired?c.used/(c.used+c.expired)*100:null}));
    const k1Chart=yearChart(k1Monthly),k3Chart=yearChart(k3Monthly);
    box.innerHTML=`<div class="simple-page-head"><div><h1>ผล CQI · ออกหน่วยบริจาคโลหิต</h1></div><button class="btn btn-light no-print" onclick="exportMiniCqi()">ส่งออก CSV รวมพร้อมสูตร</button></div>
      <div class="simple-panel mini-cqi-filters no-print"><label>จากเดือน <input type="month" id="miniCqiFrom" value="${miniCqiHtml(miniCqiPeriod.from||miniCqiMonth(range.from))}"></label><label>ถึงเดือน <input type="month" id="miniCqiTo" value="${miniCqiHtml(miniCqiPeriod.to||miniCqiMonth(range.to))}"></label><div class="mini-cqi-year-options" data-mini-product-filter><b>ผลิตภัณฑ์ (KPI 3)</b>${[['RBC','เลือดแดง (หลัก)'],['PLASMA','FFP/พลาสมา'],['PLATELET','เกล็ดเลือด'],['CRYO','Cryo']].map(([value,label])=>`<label><input type="checkbox" name="miniCqiProduct" value="${value}" ${miniCqiProductGroups.includes(value)?'checked':''}> ${label}</label>`).join('')}</div><div class="mini-cqi-presets"><button type="button" class="btn btn-light" onclick="miniCqiPreset('year')">ปีนี้</button><button type="button" class="btn btn-light" onclick="miniCqiPreset('last12')">12 เดือนล่าสุด</button><button type="button" class="btn btn-light" onclick="miniCqiPreset('all')">ทั้งหมด</button></div><div class="mini-cqi-year-options"><b>เทียบผลหลายปี</b> ${miniCqiYearChoices(range.from,range.to)}</div><button class="btn btn-main" onclick="miniCqiSetPeriod()">แสดงผล</button></div>
      <nav class="mini-cqi-tabs no-print" aria-label="เมนูย่อย CQI">${[['overview','ภาพรวม'],['kpi1','KPI 1 · แผนออกหน่วย'],['kpi2','KPI 2 · กาชาด Routine'],['kpi3','KPI 3 · ใช้ประโยชน์']].map(([key,label])=>`<button type="button" data-mini-tab="${key}" onclick="miniCqiOpenTab('${key}')">${label}</button>`).join('')}</nav>
      <div data-mini-panel="overview" class="simple-kpi-grid blood-kpi-main-grid mb-3">${miniCqiCard('1 · ออกหน่วยตามช่วงคาดการณ์เสี่ยงขาด',k1.passed,k1.total,'100%',k1.passed===k1.total,`${k1.missing.length} ครั้งข้อมูลไม่พอ · ${k1.risk.length} ครั้งพบหมู่เลือดเสี่ยง`)}${miniCqiCard('2 · กาชาด Routine · เลือดแดง',k2.num,k2.den,'≤ 20%',k2.num/k2.den<=.20,'ตัดเลือดหายาก/จำเป็นตามนิยามหน้า KPI เดิม')}${miniCqiCard('3 · ใช้ประโยชน์เลือดแดงออกหน่วย',k3.num,k3.den,'≥ 95%',k3.num/k3.den>=.95,`${counts['รอติดตามผล']} รอติดตาม · ${counts['ต้องตรวจสอบ']} ต้องตรวจสอบ · ${missingExpiryUsed} ถุงยังยืนยันก่อนหมดอายุไม่ได้`)}</div>
      <div data-mini-panel="kpi1" class="simple-panel mb-3"><div class="panel-heading-row"><h3>KPI 1 · แผนออกหน่วยอ้างอิงผลคาดการณ์เลือดแดง</h3><div class="no-print"><button class="btn btn-light" onclick="exportMiniCqiChart('kpi1')">PNG กราฟนี้</button> <button class="btn btn-light" onclick="exportMiniCqiSection('kpi1')">ส่งออก KPI 1</button></div></div>
        <div class="mini-cqi-hint">เป้าหมาย 100% · บันทึกแผนก่อนวันออกหน่วย</div><details class="mini-cqi-help"><summary>วิธีนับ KPI 1</summary><p>ตัวตั้ง: แผนที่คำนวณครบ 4 หมู่และคาดว่ามีอย่างน้อย 1 หมู่ต่ำกว่า Minimum ณ วันทราบแผน · ตัวหาร: แผนที่ลงทะเบียนและถึงวันออกหน่วยแล้ว ตรวจความครบกับตารางออกหน่วยจริง การกรอกวันเวลาย้อนหลังไม่ใช่หลักฐานว่าบันทึกในวันนั้น</p></details>
        <div id="miniCqiEditBanner" class="mini-cqi-edit-banner no-print" hidden></div><form id="miniCqiPlanForm" class="mini-cqi-form-grid no-print" onsubmit="registerMiniCqiPlan(event)"><label class="mini-cqi-field-when">วันทราบแผน<input name="decision_at" type="datetime-local" class="form-control" required></label><label class="mini-cqi-field-outing">วันที่ออกหน่วย<input name="outing_date" type="date" class="form-control" required></label><label class="mini-cqi-field-site">สถานที่<input name="site" class="form-control" required></label><label class="mini-cqi-field-ref">เลขหนังสืออ้างอิง (ถ้ามี)<input name="evidence_ref" class="form-control" placeholder="เลขหนังสือ"></label><label class="mini-cqi-field-photo">รูปกิจกรรมวันนี้จาก Staff Planner (ถ้ามี)<input name="evidence_image" type="file" accept="image/jpeg,image/png,image/webp" class="form-control"><small>รูปที่เห็นเวลาบันทึกจริง · JPG, PNG, WebP ≤ 5 MB</small></label><div class="mini-cqi-form-actions"><button class="btn btn-main" type="submit" id="miniCqiPlanSubmit">ตรวจคาดการณ์และบันทึก</button><button class="btn btn-light" type="button" id="miniCqiEditCancel" onclick="miniCqiCancelEdit()" hidden>ยกเลิกแก้ไข</button></div></form>
        <div id="miniCqiPlanDecision">${renderMiniCqiDecision(outings)}</div>
        ${renderKpiYearOverlayChart(k1Chart,'value',{title:'แผนออกหน่วยในช่วงเสี่ยงรายเดือน (%)',unit:'%',yMax:100,target:100})}<details class="mini-cqi-help"><summary>ที่มาของผลคาดการณ์</summary><p>ใช้ Stock ต้นวันและยอดใช้ก่อนวันทราบแผนจาก LIS เพื่อประกอบการตัดสินใจ</p></details>
        <div class="mini-cqi-hint no-print">ผู้บันทึกหรือผู้ดูแลระบบแก้รายการเดิมได้ โดยระบุเหตุผลทุกครั้ง</div><div class="table-responsive"><table class="table simple-table"><thead><tr><th>ออกหน่วย</th><th>สถานที่</th><th>เวลาทราบแผน</th><th>หลักฐาน</th><th>หมู่เสี่ยง</th><th>ผล</th><th class="no-print">แก้ไข</th></tr></thead><tbody>${outings.map(row=>`<tr><td>${miniCqiHtml(row.outing_date)}</td><td>${miniCqiHtml(row.site)}</td><td>${miniCqiHtml(new Date(row.decision_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))}</td><td>${miniCqiHtml(row.evidence_ref||'—')}${row.evidence_image_path?`<br><button type="button" class="btn btn-light btn-sm no-print" onclick="miniCqiViewEvidence('${miniCqiHtml(row.id)}')">ดูรูป</button>`:''}</td><td>${miniCqiHtml((row.forecast?.riskGroups||[]).join(', ')||'ไม่พบ')}</td><td>${miniCqiPlanPassed(row)?'ผ่าน · พบหมู่เสี่ยง':row.forecast?.canEvaluate?'ไม่พบหมู่เสี่ยง':'ประวัติไม่ครบ · ประเมินไม่ได้'}</td><td class="no-print"><button type="button" class="btn btn-light" onclick="miniCqiStartEdit('${miniCqiHtml(row.id)}')">แก้ไข</button></td></tr>`).join('')||'<tr><td colspan="7">ยังไม่มีแผนตามเวลาทราบแผนในช่วงนี้ · แผน KPI 1 รุ่นวันออกหนังสือเก่าไม่ถูกย้ายมาเป็นหลักฐานเวลาโดยอัตโนมัติ</td></tr>'}</tbody></table></div></div>
      <div data-mini-panel="kpi2" class="simple-panel mb-3"><div class="panel-heading-row"><h3>KPI 2 · พึ่งกาชาด Routine · เลือดแดง</h3><div class="no-print"><button class="btn btn-light" onclick="exportMiniCqiChart('kpi2')">PNG กราฟนี้</button> <button class="btn btn-light" onclick="exportMiniCqiSection('kpi2')">ส่งออก KPI 2</button></div></div><div class="mini-cqi-hint">${k2.num} / ${k2.den} ถุง · เป้าหมาย ≤ 20%</div><details class="mini-cqi-help"><summary>วิธีนับ KPI 2</summary><p>นับเฉพาะเลือดแดง Routine ตามหน้า KPI เดิม รวมจำนวนถุงก่อนหาร ไม่เฉลี่ยเปอร์เซ็นต์รายเดือน</p></details>${renderKpiYearOverlayChart(comparison,'value',{title:'เทียบเดือนเดียวกันตามปีที่เลือก · Routine (%)',unit:'%',yMax:100,target:20})}<div class="table-responsive"><table class="table simple-table"><thead><tr><th>เดือน</th><th>กาชาด Routine</th><th>Routine รับเข้าทั้งหมด</th><th>อัตรา</th></tr></thead><tbody>${months.map(monthRow).join('')}</tbody></table></div></div>
      <div data-mini-panel="kpi3" class="simple-panel"><div class="panel-heading-row"><h3>KPI 3 · ใช้ประโยชน์เลือดออกหน่วย · ${miniCqiProductGroups.map(x=>({RBC:'เลือดแดง',PLASMA:'พลาสมา',PLATELET:'เกล็ดเลือด',CRYO:'Cryo'}[x])).join(', ')}</h3><div class="no-print"><button class="btn btn-light" onclick="exportMiniCqiChart('kpi3')">PNG อัตรา</button> <button class="btn btn-light" onclick="exportMiniCqiChart('kpi3','counts')">PNG จำนวนถุง</button> <button class="btn btn-light" onclick="exportMiniCqiSection('kpi3')">ส่งออก KPI 3</button></div></div>${renderKpiYearOverlayChart(k3Chart,'value',{title:'อัตราใช้ประโยชน์เลือดออกหน่วยรายเดือน (%)',unit:'%',yMax:100,target:95})}${miniCqiKpi3CountChart(monthlyBagCounts)}<div class="mini-cqi-counts">${Object.entries(counts).map(([key,count])=>`<span>${miniCqiHtml(key)} <b>${count}</b></span>`).join('')}</div><div class="mini-cqi-hint">ใช้ ${k3.num} / (ใช้ + หมดอายุ) ${k3.den} ถุง</div><details class="mini-cqi-help"><summary>วิธีนับ KPI 3</summary><p>Rejected, รอติดตาม และต้องตรวจสอบไม่อยู่ในตัวหาร · ${missingExpiryUsed} ถุงใช้แล้วแต่ยังยืนยันวันหมดอายุไม่ได้ อัตรานี้อ้างอิงสถานะ LIS</p></details><div class="table-responsive"><table class="table simple-table"><thead><tr><th>เดือนรับเข้า</th><th>ใช้</th><th>หมดอายุ</th><th>Rejected</th><th>รอติดตาม</th><th>ต้องตรวจสอบ</th><th>ผล</th></tr></thead><tbody>${[...monthlyBagCounts].sort((a,b)=>a[0].localeCompare(b[0])).map(([month,c])=>`<tr><td>${miniCqiHtml(month)}</td><td>${c.used}</td><td>${c.expired}</td><td>${c.rejected}</td><td>${c.pending}</td><td>${c.review}</td><td>${miniCqiPct(c.used,c.used+c.expired)}</td></tr>`).join('')}</tbody></table></div><details><summary>ดูรายถุง (${details.length.toLocaleString()} ถุง)</summary><div class="table-responsive mini-cqi-bag-scroll"><table class="table simple-table"><thead><tr><th>Bag No.</th><th>รับเข้า</th><th>จุดออกหน่วย</th><th>ผลิตภัณฑ์</th><th>ผล</th><th>เหตุผลที่ต้องตรวจสอบ</th></tr></thead><tbody>${details.map(row=>`<tr><td>${miniCqiHtml(row.bagNumber)}</td><td>${miniCqiHtml(row.cohortDate)}</td><td>${miniCqiHtml(row.site)}</td><td>${miniCqiHtml(row.productType)}</td><td>${miniCqiHtml(row.status)}</td><td>${miniCqiHtml(row.reason)}</td></tr>`).join('')}</tbody></table></div></details></div>`;
    miniCqiOpenTab(miniCqiActiveTab);
  }catch(err){box.innerHTML=`<div class="simple-panel"><h3>เปิดผล CQI ไม่ได้</h3><p>${miniCqiHtml(err.message)}</p><small>ตรวจว่าได้รัน SQL-v2.9.80-CQI-DECISION-TIME.sql แล้ว</small></div>`;}
}
function miniCqiCsvCell(value){return '"'+String(value??'').replaceAll('"','""')+'"'}
function miniCqiOpenTab(tab){
 miniCqiActiveTab=['overview','kpi1','kpi2','kpi3'].includes(tab)?tab:'overview';
 document.querySelectorAll('#miniCqiDashboard [data-mini-panel]').forEach(el=>{el.hidden=el.dataset.miniPanel!==miniCqiActiveTab});
 document.querySelectorAll('#miniCqiDashboard [data-mini-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.miniTab===miniCqiActiveTab);el.setAttribute('aria-current',el.dataset.miniTab===miniCqiActiveTab?'page':'false')});
 document.querySelectorAll('#miniCqiDashboard [data-mini-product-filter]').forEach(el=>{el.hidden=!['overview','kpi3'].includes(miniCqiActiveTab)});
 document.querySelectorAll('[data-mini-side]').forEach(el=>el.classList.toggle('active',el.dataset.miniSide===miniCqiActiveTab));
}
function miniCqiGo(tab){miniCqiActiveTab=tab;document.getElementById('miniCqiTree')?.classList.add('open');navigateToPageRoute('mini-cqi');if(miniCqiResult)miniCqiOpenTab(tab)}
function miniCqiDownloadCsv(rows,name){
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(miniCqiCsvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`CQI-${name}-${miniCqiResult.range.from}-${miniCqiResult.range.to}-years-${miniCqiResult.years.join('-')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);
}
function exportMiniCqiSection(key){
 const r=miniCqiResult;if(!r)return;
 const names={kpi1:'แผนออกหน่วยตามผลคาดการณ์',kpi2:'พึ่งกาชาด Routine',kpi3:'ใช้ประโยชน์เลือดออกหน่วย'};
 const s={kpi1:r.k1,kpi2:r.k2,kpi3:r.k3}[key],num=key==='kpi1'?s.passed:s.num,den=key==='kpi1'?s.total:s.den;
 const formulas={kpi1:'ครั้งที่ผล ณ วันที่ทราบแผนคำนวณได้และคาดว่ามีหมู่เลือดแดงต่ำกว่า Minimum / ครั้งออกหน่วยที่ลงทะเบียนและถึงวันออกหน่วยแล้ว; LIS ย้อนหลังละเอียดระดับวัน ไม่ใช่นาที',kpi2:'จำนวนถุงกาชาด Routine / จำนวนถุง Routine รับเข้าทั้งหมด',kpi3:'ถุงต้นทางที่ใช้/จ่าย/ส่งต่อตามสถานะ LIS / (ถุงที่ใช้/จ่าย/ส่งต่อ + ถุงหมดอายุ)'};
 const rows=[['CQI '+names[key],r.range.from,r.range.to,'ปีที่เลือก',r.years.map(y=>y+543).join('; ')],['ตัวตั้ง','ตัวหาร','ร้อยละ','เป้าหมาย','สูตร'],[num,den,miniCqiPct(num,den),{kpi1:'100%',kpi2:'≤20%',kpi3:'≥95%'}[key],formulas[key]]];
 if(key==='kpi2')rows.push(['ผลิตภัณฑ์','เลือดแดง Routine (ฐานเดียวกับหน้า KPI เดิม)']);
 if(key==='kpi3')rows.push(['ผลิตภัณฑ์',r.productGroups.join('; ')],['ถุงที่ใช้แต่ไม่มีวันหมดอายุ',r.missingExpiryUsed]);
 if(key==='kpi1'){rows.push([],['วันที่ออกหน่วย','สถานที่','เวลาทราบแผน','หลักฐาน','เวลาบันทึกจริง','หมู่เสี่ยง','ผล']);r.outings.forEach(o=>rows.push([o.outing_date,o.site,o.decision_at,o.evidence_ref,o.created_at,(o.forecast?.riskGroups||[]).join(', '),miniCqiPlanPassed(o)?'ผ่าน':o.forecast?.canEvaluate?'ไม่พบหมู่เสี่ยง':'ประเมินไม่ได้']))}
 if(key==='kpi2'){rows.push([],['เดือน','กาชาด Routine','Routine รับเข้าทั้งหมด','ร้อยละ']);r.months.forEach(m=>rows.push([`${m.year}-${m.month}`,miniCqiRoutineCounts(m).num,miniCqiRoutineCounts(m).den,miniCqiPct(miniCqiRoutineCounts(m).num,miniCqiRoutineCounts(m).den)]))}
 if(key==='kpi3'){rows.push([],['Bag No.','วันที่รับเข้า','สถานที่','ผลิตภัณฑ์','ผล','เหตุผลที่ต้องตรวจสอบ']);r.details.forEach(d=>rows.push([d.bagNumber,d.cohortDate,d.site,d.productType,d.status,d.reason]))}
 miniCqiDownloadCsv(rows,key);
}
function exportMiniCqiChart(key,chartType="rate"){
 const svg=document.querySelector(chartType==="counts"?`#miniCqiDashboard [data-mini-panel="${key}"] .mini-cqi-kpi3-count-chart svg`:`#miniCqiDashboard [data-mini-panel="${key}"] svg.kpi-exec-chart`);
 if(!svg)return showModal('error','ยังไม่มีกราฟ','เลือกช่วงเดือนที่มีข้อมูลก่อน');
 const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 const img=new Image();img.onload=()=>{try{const size=svg.viewBox.baseVal,canvas=document.createElement('canvas');canvas.width=(size.width||1100)*2;canvas.height=(size.height||450)*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`CQI-${key}-${chartType}-${miniCqiResult.range.from}-${miniCqiResult.range.to}-years-${miniCqiResult.years.join('-')}.png`;a.click()}finally{URL.revokeObjectURL(url)}};
 img.onerror=()=>{URL.revokeObjectURL(url);showModal('error','ส่งออกกราฟไม่สำเร็จ','ลองใหม่อีกครั้ง')};img.src=url;
}
function exportMiniCqi(){
 const r=miniCqiResult;if(!r)return;
 const lines=[['ผล CQI Mini Mobile Blood Donation',r.range.from,r.range.to,'ปีที่เลือก',r.years.map(y=>y+543).join('; ')],['KPI','ตัวตั้ง','ตัวหาร','ร้อยละ','เป้าหมาย','สูตร'],['KPI 1',r.k1.passed,r.k1.total,miniCqiPct(r.k1.passed,r.k1.total),'100%','ผล ณ วันทราบแผนคาดว่ามีหมู่เลือดแดงต่ำกว่า Minimum / ครั้งออกหน่วยที่ลงทะเบียนและถึงวันออกหน่วยแล้ว; LIS ย้อนหลังละเอียดระดับวัน'],['KPI 2 · เลือดแดง',r.k2.num,r.k2.den,miniCqiPct(r.k2.num,r.k2.den),'≤20%','กาชาด Routine / รับเข้า Routine ทั้งหมด; ไม่รวม Rare'],['KPI 3 · '+(r.productGroups.join('; ')),r.k3.num,r.k3.den,miniCqiPct(r.k3.num,r.k3.den),'≥95%','ใช้/จ่าย/ส่งต่อตาม LIS / (ใช้/จ่าย/ส่งต่อ + หมดอายุ); นับถุงต้นทาง; ถุงที่ขาดวันหมดอายุยังไม่ยืนยันว่าใช้ก่อนหมดอายุ'],['KPI 3 ถุงที่ใช้แต่ไม่มีวันหมดอายุ',r.missingExpiryUsed],[],['เดือน','กาชาด Routine','Routine รับเข้าทั้งหมด','อัตรา']];
 r.months.forEach(m=>{const n=miniCqiRoutineCounts(m).num,d=miniCqiRoutineCounts(m).den;lines.push([`${m.year}-${m.month}`,n,d,miniCqiPct(n,d)]);});
 lines.push([],['วันออกหน่วย','สถานที่','เวลาทราบแผน','หลักฐาน','เวลาบันทึกจริง','หมู่เสี่ยง','ผล']);
 r.outings.forEach(o=>lines.push([o.outing_date,o.site,o.decision_at,o.evidence_ref,o.created_at,(o.forecast?.riskGroups||[]).join(', '),miniCqiPlanPassed(o)?'ผ่าน':o.forecast?.canEvaluate?'ไม่พบหมู่เสี่ยง':'ประเมินไม่ได้']));
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
 box.innerHTML=`<div class="simple-panel mb-3 mini-cqi-outing"><div class="panel-heading-row"><div><h3>แบบตรวจความพร้อมก่อนออกหน่วย</h3><div class="small-muted">แบบตรวจความพร้อมหน้างาน; KPI 1 ฉบับใหม่ใช้ผลคาดการณ์ ณ เวลาที่ทราบแผนในหน้า CQI</div></div><button class="btn btn-light" onclick="navigateToPageRoute('mini-cqi')">ดูผล CQI</button></div>
 <form id="miniCqiOutingForm" onsubmit="saveMiniCqiOuting(event)"><input type="hidden" name="id" value="${miniCqiHtml(record.id||'')}">
 <div class="mini-cqi-form-grid"><label>วันที่ออกหน่วย<input class="form-control" name="outing_date" type="date" required value="${miniCqiHtml(record.outing_date||getTodayYmd())}"></label><label>สถานที่<input class="form-control" name="site" required value="${miniCqiHtml(record.site||'')}"></label><label>เวลาเริ่มรับบริจาค<input class="form-control" name="start_at" type="datetime-local" required value="${miniCqiHtml(record.start_at?miniCqiDateTimeLocal(record.start_at):'')}"></label><label>ผู้ตรวจ<input class="form-control" name="inspected_by_name" value="${miniCqiHtml(record.inspected_by_name||'')}"></label></div>
 <div class="mini-cqi-checks">${checks.map(([key,label])=>`<label><input type="checkbox" name="${key}" ${record[key]?'checked':''}> ${label}</label>`).join('')}</div><div class="mini-cqi-form-grid"><label>ปัญหาที่พบ<textarea class="form-control" name="issue_text">${miniCqiHtml(record.issue_text||'')}</textarea></label><label>การแก้ไขก่อนเริ่ม<textarea class="form-control" name="resolution_text">${miniCqiHtml(record.resolution_text||'')}</textarea></label></div><button class="btn btn-main" type="submit">${record.id?'บันทึกการตรวจ':'ลงทะเบียนออกหน่วย'}</button>${record.id?'<button class="btn btn-light" type="button" onclick="renderMiniCqiOutings()">ยกเลิกแก้ไข</button>':''}</form>
 <div class="small-muted mt-2">เวลายืนยันพร้อมและผู้ยืนยันบันทึกโดยระบบตามเวลาจริง · บันทึกย้อนหลังได้ · ผลแบบตรวจความพร้อมแยกจาก KPI 1 แผนออกหน่วย</div>
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

async function registerMiniCqiPlan(event){
 event.preventDefault();const form=event.currentTarget,f=new FormData(form);
 const decisionLocal=String(f.get('decision_at')||''),outingDate=String(f.get('outing_date')||'');
 const decisionTime=new Date(`${decisionLocal}:00+07:00`);
 if(!decisionLocal||Number.isNaN(decisionTime.getTime())||decisionTime>new Date()||outingDate<=decisionLocal.slice(0,10))return showModal('error','ตรวจวันที่อีกครั้ง','เวลาที่ทราบแผนต้องไม่เกินเวลาปัจจุบัน และวันออกหน่วยต้องหลังวันทราบแผน');
 const file=form.elements.evidence_image?.files?.[0]||null;
 if(file&&!['image/jpeg','image/png','image/webp'].includes(file.type))return showModal('error','ไฟล์รูปไม่รองรับ','ใช้ JPG, PNG หรือ WebP เท่านั้น');
 if(file&&file.size>5*1024*1024)return showModal('error','รูปใหญ่เกินไป','เลือกไฟล์ไม่เกิน 5 MB');
 const evidenceRef=String(f.get('evidence_ref')||'').trim();
 if(!evidenceRef&&!file&&!miniCqiEditingId)return showModal('error','ยังไม่มีหลักฐาน','กรอกเลขอ้างอิงหรือแนบรูปหลักฐาน');
 const button=form.querySelector('[type=submit]');button.disabled=true;
 const editingId=miniCqiEditingId;
 try{const payload={decisionAt:decisionTime.toISOString(),evidenceRef:String(f.get('evidence_ref')||'').trim(),outingDate,site:String(f.get('site')||'').trim()};
 const previous=editingId?miniCqiResult?.outings.find(row=>row.id===editingId):null;
 const changed=previous&&(new Date(previous.decision_at).getTime()!==new Date(payload.decisionAt).getTime()||previous.outing_date!==payload.outingDate||previous.site!==payload.site||previous.evidence_ref!==payload.evidenceRef);
 if(editingId&&!changed&&!file)throw new Error('ยังไม่ได้เปลี่ยนข้อมูลหรือแนบรูป');
 const plan=editingId?(changed?await MinimumStockBackend.updateCqiPlan({...payload,evidenceRef:evidenceRef||'ภาพกิจกรรมวันนี้จาก Staff Planner',id:editingId,reason:String(f.get('edit_reason')||'').trim()}):previous):await MinimumStockBackend.registerCqiPlan({...payload,evidenceRef:evidenceRef||'ภาพกิจกรรมวันนี้จาก Staff Planner'});
 if(file){
   let uploadedPath='';
   try{uploadedPath=await MinimumStockBackend.uploadCqiEvidence(file);await MinimumStockBackend.attachCqiEvidence(plan.id,uploadedPath,String(f.get('edit_reason')||'').trim()||'แนบภาพกิจกรรมวันนี้จาก Staff Planner')}
   catch(uploadError){if(uploadedPath)await MinimumStockBackend.discardCqiEvidenceUpload(uploadedPath).catch(()=>{});miniCqiEditingId=null;await loadMiniCqi();showModal('error','บันทึกแผนแล้ว แต่แนบรูปไม่สำเร็จ',uploadError.message);return}
 }
 miniCqiEditingId=null;
 miniCqiActiveTab='kpi1';await loadMiniCqi();showModal('success',editingId?'แก้ไขแผนแล้ว':'บันทึกแผนแล้ว','บันทึกผล KPI 1 แล้ว');
 }catch(err){showModal('error','บันทึกแผนไม่ได้',err.message)}finally{button.disabled=false}
}

function miniCqiStartEdit(id){
 const row=miniCqiResult?.outings.find(item=>item.id===id),form=document.getElementById('miniCqiPlanForm');if(!row||!form)return;
 miniCqiEditingId=id;
 const local=new Date(new Date(row.decision_at).getTime()+7*60*60*1000).toISOString().slice(0,16);
 form.elements.decision_at.value=local;form.elements.evidence_ref.value=row.evidence_ref||'';
 form.elements.outing_date.value=row.outing_date||'';form.elements.site.value=row.site||'';
 let reason=form.querySelector('[name=edit_reason]');if(!reason){reason=document.createElement('label');reason.innerHTML='เหตุผลที่แก้ไข<input name="edit_reason" class="form-control" required maxlength="500">';form.querySelector('.mini-cqi-form-actions').before(reason)}
 reason.hidden=false;reason.querySelector('input').value='';
 document.getElementById('miniCqiPlanSubmit').textContent='บันทึกการแก้ไข';
 document.getElementById('miniCqiEditCancel').hidden=false;
 const banner=document.getElementById('miniCqiEditBanner');banner.hidden=false;banner.textContent=`กำลังแก้แผน ${row.outing_date} · ${row.site} · กรุณาระบุเหตุผล`;form.scrollIntoView({behavior:'smooth',block:'center'});
}
function miniCqiCancelEdit(){
 miniCqiEditingId=null;const form=document.getElementById('miniCqiPlanForm');if(!form)return;form.reset();
 const reason=form.querySelector('[name=edit_reason]')?.parentElement;if(reason)reason.hidden=true;
 document.getElementById('miniCqiPlanSubmit').textContent='ตรวจคาดการณ์และบันทึก';
 document.getElementById('miniCqiEditCancel').hidden=true;document.getElementById('miniCqiEditBanner').hidden=true;
}

function renderMiniCqiDecision(rows){
 if(!rows.length)return '<div class="mini-cqi-empty">ยังไม่มีแผนในช่วงที่เลือก · เลือกช่วงเดือนตามวันที่ออกหน่วย</div>';
 const today=getTodayYmd();
 const sorted=[...rows].sort((a,b)=>{const af=a.outing_date>=today,bf=b.outing_date>=today;return af!==bf?(af?-1:1):af?a.outing_date.localeCompare(b.outing_date):b.outing_date.localeCompare(a.outing_date)});
 const selected=rows.find(row=>row.id===miniCqiSelectedPlanId)||sorted[0];miniCqiSelectedPlanId=selected.id;
 const forecast=selected.forecast||{},groups=Array.isArray(forecast.groups)?forecast.groups:[],risk=forecast.riskGroups||[];
 const valid=forecast.canEvaluate===true&&groups.length===4&&groups.every(g=>g.projected!==null&&g.projected!==undefined&&g.minimum!==null&&g.minimum!==undefined&&Number.isFinite(Number(g.projected))&&Number.isFinite(Number(g.minimum)));
 const status=valid?(risk.length?`ควรดำเนินตามแผน · คาดว่าต่ำกว่า Minimum ${risk.length} หมู่`:'ทบทวนความจำเป็น · ไม่พบหมู่ต่ำกว่า Minimum'):'ข้อมูลไม่พอสำหรับสรุปแผน';
 const cls=!valid?'is-unknown':risk.length?'is-risk':'is-clear';
 const abos=['A','B','O','AB'];
 return `<section class="mini-cqi-decision ${cls}" aria-label="ผลคาดการณ์ของแผนออกหน่วย"><div class="mini-cqi-decision-top"><div><span class="mini-cqi-eyebrow">ผลคาดการณ์ ณ วันทราบแผน</span><h4>${miniCqiHtml(status)}</h4><div>${miniCqiHtml(selected.site)} · ออกหน่วย ${miniCqiHtml(selected.outing_date)}</div></div><label>เลือกแผน <select class="form-control" onchange="miniCqiSelectPlan(this.value)">${sorted.map(row=>`<option value="${miniCqiHtml(row.id)}" ${row.id===selected.id?'selected':''}>${miniCqiHtml(row.outing_date)} · ${miniCqiHtml(row.site)}</option>`).join('')}</select></label></div>${valid?`<div class="mini-cqi-presentation-actions no-print"><button type="button" class="btn btn-light" onclick="exportMiniCqiPlanChart()">ดาวน์โหลดกราฟ PNG</button><button type="button" class="btn btn-light" onclick="exportMiniCqiPlanTable()">ดาวน์โหลดตาราง CSV</button></div>${miniCqiForecastChart(selected,groups)}<div class="table-responsive"><table class="table simple-table mini-cqi-forecast-table"><caption>ประมาณการเลือดแดงแยกหมู่ ณ วันออกหน่วย (ถุง)</caption><thead><tr><th>หมู่เลือด</th><th>Stock ต้นวัน</th><th>คาดใช้ก่อนออกหน่วย</th><th>คาดเหลือ</th><th>Minimum</th><th>ส่วนต่าง</th><th>ผล</th></tr></thead><tbody>${abos.map(abo=>{const g=groups.find(x=>x.abo===abo)||{},gap=Number(g.projected)-Number(g.minimum);return `<tr><th>${abo}</th><td>${miniCqiHtml(g.stockStart)}</td><td>${miniCqiHtml(g.expectedUse)}</td><td><b>${miniCqiHtml(g.projected)}</b></td><td>${miniCqiHtml(g.minimum)}</td><td class="${gap<0?'mini-cqi-negative':''}">${gap>0?'+':''}${gap}</td><td>${gap<0?'ต่ำกว่า Minimum':'ไม่ต่ำกว่า Minimum'}</td></tr>`}).join('')}</tbody></table></div>`:'<p>ยังคำนวณครบทั้ง 4 หมู่ไม่ได้ กรุณาตรวจข้อมูลย้อนหลังและหลักฐานแผน</p>'}<small>เป็นผลคาดการณ์เพื่อประกอบแผน ไม่ใช่ Stock ปัจจุบัน · ตรวจความพร้อมทีมและสถานที่ตามขั้นตอนหน่วย</small></section>`;
}
function miniCqiForecastChart(plan,groups){
 const values=groups.flatMap(g=>[Number(g.projected),Number(g.minimum)]).filter(Number.isFinite);
 const maxNegative=Math.max(1,...values.filter(v=>v<0).map(v=>-v));
 const maxPositive=Math.max(1,...values.filter(v=>v>0));
 const pixelsPerBag=Math.min(280/maxNegative,285/maxPositive);
 const width=980,zero=535;
 const title=`คาดการณ์เลือดแดงก่อนออกหน่วย ${plan.outing_date} · ${String(plan.site||'').slice(0,28)}`;
 const rows=['A','B','O','AB'].map((abo,i)=>{
  const group=groups.find(g=>g.abo===abo)||{},minimum=Number(group.minimum),projected=Number(group.projected),y=100+i*72;
  const projectionWidth=Math.max(3,Math.abs(projected)*pixelsPerBag);
  const projectionX=projected<0?zero-projectionWidth:zero;
  const minimumWidth=Math.max(3,minimum*pixelsPerBag);
  const forecastColor=projected<minimum?'#d98a39':'#298eaa';
  const valueX=projected<0?projectionX-9:zero+projectionWidth+10;
  return `<text x="38" y="${y+18}" font-size="17" font-weight="700" fill="#25465d">หมู่ ${abo}</text><rect x="${projectionX}" y="${y}" width="${projectionWidth}" height="22" rx="5" fill="${forecastColor}"/><text x="${valueX}" y="${y+17}" ${projected<0?'text-anchor="end"':''} font-size="16" font-weight="700" fill="#2d4e62">${projected}</text><rect x="${zero}" y="${y+28}" width="${minimumWidth}" height="15" rx="4" fill="#889fb3"/><text x="${Math.min(910,zero+minimumWidth+10)}" y="${y+41}" font-size="14" fill="#4d6778">${minimum}</text>`;
 }).join('');
 const riskCount=groups.filter(g=>Number(g.projected)<Number(g.minimum)).length;
 return `<div class="mini-cqi-forecast-graphic"><svg id="miniCqiForecastSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 490" role="img" aria-label="กราฟเทียบคาดเหลือกับ Minimum แยกหมู่เลือด; แท่งสีส้มต่ำกว่า Minimum"><rect width="${width}" height="490" fill="#fff"/><text x="28" y="38" font-size="21" font-weight="700" fill="#25465d">${miniCqiHtml(title)}</text><rect x="35" y="54" width="16" height="12" fill="#298eaa"/><text x="59" y="65" font-size="14" fill="#34566a">สีฟ้า: คาดเหลือไม่ต่ำกว่า Minimum</text><rect x="320" y="54" width="16" height="12" fill="#d98a39"/><text x="344" y="65" font-size="14" fill="#34566a">สีส้ม: คาดเหลือต่ำกว่า Minimum</text><rect x="615" y="54" width="16" height="12" fill="#889fb3"/><text x="639" y="65" font-size="14" fill="#34566a">สีเทา: เกณฑ์ Minimum</text><line x1="${zero}" y1="84" x2="${zero}" y2="373" stroke="#a4b6c2" stroke-width="1" stroke-dasharray="4 4"/><text x="${zero+5}" y="91" font-size="12" fill="#567287">0</text>${rows}<text x="30" y="403" font-size="17" font-weight="700" fill="#9a562b">${riskCount?`ข้อสรุป: คาดว่าต่ำกว่า Minimum ${riskCount} หมู่ · ควรดำเนินตามแผน`:'ข้อสรุป: ไม่พบหมู่ต่ำกว่า Minimum · ทบทวนความจำเป็น'}</text><text x="30" y="433" font-size="14" fill="#546e81">ถุง · ผลคำนวณ ณ วันทราบแผน ${miniCqiHtml(String(plan.decision_at).slice(0,10))}</text><text x="30" y="460" font-size="13" fill="#546e81">คาดการณ์เพื่อประกอบแผน ไม่ใช่ Stock ปัจจุบัน · ตรวจความพร้อมทีมและสถานที่เพิ่มเติม</text></svg></div>`;
}
function exportMiniCqiPlanTable(){
 const plan=miniCqiResult?.outings.find(row=>row.id===miniCqiSelectedPlanId);if(!plan)return;
 const forecast=plan.forecast||{};const groups=forecast.groups||[];
 const rows=[['แผนออกหน่วย',plan.outing_date,'สถานที่',plan.site],['วันทราบแผน',plan.decision_at,'หลักฐาน',plan.evidence_ref],['สรุป',miniCqiPlanPassed(plan)?'ควรดำเนินตามแผน: พบหมู่เสี่ยง':forecast.canEvaluate?'ทบทวนความจำเป็น: ไม่พบหมู่เสี่ยง':'ข้อมูลไม่พอ'],[],['หมู่เลือด','Stock ต้นวัน','คาดใช้ก่อนออกหน่วย','คาดเหลือ','Minimum','ส่วนต่าง','ผล']];
 for(const abo of ['A','B','O','AB']){const g=groups.find(row=>row.abo===abo)||{},gap=Number(g.projected)-Number(g.minimum);rows.push([abo,g.stockStart,g.expectedUse,g.projected,g.minimum,Number.isFinite(gap)?gap:'',Number.isFinite(gap)?gap<0?'ต่ำกว่า Minimum':'ไม่ต่ำกว่า Minimum':'ข้อมูลไม่พอ'])}
 rows.push([],['ข้อจำกัด','LIS มีข้อมูลย้อนหลังระดับวัน ไม่ยืนยัน Stock ณ นาทีที่ทราบแผน; การแนบรูปภายหลังไม่เปลี่ยนเวลาบันทึกเดิม']);
 miniCqiDownloadCsv(rows,`plan-${plan.outing_date}-${plan.id.slice(0,8)}`);
}
function exportMiniCqiPlanChart(){
 const plan=miniCqiResult?.outings.find(row=>row.id===miniCqiSelectedPlanId),svg=document.getElementById('miniCqiForecastSvg');if(!svg||!plan)return showModal('error','ยังไม่มีกราฟ','เลือกแผนที่คำนวณได้ครบ 4 หมู่ก่อน');
 const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=1960;canvas.height=980;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1960,980);ctx.drawImage(img,0,0,1960,980);const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`CQI-KPI1-forecast-${plan.outing_date}-${plan.id.slice(0,8)}.png`;a.click()}finally{URL.revokeObjectURL(url)}};
 img.onerror=()=>{URL.revokeObjectURL(url);showModal('error','ส่งออกกราฟไม่สำเร็จ','ลองใหม่อีกครั้ง')};img.src=url;
}
function miniCqiSelectPlan(id){miniCqiSelectedPlanId=id;const box=document.getElementById('miniCqiPlanDecision');if(box)box.innerHTML=renderMiniCqiDecision(miniCqiResult?.outings||[])}
async function miniCqiViewEvidence(id){
 const row=miniCqiResult?.outings.find(x=>x.id===id);if(!row?.evidence_image_path)return;
 const tab=window.open('about:blank','_blank');
 try{const url=await MinimumStockBackend.getCqiEvidenceUrl(row.evidence_image_path);if(tab){tab.opener=null;tab.location.replace(url)}else showModal('info','เปิดรูปหลักฐาน','อนุญาตให้เปิดแท็บใหม่แล้วลองอีกครั้ง')}
 catch(err){tab?.close();showModal('error','เปิดรูปหลักฐานไม่ได้',err.message)}
}
