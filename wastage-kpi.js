/* CNMI Wastage KPI v2.9.108 — calculation uses existing eligible LIS bag rows. */
(function () {
  'use strict';
  const GROUPS = [
    {key:'RBC',label:'เม็ดเลือดแดง',en:'Red Cell',target:10},
    {key:'PLASMA',label:'พลาสมา',en:'Plasma',target:5},
    {key:'PLATELET',label:'เกล็ดเลือด',en:'Platelet',target:20},
    {key:'CRYO',label:'ไครโอพรีซิพิเตท',en:'Cryoprecipitate',target:5}
  ];
  const TH_MONTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const KEY = 'minimumStock.wastage.year';
  const state = { year:new Date().getFullYear(), month:new Date().getMonth()+1, rows:null, latest:null, actual:[], schemaReady:false, busy:false, request:0, maxDate:null, minDate:null };
  const fmt = (v) => Number(v || 0).toLocaleString('th-TH');
  const pct = (num,den) => den > 0 ? +(num*100/den).toFixed(2) : null;
  const html = (value) => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ymd = (v) => {
    const m = String(v ?? '').match(/^(\d{4})-(\d\d)-(\d\d)/);
    if (!m) return '';
    const y=+m[1],mo=+m[2],d=+m[3];
    return (y>=2000&&y<=2100&&mo>=1&&mo<=12&&d>=1&&d<=31) ? m[0] : '';
  };
  function group(product) {
    const s=String(product||'').toLowerCase().trim();
    if (s.includes('cryo-removed plasma')||s.includes('cryo removed plasma')) return 'PLASMA';
    if (s.includes('cryoprecipitate')||/(^|[^a-z])cryo([^a-z]|$)/.test(s)) return 'CRYO';
    if (s.includes('platelet')||/(^|[^a-z0-9])(sdp|ldppc|ppc)([^a-z0-9]|$)/.test(s)) return 'PLATELET';
    if (s.includes('fresh frozen plasma')||s.includes('frozen plasma')||s.includes('plasma')||/(^|[^a-z0-9])ffp([^a-z0-9]|$)/.test(s)) return 'PLASMA';
    if (s.includes('red cell')||s.includes('packed cell')||/(^|[^a-z0-9])(sdr|prc|lprc|ldprc|rbc)([^a-z0-9]|$)/.test(s)) return 'RBC';
    return null; // Whole Blood and other intermediates are not part of these four endpoints.
  }
  function outcome(row) {
    const s=String(row.status||'').trim(), code=String(row.outcomeCode||'').trim();
    if (s==='Released'||s==='Dedicated') return 'used';
    if (s==='Rejected') return 'rejected';
    if (s==='Expired') return 'expired';
    if (['Destroyed','Discarded','Disposed'].includes(s)) return 'other';
    if (s==='Be Transformed') return 'transformed';
    if (code==='used') return 'used';
    if (code==='rejected') return 'rejected';
    if (code==='expired') return 'expired';
    if (['destroyed','other_discard'].includes(code)) return 'other';
    if (code==='conflict') return 'conflict';
    return 'open';
  }
  const priority = {used:0,rejected:1,expired:2,other:3,conflict:4,transformed:5,open:6};
  function classifySource(src) {
    if (src=== 'กาชาดไทย') return 'trc';
    if (src==='หาเอง – รับบริจาคในโรงพยาบาล'||src==='หาเอง – ออกหน่วย') return 'internal';
    if (src==='รับจากโรงพยาบาลอื่น') return 'otherHospital';
    return 'unclassified';
  }
  // Families are grouped by parent Bag Number + category so an .S subunit cannot inflate counts.
  function familiesFromRows(rows) {
    const m=new Map(), issues={noArrival:0,conflict:0,missingExit:0,estimatedExpiry:0,unclassified:0};
    for(const row of rows||[]) {
      if (row.aggregateEligible===false) continue;
      const g=group(row.productType),base=String(row.bagNumber||'').trim().toUpperCase().replace(/\.S\d+$/i,'');
      if (!g || !base) continue;
      const key=base+'||'+g;
      if(!m.has(key)) m.set(key,{key,group:g,records:[]});
      m.get(key).records.push(row);
    }
    const result=[];
    for (const f of m.values()) {
      const arrivals=f.records.map(r=>ymd(r.dateStockIn)).filter(Boolean).sort();
      if(!arrivals.length) {issues.noArrival++;continue;}
      const sourceValues=[...new Set(f.records.map(r=>classifySource(r.sourceGroup)))];
      const source=sourceValues.length===1?sourceValues[0]:'unclassified';
      if(source==='unclassified')issues.unclassified++;
      const types=f.records.map(r=>({row:r,code:outcome(r)})).sort((a,b)=>priority[a.code]-priority[b.code]);
      const winningCode=types[0]?.code||'open';
      // The Released member wins over an Expired parent even if the parent had a .S split.
      const winningRows=types.filter(x=>x.code===winningCode);
      const dated=winningRows.map(x=>ymd(x.row.dateStockOut)).filter(Boolean).sort();
      let exit=dated[0]||'',estimated=false;
      if(winningCode==='expired'&&!exit) {
        const expires=winningRows.map(x=>ymd(x.row.expireDate)).filter(Boolean).sort();
        if(expires.length) {exit=expires[0];estimated=true;issues.estimatedExpiry++;}
      }
      if(['used','expired','rejected','other'].includes(winningCode)&&!exit)issues.missingExit++;
      if(winningCode==='conflict')issues.conflict++;
      const arrival=arrivals[0];
      if(exit&&exit<arrival){issues.conflict++;exit='';}
      result.push({key:f.key,group:f.group,source,arrival,exit,outcome:winningCode,estimated});
    }
    return {families:result,issues};
  }
  function sumMonth(families,year,month,actualValue=null,latestDate='',productFamily='',historyStart='') {
    const begin=`${year}-${String(month).padStart(2,'0')}-01`;
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    const obj={year,month,begin,end,beginning:0,internal:0,trc:0,otherHospital:0,unclassified:0,used:0,expired:0,rejected:0,otherDiscard:0,ending:0,unknownExit:0,estimatedExpiry:0,stale:0,discrepancy:null,actual:actualValue,covered:!!latestDate&&latestDate>=end&&(!historyStart||historyStart<begin),availability:0};
    for(const f of families) {
      if(f.arrival>end)continue;
      if(f.exit && f.exit<f.arrival)continue;
      const hasExit=!!f.exit;
      const aliveAtStart=f.arrival<begin && (!hasExit||f.exit>=begin);
      const aliveAtEnd=!hasExit||f.exit>end;
      if(aliveAtStart)obj.beginning++;
      if(f.arrival>=begin && f.arrival<=end)obj[f.source]++;
      if(hasExit&&f.exit>=begin&&f.exit<=end) {
        if(f.outcome==='used')obj.used++;
        else if(f.outcome==='expired')obj.expired++;
        else if(f.outcome==='rejected')obj.rejected++;
        else if(f.outcome==='other')obj.otherDiscard++;
        if(f.estimated&&f.outcome==='expired')obj.estimatedExpiry++;
      }
      if(aliveAtEnd)obj.ending++;
      if(!hasExit&&['used','expired','rejected','other'].includes(f.outcome))obj.unknownExit++;
      // 'Available' with an expiration date in the past needs LIS investigation, not an invented expiry event.
    }
    obj.availability=obj.beginning+obj.internal+obj.trc+obj.otherHospital+obj.unclassified;
    // The supplied table explicitly marked Internal + TRC + Ending as denominator.
    obj.kpiDenominator=(productFamily==='CRYO'?0:obj.internal)+obj.trc+obj.ending;
    obj.kpi=pct(obj.expired,obj.kpiDenominator);
    obj.utilization=pct(obj.used,obj.availability);
    // Independently recorded physical count is required to call a value a discrepancy.
    if(Number.isInteger(obj.actual)&&obj.actual>=0)obj.discrepancy=obj.actual-obj.ending;
    obj.checkBalance=obj.beginning+obj.internal+obj.trc+obj.otherHospital+obj.unclassified-obj.used-obj.expired-obj.rejected-obj.otherDiscard-obj.ending;
    // If dates are missing, do not present a month's result as validated.
    obj.provisional=(!obj.covered||obj.unknownExit>0||obj.estimatedExpiry>0||obj.checkBalance!==0);
    return obj;
  }
  function buildReport(rows,year,actual=[],latestDate='',historyStart='') {
    const assembled=familiesFromRows(rows);
    const out={year,issues:assembled.issues,months:{},familyCount:assembled.families.length};
    for(const g of GROUPS) {
      const members=assembled.families.filter(x=>x.group===g.key);
      out.months[g.key]=Array.from({length:12},(_,i)=>{
        const month=i+1, key=`${year}-${String(month).padStart(2,'0')}`;
        const found=actual.find(x=>x.monthStart===key+'-01'&&x.productFamily===g.key);
        return sumMonth(members,year,month,found?Number(found.actualEnding):null,latestDate,g.key,historyStart);
      });
    }
    return out;
  }
  const metricRows = [
    {key:'expired',name:'จำนวนที่หมดอายุ',hint:'ตัวตั้ง'},
    {key:'beginning',name:'คงคลังต้นเดือน (จาก LIS)',hint:'สนับสนุน'},
    {key:'internal',name:'ผลิตภายใน CNMI (ใน รพ. + ออกหน่วย)',hint:'ตัวหาร'},
    {key:'trc',name:'รับจากสภากาชาดไทย',hint:'ตัวหาร'},
    {key:'otherHospital',name:'รับจากโรงพยาบาลอื่น',hint:'ข้อมูลประกอบ'},
    {key:'used',name:'จ่ายใช้ / ส่งต่อ',hint:'สนับสนุน'},
    {key:'rejected',name:'Rejected / ไม่เหมาะสม',hint:'แยก ไม่ใช่ Expired'},
    {key:'otherDiscard',name:'ทำลายเหตุอื่น',hint:'แยก ไม่ใช่ Expired'},
    {key:'ending',name:'คงคลังปลายเดือน (จาก LIS)',hint:'ตัวหาร'},
    {key:'kpiDenominator',name:'ตัวหาร KPI ตามตาราง',hint:'ภายใน + กาชาด + ปลายเดือน'},
    {key:'kpi',name:'Wastage reduction (%)',hint:'KPI หลัก',percent:true},
    {key:'result',name:'ผลลัพธ์ตามเกณฑ์',hint:'ผ่าน / เกินเกณฑ์ / รอตรวจสอบ',isResult:true},
    {key:'utilization',name:'Utilization Rate (%)',hint:'KPI เสริม',percent:true},
    {key:'actual',name:'ตรวจนับปลายเดือนจริง',hint:'กรอกยืนยัน',nullable:true},
    {key:'discrepancy',name:'ผลต่างทางบัญชี (ตรวจนับ − LIS)',hint:'Check',nullable:true},
    {key:'checkBalance',name:'สมดุลรายการเคลื่อนไหว LIS',hint:'Check เชิงคำนวณ'}
  ];
  const scalar = (v,percent=false) => v===null||v===undefined?'—':percent?`${Number(v).toFixed(2)}%`:fmt(v);
  const canPublish = (row,threshold) => row.covered && !row.provisional && row.kpi!==null;
  function statusHtml(row,g){
    if(!row.covered) return '<span class="waste-status is-pending">ข้อมูล LIS ยังไม่ครบช่วง</span>';
    if(row.provisional)return '<span class="waste-status is-pending">ตรวจสอบข้อมูล</span>';
    if(row.kpi===null)return '<span class="waste-status is-pending">ไม่มีตัวหาร</span>';
    return row.kpi<=g.target?'<span class="waste-status is-good">ผ่านเกณฑ์</span>':'<span class="waste-status is-bad">เกินเกณฑ์</span>';
  }
  function selected() {
    try {const y=Number(sessionStorage.getItem(KEY));if(y>=2000&&y<=2100)state.year=y;}catch(e){}
  }
  function chooseYear(year){
    const y=Number(year);if(!Number.isInteger(y)||y<2000||y>2100)return;
    state.year=y;
    try{sessionStorage.setItem(KEY,String(y));}catch(e){}
    // Only load actual inventory for the selected year; LIS source rows are cached in memory.
    render(true);
  }
  function chooseMonth(month){const m=Number(month);if(m<1||m>12)return;state.month=m;render(false);}
  function snapshot(){return buildReport(state.rows||[],state.year,state.actual,state.latest?.source_end_date||'',state.minDate||'');}
  function exportReport() {
    if(!state.rows) return;
    if(!window.XLSX){window.showModal?.('error','ส่งออกไม่ได้','ไม่พบไลบรารี Excel');return;}
    const report=snapshot(),wb=XLSX.utils.book_new();
    const definition=[
      ['CNMI Blood Stock • KPI ลดความสูญเสียรายเดือน',`ปี พ.ศ. ${report.year+543}`],
      ['สถานะ','รายงานจาก LIS · ต้องตรวจสอบความครบถ้วนก่อนรับรอง KPI'],
      ['สูตร KPI ตามตาราง','Expired ÷ (Internal CNMI + TRC + Ending Inventory) × 100; Cryo ไม่มี Internal ในตัวหาร'],
      ['สูตร Utilization Rate','Used ÷ (Beginning + Internal + TRC + Other Hospital + Unclassified) × 100'],
      ['ผลต่างทางบัญชี','Stock ตรวจนับจริง − Stock ปลายเดือนตาม LIS (ห้ามตั้งเป็น 0 เมื่อไม่มีการตรวจนับ)'],
      ['ขอบเขต','นับ Bag family (ถุงหลัก + .S1/.S2) 1 ครั้งต่อกลุ่มผลิตภัณฑ์'],
      ['หมายเหตุ','Dedicated นับใช้, Rejected และทำลายเหตุอื่นไม่นับหมดอายุ, Transform เป็นขั้นตอนกลาง'],
      ['การจัดกลุ่ม','เม็ดเลือดแดง, พลาสมา, เกล็ดเลือด, Cryo; Whole Blood ไม่รวม'],
      ['ความครอบคลุม LIS',state.latest?.source_end_date||state.maxDate||'ยังไม่ยืนยัน'],
      ['รายการที่วันจ่ายหายไป',report.issues.missingExit],
      ['Expired ที่อนุมานจากวันหมดอายุ',report.issues.estimatedExpiry],
      ['ถุงที่ไม่มีวันรับเข้า',report.issues.noArrival],
      ['กลุ่มข้อมูลมีข้อขัดแย้ง',report.issues.conflict]
    ];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(definition),'คำอธิบาย');
    for(const g of GROUPS){
      const rows=report.months[g.key];
      const header=['รายการ','เกณฑ์ / บทบาท',...TH_MONTH.slice(1)];
      const body=metricRows.map(metric=>[metric.name,metric.hint,...rows.map(r=>metric.isResult ? (!r.covered?'LIS ไม่ครบช่วง':r.provisional?'รอตรวจสอบ':r.kpi===null?'ไม่มีตัวหาร':r.kpi<=g.target?'ผ่าน':'เกินเกณฑ์') : (r[metric.key]??null))]);
      const checks=['สถานะข้อมูล','',...rows.map(r=>!r.covered?'LIS ไม่ครบช่วง':r.provisional?'รอตรวจสอบ':r.kpi===null?'ไม่มีตัวหาร':r.kpi<=g.target?'ผ่าน':'เกินเกณฑ์')];
      const sheet=XLSX.utils.aoa_to_sheet([[`KPI ลดความสูญเสีย ${g.label} • เป้าหมาย ≤ ${g.target}%`],header,...body,checks]);
      sheet['!cols']=[{wch:43},{wch:29},...Array.from({length:12},()=>({wch:15}))];
      XLSX.utils.book_append_sheet(wb,sheet,g.en);
    }
    XLSX.writeFile(wb,`CNMI-Wastage-KPI-${state.year+543}-v2.9.108.xlsx`);
  }
  async function saveActual(g) {
    if(state.busy)return;
    if(!state.schemaReady){window.showModal?.('error','ยังไม่มีตารางตรวจนับ','กรุณารัน SQL-v2.9.108-MONTHLY-WASTAGE-CHECK.sql ใน Supabase ก่อน');return;}
    const access=window.MinimumStockAuthUI?.getCurrentAccess?.();
    if(access?.role!=='admin'||!access?.active){window.showModal?.('error','ไม่มีสิทธิ์บันทึก','เฉพาะ Admin บันทึกยอดตรวจนับจริงได้');return;}
    const input=document.getElementById('waste-actual-'+g);
    if(!input||!/^\d+$/.test(input.value.trim())||!Number.isSafeInteger(Number(input.value))) {
      input?.classList.add('is-invalid'); input?.focus();return;
    }
    const value=Number(input.value),date=`${state.year}-${String(state.month).padStart(2,'0')}-01`;
    state.busy=true;
    try {
      await MinimumStockBackend.saveWastageActualStock(date,g,value);
      const next=await MinimumStockBackend.getWastageActualStock(state.year);
      state.actual=next.rows; state.schemaReady=next.schemaReady;
      render(false);
      window.showModal?.('success','บันทึกแล้ว',`ยอดตรวจนับจริง ${fmt(value)} ยูนิต ถูกบันทึกไว้ใน Supabase`);
    } catch(e) { window.showModal?.('error','บันทึกไม่สำเร็จ',e.message); }
    finally{state.busy=false;}
  }
  function render(isYearChange=false){
    const box=document.getElementById('bloodKpiDashboard');if(!box||!state.rows||currentBloodKpiRoute!=='wastage')return;
    if(isYearChange){
      const current=++state.request;
      box.innerHTML='<div class="simple-panel">กำลังโหลดผลตรวจนับปีที่เลือก...</div>';
      MinimumStockBackend.getWastageActualStock(state.year).then(data=>{
        if(current!==state.request||currentBloodKpiRoute!=='wastage')return;
        state.actual=data.rows;state.schemaReady=data.schemaReady;render(false);
      }).catch(e=>{if(current===state.request){state.actual=[];state.schemaReady=false;render(false);}});
      return;
    }
    const report=snapshot(),minYear=Number((state.minDate||'').slice(0,4))||state.year,maxYear=Math.max(Number((state.maxDate||'').slice(0,4))||state.year,new Date().getFullYear());
    const years=Array.from({length:Math.max(1,maxYear-minYear+1)},(_,i)=>minYear+i).filter(y=>y>=2000&&y<=2100);
    const isAdmin=window.MinimumStockAuthUI?.getCurrentAccess?.()?.role==='admin';
    const sections=GROUPS.map(g=>{
      const months=report.months[g.key],at=months[state.month-1];
      const body=metricRows.map(metric=>`<tr class="${metric.key==='kpi'?'waste-main-row':metric.key==='discrepancy'?'waste-audit-row':''}">
        <th scope="row"><span>${html(metric.name)}</span><small>${html(metric.hint)}</small></th>
        ${months.map((r,i)=>`<td class="${i+1===state.month?'waste-selected':''}">${metric.isResult?(!r.covered?'LIS ไม่ครบ':r.provisional?'ตรวจสอบ':r.kpi===null?'ไม่มีตัวหาร':r.kpi<=g.target?'ผ่าน':'เกินเกณฑ์'):scalar(r[metric.key],metric.percent)}</td>`).join('')}</tr>`).join('');
      return `<section class="simple-panel waste-section" aria-label="KPI ${html(g.label)}">
        <div class="waste-section-head"><div><h3>${html(g.label)}</h3><span class="small-muted">${html(g.en)} · เป้าหมาย ≤ ${g.target}%</span></div><div class="waste-kpi-figure"><strong>${scalar(at.kpi,true)}</strong>${statusHtml(at,g)}</div></div>
        <div class="waste-table-scroll" tabindex="0" aria-label="ตารางสถิติรายเดือน ${html(g.label)}"><table class="waste-table"><thead><tr><th>รายการ (ยูนิต)</th>${months.map((r,i)=>`<th class="${i+1===state.month?'waste-selected':''}">${TH_MONTH[i+1]}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
        <div class="waste-bottom-row"><span>รายงานเดือน ${TH_MONTH[state.month]} ${state.year+543} · ใช้ ${fmt(at.used)} · หมดอายุ ${fmt(at.expired)} · ปลายเดือน LIS ${fmt(at.ending)}</span>
        <span>${!at.covered?'ต้องตรวจสอบข้อมูล LIS ต้นช่วงหรือปลายเดือนนี้':at.unknownExit?`พบ ${fmt(at.unknownExit)} family ที่ไม่มีวันจ่าย/ออก`:at.estimatedExpiry?`อนุมานวันหมดอายุ ${fmt(at.estimatedExpiry)} ถุง`:at.checkBalance!==0?'ยอดเคลื่อนไหวไม่สมดุล':'สมดุลรายการ LIS = 0 (ไม่ใช่ผลตรวจนับจริง)'}</span></div>
      </section>`;
    }).join('');
    const actualInputs=GROUPS.map(g=>{
      const at=report.months[g.key][state.month-1];
      return `<div class="waste-check-input"><label for="waste-actual-${g.key}">${html(g.label)} <small>ปลายเดือน LIS ${fmt(at.ending)}</small></label>
        <div class="waste-check-controls"><input id="waste-actual-${g.key}" type="number" min="0" max="99999999" step="1" placeholder="ตรวจนับจริง" value="${at.actual===null?'':at.actual}" ${!isAdmin||!state.schemaReady?'disabled':''} /><button type="button" class="btn btn-light" onclick="CNMIWastage.saveActual('${g.key}')" ${!isAdmin||!state.schemaReady?'disabled':''}>บันทึก</button></div>
        <small>ผลต่าง: ${scalar(at.discrepancy)} ยูนิต</small></div>`;
    }).join('');
    const warning=report.issues;
    box.innerHTML=`<div class="waste-dashboard">
      <div class="simple-page-head mt-2"><div><h1>ประสิทธิภาพการลดความสูญเสีย</h1><div class="page-subline">สถิติรายเดือน · 4 กลุ่มผลิตภัณฑ์ · นับ Bag family ไม่ซ้ำ</div></div>
        <div class="waste-actions no-print"><button class="btn btn-light" type="button" onclick="CNMIWastage.retry()">รีเฟรช LIS</button><button class="btn btn-light" type="button" onclick="CNMIWastage.exportExcel()">ส่งออก Excel</button><button class="btn btn-light" type="button" onclick="window.print()">พิมพ์ / PDF</button></div></div>
      <div class="simple-panel waste-toolbar no-print"><label>ปี พ.ศ. <select id="waste-year" class="form-select" onchange="CNMIWastage.chooseYear(this.value)">${years.map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y+543}</option>`).join('')}</select></label>
        <label>เลือกเดือนที่เน้น <select class="form-select" onchange="CNMIWastage.chooseMonth(this.value)">${TH_MONTH.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===state.month?'selected':''}>${m}</option>`).join('')}</select></label><span>ช่วงข้อมูล LIS ล่าสุดถึง: <strong>${html(state.latest?.source_end_date||'ไม่พบวันที่ครอบคลุมไฟล์')}</strong></span></div>
      <div class="waste-target-grid">${GROUPS.map(g=>{const at=report.months[g.key][state.month-1];return `<div class="waste-target-card"><span>${html(g.label)}</span><strong>${scalar(at.kpi,true)}</strong><div><small>เป้าหมาย ≤ ${g.target}%</small>${statusHtml(at,g)}</div></div>`;}).join('')}</div>
      ${(warning.missingExit||warning.noArrival||warning.conflict||warning.estimatedExpiry||warning.unclassified)?`<div class="waste-notice"><strong>คุณภาพข้อมูลที่ต้องทบทวน</strong><span>ไม่พบวันจ่าย/ออก ${fmt(warning.missingExit)} family · Expired อนุมานจากวันหมดอายุ ${fmt(warning.estimatedExpiry)} · ไม่มีวันรับเข้า ${fmt(warning.noArrival)} · ข้อมูลขัดแย้ง ${fmt(warning.conflict)} · แหล่งรับเข้าไม่ชัด ${fmt(warning.unclassified)}</span></div>`:''}
      <p class="waste-formula"><strong>สูตรตามตารางที่กำหนด:</strong> หมดอายุ ÷ (ผลิตภายใน CNMI + รับจาก TRC + คงคลังปลายเดือน) × 100 (Cryo: ใช้ TRC + ปลายเดือน) · อัตราใช้ประโยชน์ = จ่ายใช้ ÷ (คงคลังต้นเดือน + รับเข้าทุกแหล่ง) × 100</p>
      ${sections}
      <section class="simple-panel waste-real-inventory"><div class="panel-heading-row"><div><h3>ตรวจสอบผลต่างทางบัญชี · ${TH_MONTH[state.month]} ${state.year+543}</h3><div class="small-muted">ใช้ยอดตรวจนับจริงมาเทียบกับยอดคงคลังจาก LIS · ไม่มีผลตรวจนับจะแสดง “—” ไม่ใช่ศูนย์</div></div></div>
        ${state.schemaReady?`<div class="waste-check-grid">${actualInputs}</div>`:`<div class="waste-notice"><strong>ยังไม่ได้ติดตั้งตารางตรวจนับจริง</strong><span>รายงานจาก LIS ใช้งานได้ แต่หากต้องการบันทึกสต๊อกตรวจนับและคำนวณ Discrepancy ให้รัน SQL-v2.9.108-MONTHLY-WASTAGE-CHECK.sql ที่ Supabase หนึ่งครั้ง</span></div>`}
        ${state.schemaReady&&!isAdmin?'<p class="small-muted">อ่านข้อมูลได้ตามสิทธิ์ผู้ใช้ · การบันทึกยอดตรวจนับสำหรับ Admin เท่านั้น</p>':''}</section>
      <details class="simple-panel waste-method"><summary>นิยามและข้อจำกัดการตรวจสอบข้อมูล</summary><p>Expired เท่านั้นที่เป็นตัวตั้ง; Rejected และทำลายด้วยเหตุอื่นแยกต่างหาก; Dedicated นับเป็นจ่ายใช้; Be Transformed ไม่ใช่ผลลัพธ์ปลายทาง หากถุง .S ถูกใช้ จะไม่คิดถุงหลักที่หมดอายุซ้ำ</p><p>วันที่จ่าย/ออกใช้ DateStockOut ถ้า Expired ไม่มีวันที่ออก จะอนุมานวันที่จาก ExpireDate และเตือนให้ตรวจสอบ หากไม่มีวันที่ออกของสถานะอื่น จะไม่สร้างวันที่ขึ้นเอง</p><p>ยอดคงคลังต้น/ปลายเป็นยอดคำนวณย้อนหลังจาก LIS ไม่ใช่ผลตรวจนับจริง; ปริมาณรับจากโรงพยาบาลอื่นแยกแสดงเพื่อทวนสมดุล และไม่อยู่ในตัวหาร KPI ตามตารางต้นฉบับ</p><p>เดือนแรกของประวัติ LIS อาจมีเลือดคงคลังที่รับเข้าก่อนช่วงข้อมูล จึงยังไม่รับรองผลอัตโนมัติ เมื่อไม่มีประวัติ LIS ก่อนเดือนที่เลือกครบถ้วน หรือข้อมูลเดือนล่าสุดยังไม่ครบ ต้องตรวจสอบก่อนรับรอง KPI. การแสดง 0 หมายถึงนับได้ 0; เครื่องหมาย — หมายถึงยังไม่มีค่าหรือคำนวณไม่ได้</p></details>
    </div>`;
  }
  async function load() {
    const box=document.getElementById('bloodKpiDashboard');if(!box||currentBloodKpiRoute!=='wastage')return;
    const request=++state.request;
    if(!state.rows){
      box.innerHTML='<div class="simple-panel">กำลังโหลดประวัติ LIS เพื่อคำนวณสถิติรายเดือน...</div>';
      try {
        selected();
        const [bootstrap,latest]=await Promise.all([MinimumStockBackend.getOutreachFilterBootstrap(),MinimumStockBackend.getLatestLisUpload()]);
        if(request!==state.request||currentBloodKpiRoute!=='wastage')return;
        state.latest=latest;
        state.minDate=bootstrap?.sourceStartDate||bootstrap?.filterOptions?.minDate||null;
        state.maxDate=bootstrap?.sourceEndDate||bootstrap?.filterOptions?.maxDate||null;
        if(!state.minDate&&!state.maxDate){box.innerHTML='<div class="simple-panel">ไม่มีฐาน LIS กรุณาอัปโหลด LIS ก่อน</div>';return;}
        const rows=await MinimumStockBackend.getWastageSourceRows((count)=>{
          if(request===state.request&&currentBloodKpiRoute==='wastage'&&box?.isConnected)box.innerHTML=`<div class="simple-panel">กำลังอ่านประวัติ LIS ${fmt(count)} รายการ ...</div>`;
        });
        if(request!==state.request||currentBloodKpiRoute!=='wastage')return;
        state.rows=rows;
      }catch(err){if(request===state.request&&currentBloodKpiRoute==='wastage')box.innerHTML=`<div class="simple-panel"><h3>ไม่สามารถอ่านประวัติ LIS</h3><p>${html(err.message)}</p><button class="btn btn-light" onclick="CNMIWastage.retry()">ลองอีกครั้ง</button></div>`;return;}
    }
    render(true);
  }
  function retry(){state.rows=null;state.actual=[];load();}
  window.CNMIWastage={load,chooseYear,chooseMonth,exportExcel:exportReport,saveActual,retry,_test:{familiesFromRows,sumMonth,buildReport,group,outcome}};
})();
