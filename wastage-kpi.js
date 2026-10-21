/* CNMI Wastage KPI v2.9.114 — Historical month-start stock + fast cached monthly summary, fiscal/calendar year views. */
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
  const MODE_KEY = 'minimumStock.wastage.periodMode';
  const today = new Date();
  // In October the last COMPLETE fiscal year is usually the most useful report.
  const initialYear = today.getFullYear();
  const periodMonths = (year,fiscal) => Array.from({length:12},(_,i)=>
    new Date(Date.UTC(year-(fiscal?1:0),(fiscal?9:0)+i,1)).toISOString().slice(0,10));
  const monthLabel = begin => `${TH_MONTH[Number(begin.slice(5,7))]} ${Number(begin.slice(0,4))+543}`;
  const state = { year:initialYear, fiscal:true, month:1, summary:null, initialized:false, latest:null, actual:[], schemaReady:false, busy:false, request:0, maxDate:null, minDate:null };
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
      const expires=winningRows.map(x=>ymd(x.row.expireDate)).filter(Boolean).sort();
      const fallbackExpiry=f.records.map(x=>ymd(x.expireDate)).filter(Boolean).sort()[0]||'';
      const shelfExpiry=expires[0]||fallbackExpiry;
      let exit=dated[0]||'',estimated=false,terminalMissingExit=false;
      let eventOutcome=winningCode;
      if(winningCode==='expired'&&shelfExpiry&&(!exit||shelfExpiry<exit)) {
        exit=shelfExpiry;estimated=true;issues.estimatedExpiry++;
      } else if(['open','transformed'].includes(winningCode)&&shelfExpiry){
        // No final LIS action, but a past shelf-life date cannot remain Available forever.
        exit=shelfExpiry;estimated=true;eventOutcome='expired';issues.estimatedExpiry++;
      }
      if(['used','expired','rejected','other'].includes(winningCode)&&!exit){
        issues.missingExit++;terminalMissingExit=true;
      }
      if(winningCode==='conflict')issues.conflict++;
      if(winningCode==='used'&&dated[0]&&shelfExpiry&&dated[0]>shelfExpiry)issues.conflict++;
      const arrival=arrivals[0];
      if(exit&&exit<arrival){issues.conflict++;terminalMissingExit=true;}
      result.push({key:f.key,group:f.group,source,arrival,exit,outcome:eventOutcome,estimated,terminalMissingExit,shelfExpiry});
    }
    return {families:result,issues};
  }
  function sumMonth(families,year,month,actualValue=null,latestDate='',productFamily='',historyStart='') {
    const begin=`${year}-${String(month).padStart(2,'0')}-01`;
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    const obj={year,month,begin,end,beginning:0,internal:0,trc:0,otherHospital:0,unclassified:0,used:0,expired:0,rejected:0,otherDiscard:0,ending:0,unknownExit:0,estimatedExpiry:0,stale:0,discrepancy:null,actual:actualValue,covered:!!latestDate&&latestDate>=end&&(!historyStart||historyStart<begin),availability:0};
    for(const f of families) {
      if(f.arrival>end)continue;
      if(f.terminalMissingExit || (f.exit && f.exit<f.arrival) || (!f.exit && !f.shelfExpiry))continue;
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
    {key:'beginning',name:'คงคลัง ณ ต้นเดือน (จาก LIS)',hint:'ก่อน Action วันที่ 1'},
    {key:'internal',name:'ผลิตภายใน CNMI (ใน รพ. + ออกหน่วย)',hint:'ตัวหาร'},
    {key:'trc',name:'รับจากสภากาชาดไทย',hint:'ตัวหาร'},
    {key:'otherHospital',name:'รับจากโรงพยาบาลอื่น',hint:'ข้อมูลประกอบ'},
    {key:'used',name:'จ่ายใช้ / ส่งต่อ',hint:'สนับสนุน'},
    {key:'estimatedExpiry',name:'ใช้ ExpireDate อนุมานวันออก',hint:'ยังไม่ยืนยัน · ตรวจสอบ'},
    {key:'unknownExit',name:'รายการวันที่ไม่พอคำนวณ Stock',hint:'รอตรวจสอบ · ไม่รวม Stock'},
    {key:'rejected',name:'Rejected / ไม่เหมาะสม',hint:'แยก ไม่ใช่ Expired'},
    {key:'otherDiscard',name:'ทำลายเหตุอื่น',hint:'แยก ไม่ใช่ Expired'},
    {key:'ending',name:'คงคลัง ณ สิ้นเดือน (จาก LIS)',hint:'หลัง Action เดือนนั้น'},
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
    try {
      const y=Number(sessionStorage.getItem(KEY));if(y>=2000&&y<=2100)state.year=y;
      // Existing saved year is preserved. New reports default to fiscal years.
      state.fiscal=sessionStorage.getItem(MODE_KEY)!=='calendar';
    }catch(e){}
  }
  function chooseYear(year){
    const y=Number(year);if(!Number.isInteger(y)||y<2000||y>2100||y===state.year)return;
    state.year=y;
    try{sessionStorage.setItem(KEY,String(y));}catch(e){}
    loadYear();
  }
  function chooseMode(mode){
    const fiscal=mode!=='calendar';if(fiscal===state.fiscal)return;
    state.fiscal=fiscal;state.month=1;
    try{sessionStorage.setItem(MODE_KEY,fiscal?'fiscal':'calendar');}catch(e){}
    loadYear();
  }
  function chooseMonth(month){const m=Number(month);if(m<1||m>12)return;state.month=m;render();}

  // Supabase returns 48 aggregated rows (not tens of thousands of LIS records).
  // Calculated percentages use the same formulas as v2.9.108; actual stock is separate.
  function reportFromSummary(summary,year,actual=[],latestDate='',historyStart='',fiscal=true) {
    const first=summary?.[0]||{};
    const issues={
      noArrival:Number(first.issue_no_arrival||0),
      missingExit:Number(first.issue_missing_exit||0),
      conflict:Number(first.issue_conflict||0),
      estimatedExpiry:Number(first.issue_estimated_expiry||0),
      unclassified:Number(first.issue_unclassified||0)
    };
    const result={year,fiscal,issues,months:{},familyCount:Number(first.family_count||0)};
    const starts=periodMonths(year,fiscal);
    for(const g of GROUPS){
      result.months[g.key]=Array.from({length:12},(_,i)=>{
        const month=i+1, begin=starts[i];
        const end=new Date(Date.UTC(Number(begin.slice(0,4)),Number(begin.slice(5,7)),0)).toISOString().slice(0,10);
        const src=summary.find(r=>r.product_family===g.key&&Number(r.month_no)===month)||{};
        const found=actual.find(x=>x.monthStart===begin&&x.productFamily===g.key);
        const count=k=>Number(src[k]||0);
        const row={year,month,begin,end,
          beginning:count('beginning'),internal:count('internal'),trc:count('trc'),
          otherHospital:count('other_hospital'),unclassified:count('unclassified'),
          used:count('used'),expired:count('expired'),rejected:count('rejected'),
          otherDiscard:count('other_discard'),ending:count('ending'),
          unknownExit:count('unknown_exit'),estimatedExpiry:count('estimated_expiry'),
          actual:found?Number(found.actualEnding):null,
          covered:!!latestDate&&latestDate>=end&&(!historyStart||historyStart<begin)
        };
        row.availability=row.beginning+row.internal+row.trc+row.otherHospital+row.unclassified;
        row.kpiDenominator=(g.key==='CRYO'?0:row.internal)+row.trc+row.ending;
        row.kpi=pct(row.expired,row.kpiDenominator);
        row.utilization=pct(row.used,row.availability);
        row.discrepancy=Number.isInteger(row.actual)&&row.actual>=0?row.actual-row.ending:null;
        row.checkBalance=row.availability-row.used-row.expired-row.rejected-row.otherDiscard-row.ending;
        row.provisional=!row.covered||row.unknownExit>0||row.estimatedExpiry>0||row.checkBalance!==0||issues.missingExit>0||issues.conflict>0||issues.noArrival>0;
        return row;
      });
    }
    return result;
  }
  function cacheRefreshedAt(){return state.summary?.[0]?.refreshed_at || '';}
  function cacheIsStale(){
    const refreshed=Date.parse(cacheRefreshedAt()),uploaded=Date.parse(state.latest?.created_at||'');
    return Number.isFinite(refreshed)&&Number.isFinite(uploaded)&&uploaded>refreshed;
  }
  function cacheAgeLabel(){
    const at=cacheRefreshedAt();
    return at && !Number.isNaN(Date.parse(at)) ? new Date(at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}) : 'ไม่ทราบเวลา';
  }
  function snapshot(){
    const result=reportFromSummary(state.summary||[],state.year,state.actual,state.latest?.source_end_date||state.maxDate||'',state.minDate||'',state.fiscal);
    result.cacheStale=cacheIsStale();
    if(result.cacheStale)for(const g of GROUPS)for(const row of result.months[g.key])row.provisional=true;
    return result;
  }
  function annualSummary(rows,g) {
    const sum=key=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
    const out={};
    for(const metric of metricRows){
      if(['actual','discrepancy','kpi','utilization','result'].includes(metric.key))continue;
      out[metric.key]=sum(metric.key);
    }
    // Stock is a point-in-time balance, NOT a flow: do not sum the same bags 12 times.
    out.beginning=rows[0]?.beginning??0;
    out.ending=rows[rows.length-1]?.ending??0;
    out.unknownExit=rows[rows.length-1]?.unknownExit??0;
    out.estimatedExpiry=sum('estimatedExpiry'); // events during this fiscal year
    out.kpiDenominator=(g.key==='CRYO'?0:sum('internal'))+sum('trc')+out.ending;
    out.kpi=pct(sum('expired'),out.kpiDenominator);
    // Year-wide utilization: same opening inventory + receipt basis as a month, once per year.
    out.availability=out.beginning+sum('internal')+sum('trc')+sum('otherHospital')+sum('unclassified');
    out.utilization=pct(sum('used'),out.availability);
    out.checkBalance=out.availability-sum('used')-sum('expired')-sum('rejected')-sum('otherDiscard')-out.ending;
    out.actual=null;out.discrepancy=null;
    out.covered=rows.every(r=>r.covered);
    out.provisional=rows.some(r=>r.provisional)||out.checkBalance!==0;
    out.result=!out.covered?'LIS ไม่ครบ':out.provisional?'ตรวจสอบ':out.kpi===null?'ไม่มีตัวหาร':out.kpi<=g.target?'ผ่าน':'เกินเกณฑ์';
    return out;
  }
  function exportReport() {
    if(!state.summary) return;
    if(!window.XLSX){window.showModal?.('error','ส่งออกไม่ได้','ไม่พบไลบรารี Excel');return;}
    const report=snapshot(),wb=XLSX.utils.book_new();
    const definition=[
      ['CNMI Blood Stock • KPI ลดความสูญเสียรายเดือน',`${report.fiscal?'ปีงบประมาณ':'ปีปฏิทิน'} พ.ศ. ${report.year+543}`],
      ['สถานะ',report.cacheStale?'ข้อมูลสรุปยังไม่อัปเดตหลังการนำเข้า LIS ครั้งล่าสุด':'รายงานจาก LIS · ต้องตรวจสอบความครบถ้วนก่อนรับรอง KPI'],
      ['วันที่คำนวณสถิติ Cache',cacheAgeLabel()],
      ['อัปเดตหลังนำเข้า','รัน SQL-v2.9.114-03-REFRESH-FY2569.sql หรือ SQL-v2.9.112-03-REFRESH-OTHER-YEARS.sql ใน Supabase SQL Editor'],
      ['สูตร KPI ตามตาราง','Expired ÷ (Internal CNMI + TRC + Ending Inventory) × 100; Cryo ไม่มี Internal ในตัวหาร'],
      ['สูตร Utilization Rate รายเดือน','Used ÷ (Beginning + Internal + TRC + Other Hospital + Unclassified) × 100'],
      ['สูตร KPI รวมปี','Expired รวมปี ÷ (Internal รวมปี + TRC รวมปี + คงคลัง ณ สิ้นปี) × 100; Cryo ไม่รวม Internal'],
      ['สูตร Utilization Rate รวมปี','Used รวมปี ÷ (คงคลังต้นปี + รับเข้าตลอดปีทุกแหล่ง) × 100'],
      ['นิยามคงคลัง','ต้นเดือน = ถุงที่รับเข้าก่อนวันที่ 1 และยังไม่มี Action สิ้นสุดก่อนวันที่ 1; สิ้นเดือน = ยอดหลัง Action เดือนนั้น; แยกประมาณจากวันหมดอายุ'],
      ['หมายเหตุจำนวน Expired','มีส่วนที่อนุมานจาก ExpireDate เมื่อ LIS ไม่มี Action ชัดเจน; ทุกเดือนที่มีค่าประมาณต้องตรวจสอบก่อนรับรอง'],
      ['ผลต่างทางบัญชี','Stock ตรวจนับจริง − Stock ปลายเดือนตาม LIS (ห้ามตั้งเป็น 0 เมื่อไม่มีการตรวจนับ)'],
      ['ขอบเขต','นับ Bag family (ถุงหลัก + .S1/.S2) 1 ครั้งต่อกลุ่มผลิตภัณฑ์'],
      ['หมายเหตุ','Dedicated นับใช้, Rejected และทำลายเหตุอื่นไม่นับหมดอายุ, Transform เป็นขั้นตอนกลาง'],
      ['การจัดกลุ่ม','เม็ดเลือดแดง, พลาสมา, เกล็ดเลือด, Cryo; Whole Blood ไม่รวม'],
      ['ความครอบคลุม LIS',state.latest?.source_end_date||state.maxDate||'ยังไม่ยืนยัน'],
      ['ช่วงเดือนที่รายงาน',`${periodMonths(report.year,report.fiscal)[0]} ถึง ${periodMonths(report.year,report.fiscal)[11]}`],
      ['รายการที่วันจ่ายหายไป',report.issues.missingExit],
      ['Expired ที่อนุมานจากวันหมดอายุ',report.issues.estimatedExpiry],
      ['ถุงที่ไม่มีวันรับเข้า',report.issues.noArrival],
      ['กลุ่มข้อมูลมีข้อขัดแย้ง',report.issues.conflict]
    ];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(definition),'คำอธิบาย');
    for(const g of GROUPS){
      const rows=report.months[g.key];
      const annual=annualSummary(rows,g);
      const header=['รายการ','เกณฑ์ / บทบาท',...rows.map(r=>monthLabel(r.begin)),'รวมปี'];
      const body=metricRows.map(metric=>[metric.name,metric.hint,...rows.map(r=>metric.isResult ? (!r.covered?'LIS ไม่ครบช่วง':r.provisional?'รอตรวจสอบ':r.kpi===null?'ไม่มีตัวหาร':r.kpi<=g.target?'ผ่าน':'เกินเกณฑ์') : (r[metric.key]??null)),metric.isResult?annual.result:(annual[metric.key]??null)]);
      const checks=['สถานะข้อมูล','',...rows.map(r=>!r.covered?'LIS ไม่ครบช่วง':r.provisional?'รอตรวจสอบ':r.kpi===null?'ไม่มีตัวหาร':r.kpi<=g.target?'ผ่าน':'เกินเกณฑ์'),annual.result];
      const sheet=XLSX.utils.aoa_to_sheet([[`KPI ลดความสูญเสีย ${g.label} • เป้าหมาย ≤ ${g.target}%`],header,...body,checks]);
      sheet['!cols']=[{wch:43},{wch:29},...Array.from({length:12},()=>({wch:15})),{wch:16}];
      XLSX.utils.book_append_sheet(wb,sheet,g.en);
    }
    XLSX.writeFile(wb,`CNMI-Wastage-KPI-${state.fiscal?'FY':'CY'}${state.year+543}-v2.9.114.xlsx`);
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
    const value=Number(input.value),date=periodMonths(state.year,state.fiscal)[state.month-1];
    state.busy=true;
    try {
      await MinimumStockBackend.saveWastageActualStock(date,g,value);
      const next=await MinimumStockBackend.getWastageActualStock(state.year,state.fiscal);
      state.actual=next.rows; state.schemaReady=next.schemaReady;
      render();
      window.showModal?.('success','บันทึกแล้ว',`ยอดตรวจนับจริง ${fmt(value)} ยูนิต ถูกบันทึกไว้ใน Supabase`);
    } catch(e) { window.showModal?.('error','บันทึกไม่สำเร็จ',e.message); }
    finally{state.busy=false;}
  }
  function render(){
    const box=document.getElementById('bloodKpiDashboard');if(!box||!state.summary||currentBloodKpiRoute!=='wastage')return;
    const report=snapshot(),minYear=Number((state.minDate||'').slice(0,4))||state.year,maxYear=Math.max(Number((state.maxDate||'').slice(0,4))+(state.fiscal&&Number((state.maxDate||'').slice(5,7))>=10?1:0)||state.year,state.year,new Date().getFullYear());
    const years=Array.from({length:Math.max(1,maxYear-minYear+1)},(_,i)=>minYear+i).filter(y=>y>=2000&&y<=2100);
    const isAdmin=window.MinimumStockAuthUI?.getCurrentAccess?.()?.role==='admin';
    const sections=GROUPS.map(g=>{
      const months=report.months[g.key],at=months[state.month-1],annual=annualSummary(months,g);
      const body=metricRows.map(metric=>`<tr class="${metric.key==='kpi'?'waste-main-row':metric.key==='discrepancy'?'waste-audit-row':''}">
        <th scope="row"><span>${html(metric.name)}</span><small>${html(metric.hint)}</small></th>
        ${months.map((r,i)=>`<td class="${i+1===state.month?'waste-selected':''}">${metric.isResult?(!r.covered?'LIS ไม่ครบ':r.provisional?'ตรวจสอบ':r.kpi===null?'ไม่มีตัวหาร':r.kpi<=g.target?'ผ่าน':'เกินเกณฑ์'):scalar(r[metric.key],metric.percent)}</td>`).join('')}<td class="waste-annual">${metric.isResult?annual.result:scalar(annual[metric.key],metric.percent)}</td></tr>`).join('');
      return `<section class="simple-panel waste-section" aria-label="KPI ${html(g.label)}">
        <div class="waste-section-head"><div><h3>${html(g.label)}</h3><span class="small-muted">${html(g.en)} · เป้าหมาย ≤ ${g.target}%</span></div><div class="waste-kpi-figure"><strong>${scalar(at.kpi,true)}</strong>${statusHtml(at,g)}</div></div>
        <div class="waste-table-scroll" tabindex="0" aria-label="ตารางสถิติรายเดือน ${html(g.label)}"><table class="waste-table"><thead><tr><th>รายการ (ยูนิต)</th>${months.map((r,i)=>`<th class="${i+1===state.month?'waste-selected':''}">${monthLabel(r.begin)}</th>`).join('')}<th class="waste-annual">รวมปี</th></tr></thead><tbody>${body}</tbody></table></div>
        <div class="waste-bottom-row"><span>รายงานเดือน ${monthLabel(at.begin)} · ใช้ ${fmt(at.used)} · หมดอายุ ${fmt(at.expired)} · ปลายเดือน LIS ${fmt(at.ending)}</span>
        <span>${!at.covered?'ต้องตรวจสอบข้อมูล LIS ต้นช่วงหรือปลายเดือนนี้':at.unknownExit?`พบ ${fmt(at.unknownExit)} family ที่ไม่มีวันจ่าย/ออก`:at.estimatedExpiry?`อนุมานวันที่จาก ExpireDate ${fmt(at.estimatedExpiry)} ถุง · ตรวจสอบก่อนรับรอง`:at.checkBalance!==0?'ยอดเคลื่อนไหวไม่สมดุล':'สมดุลรายการ LIS = 0 (ไม่ใช่ผลตรวจนับจริง)'}</span></div>
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
        <div class="waste-actions no-print"><button class="btn btn-light" type="button" onclick="CNMIWastage.retry()">อ่านสรุปล่าสุด</button><button class="btn btn-light" type="button" onclick="CNMIWastage.exportExcel()">ส่งออก Excel</button><button class="btn btn-light" type="button" onclick="window.print()">พิมพ์ / PDF</button></div></div>
      <div class="simple-panel waste-toolbar no-print"><label>รูปแบบปี <select class="form-select" onchange="CNMIWastage.chooseMode(this.value)"><option value="fiscal" ${state.fiscal?'selected':''}>ปีงบประมาณ (ต.ค.–ก.ย.)</option><option value="calendar" ${!state.fiscal?'selected':''}>ปีปฏิทิน (ม.ค.–ธ.ค.)</option></select></label>
        <label>${state.fiscal?'ปีงบประมาณ':'ปีปฏิทิน'} พ.ศ. <select id="waste-year" class="form-select" onchange="CNMIWastage.chooseYear(this.value)">${years.map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y+543}</option>`).join('')}</select></label>
        <label>เลือกเดือนที่เน้น <select class="form-select" onchange="CNMIWastage.chooseMonth(this.value)">${report.months.RBC.map((r,i)=>`<option value="${i+1}" ${i+1===state.month?'selected':''}>${monthLabel(r.begin)}</option>`).join('')}</select></label><span>ช่วงข้อมูล LIS ล่าสุดถึง: <strong>${html(state.latest?.source_end_date||state.maxDate||'ไม่พบวันที่ครอบคลุมไฟล์')}</strong></span></div>
      <div class="waste-notice"><strong>ข้อมูลสรุปคำนวณล่าสุด: ${html(cacheAgeLabel())}</strong><span>หน้านี้อ่านผลรวมที่เก็บไว้ จึงไม่ต้องคำนวณประวัติหลายปีทุกครั้ง หากอัปโหลด LIS ใหม่ ให้รัน SQL รีเฟรชปีที่เกี่ยวข้องบน Supabase เพื่ออัปเดตตัวเลข</span></div>
      ${report.cacheStale?`<div class="waste-notice waste-cache-stale"><strong>ข้อมูลสรุปยังไม่รวม LIS ที่อัปโหลดล่าสุด</strong><span>โปรดรีเฟรช Cache ใน Supabase SQL Editor ก่อนนำรายงานไปใช้ ผู้ใช้ทั่วไปไม่สามารถกดคำนวณหนักจากหน้าเว็บได้</span></div>`:''}
      <div class="waste-target-grid">${GROUPS.map(g=>{const at=report.months[g.key][state.month-1];return `<div class="waste-target-card"><span>${html(g.label)}</span><strong>${scalar(at.kpi,true)}</strong><div><small>เป้าหมาย ≤ ${g.target}%</small>${statusHtml(at,g)}</div></div>`;}).join('')}</div>
      ${(warning.missingExit||warning.noArrival||warning.conflict||warning.estimatedExpiry||warning.unclassified)?`<div class="waste-notice"><strong>คุณภาพข้อมูลที่ต้องทบทวน</strong><span>ไม่พบวันจ่าย/ออก ${fmt(warning.missingExit)} family · ประมาณวันออก/หมดอายุจาก ExpireDate ${fmt(warning.estimatedExpiry)} · ไม่มีวันรับเข้า ${fmt(warning.noArrival)} · ข้อมูลขัดแย้ง ${fmt(warning.conflict)} · แหล่งรับเข้าไม่ชัด ${fmt(warning.unclassified)}</span></div>`:''}
      <p class="waste-formula"><strong>สูตร KPI:</strong> หมดอายุ ÷ (ผลิตภายใน CNMI + รับจาก TRC + คงคลังปลายเดือน) × 100 (Cryo: ใช้ TRC + ปลายเดือน) · Utilization รายเดือน = จ่ายใช้ ÷ (คงคลังต้นเดือน + รับเข้าทุกแหล่ง) × 100 · รวมปี = หมดอายุทั้งปี ÷ (ผลิตใน CNMI ทั้งปี + TRC ทั้งปี + คงคลังสิ้นปี) · คงคลังต้น/ปลายปีไม่นำ 12 เดือนมาบวกกัน</p>
      ${sections}
      <section class="simple-panel waste-real-inventory"><div class="panel-heading-row"><div><h3>ตรวจสอบผลต่างทางบัญชี · ${monthLabel(report.months.RBC[state.month-1].begin)}</h3><div class="small-muted">ใช้ยอดตรวจนับจริงมาเทียบกับยอดคงคลังจาก LIS · ไม่มีผลตรวจนับจะแสดง “—” ไม่ใช่ศูนย์</div></div></div>
        ${state.schemaReady?`<div class="waste-check-grid">${actualInputs}</div>`:`<div class="waste-notice"><strong>ยังไม่ได้ติดตั้งตารางตรวจนับจริง</strong><span>รายงานจาก LIS ใช้งานได้ แต่หากต้องการบันทึกสต๊อกตรวจนับและคำนวณ Discrepancy ให้รัน SQL-v2.9.108-MONTHLY-WASTAGE-CHECK.sql ที่ Supabase หนึ่งครั้ง</span></div>`}
        ${state.schemaReady&&!isAdmin?'<p class="small-muted">อ่านข้อมูลได้ตามสิทธิ์ผู้ใช้ · การบันทึกยอดตรวจนับสำหรับ Admin เท่านั้น</p>':''}</section>
      <details class="simple-panel waste-method"><summary>นิยามและข้อจำกัดการตรวจสอบข้อมูล</summary><p>Expired เท่านั้นที่เป็นตัวตั้ง; Rejected และทำลายด้วยเหตุอื่นแยกต่างหาก; Dedicated นับเป็นจ่ายใช้; Be Transformed ไม่ใช่ผลลัพธ์ปลายทาง หากถุง .S ถูกใช้ จะไม่คิดถุงหลักที่หมดอายุซ้ำ</p><p>คงคลังต้นเดือนนับก่อน Action ของวันที่ 1; DateStockIn คือวันรับเข้าจริง และ DateStockOut คือวันจ่าย/Action จริง ถ้า LIS ยังแสดง Available/Be Transformed แต่พ้น ExpireDate จะไม่ค้างเป็น Stock ตลอดไป: อนุมานวันสิ้นสุดตาม ExpireDate และแสดงรอตรวจสอบ ไม่ใช่ Expired ที่ยืนยันแล้ว; รายการออกจริงแต่ไม่มีวันที่ออกต้องตรวจสอบ</p><p>ยอดคงคลังต้น/ปลายเป็นยอดคำนวณย้อนหลังจาก LIS ไม่ใช่ผลตรวจนับจริง; ช่องรวมปีสำหรับคงคลังแสดงยอดต้นปีและสิ้นปี (ไม่ใช่ผลบวก 12 เดือน); ปริมาณรับจากโรงพยาบาลอื่นแยกแสดงเพื่อทวนสมดุล และไม่อยู่ในตัวหาร KPI ตามตารางต้นฉบับ</p><p>เดือนแรกของประวัติ LIS อาจมีเลือดคงคลังที่รับเข้าก่อนช่วงข้อมูล จึงยังไม่รับรองผลอัตโนมัติ เมื่อไม่มีประวัติ LIS ก่อนเดือนที่เลือกครบถ้วน หรือข้อมูลเดือนล่าสุดยังไม่ครบ ต้องตรวจสอบก่อนรับรอง KPI. การอนุมาน ExpireDate เป็นเพียงข้อเสนอแก้ความคลาดเคลื่อน ไม่รับรองว่า Status จริงเป็น Expired; การแสดง 0 หมายถึงนับได้ 0; เครื่องหมาย — หมายถึงยังไม่มีค่าหรือคำนวณไม่ได้</p></details>
    </div>`;
  }
  async function loadYear(){
    const box=document.getElementById('bloodKpiDashboard');
    if(!box||currentBloodKpiRoute!=='wastage')return;
    const request=++state.request;
    state.summary=null;
    box.innerHTML=`<div class="simple-panel">กำลังอ่านสรุป KPI ${state.fiscal?'ปีงบประมาณ':'ปีปฏิทิน'} ${state.year+543} จาก Cache ใน Supabase...</div>`;
    try {
      const [summary,actual]=await Promise.all([
        MinimumStockBackend.getWastageMonthlySummary(state.year,state.fiscal),
        MinimumStockBackend.getWastageActualStock(state.year,state.fiscal)
      ]);
      if(request!==state.request||currentBloodKpiRoute!=='wastage'||!box.isConnected)return;
      if(!Array.isArray(summary)||summary.length!==48)throw new Error(`ยังไม่มีสรุป KPI ปี${state.fiscal?'งบประมาณ':'ปฏิทิน'} ${state.year+543} ใน Cache หรือไม่มีสิทธิ์อ่านข้อมูล: กรุณารัน SQL รีเฟรชปีนี้บน Supabase SQL Editor (ใช้ปี ค.ศ. ${state.year})`);
      state.summary=summary;state.actual=actual.rows;state.schemaReady=actual.schemaReady;
      render();
    }catch(err){
      if(request!==state.request||currentBloodKpiRoute!=='wastage')return;
      box.innerHTML=`<div class="simple-panel"><h3>ยังไม่สามารถแสดง KPI ได้</h3><p>${html(err.message)}</p><button class="btn btn-light" onclick="CNMIWastage.retry()">ลองอีกครั้ง</button></div>`;
    }
  }
  async function load() {
    const box=document.getElementById('bloodKpiDashboard');if(!box||currentBloodKpiRoute!=='wastage')return;
    if(state.summary){render();return;}
    const request=++state.request;
    box.innerHTML='<div class="simple-panel">กำลังตรวจสอบช่วงข้อมูล LIS...</div>';
    try {
      if(!state.initialized){selected();state.initialized=true;}
      if(!state.minDate&&!state.maxDate){
        const bootstrap=await MinimumStockBackend.getOutreachFilterBootstrap();
        if(request!==state.request||currentBloodKpiRoute!=='wastage')return;
        state.latest=bootstrap?.latestUpload||await MinimumStockBackend.getLatestLisUpload();
        state.minDate=bootstrap?.sourceStartDate||bootstrap?.filterOptions?.minDate||null;
        state.maxDate=bootstrap?.sourceEndDate||bootstrap?.filterOptions?.maxDate||null;
        if(!state.minDate&&!state.maxDate){box.innerHTML='<div class="simple-panel">ไม่มีฐาน LIS กรุณาอัปโหลด LIS ก่อน</div>';return;}
      }
      if(request!==state.request||currentBloodKpiRoute!=='wastage')return;
      await loadYear();
    }catch(err){
      if(request===state.request&&currentBloodKpiRoute==='wastage')
        box.innerHTML=`<div class="simple-panel"><h3>ไม่สามารถอ่านข้อมูล LIS</h3><p>${html(err.message)}</p><button class="btn btn-light" onclick="CNMIWastage.retry()">ลองอีกครั้ง</button></div>`;
    }
  }
  function retry(){state.summary=null;state.actual=[];state.minDate=null;state.maxDate=null;load();}
  window.CNMIWastage={load,chooseYear,chooseMode,chooseMonth,exportExcel:exportReport,saveActual,retry,_test:{familiesFromRows,sumMonth,buildReport,reportFromSummary,annualSummary,periodMonths,group,outcome}};
})();
