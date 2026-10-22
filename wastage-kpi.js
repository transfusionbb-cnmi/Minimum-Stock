/* CNMI Wastage KPI v2.9.119 — status-confirmed expired parent only; family-level one-unit outcome; product filter. */
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
  const MODE_KEY = 'minimumStock.wastage.periodMode.v29116'; // Reset the older saved calendar view once.
  const today = new Date();
  // In October the last COMPLETE fiscal year is usually the most useful report.
  const initialYear = today.getFullYear();
  const periodMonths = (year,fiscal) => Array.from({length:12},(_,i)=>
    new Date(Date.UTC(year-(fiscal?1:0),(fiscal?9:0)+i,1)).toISOString().slice(0,10));
  const monthLabel = begin => `${TH_MONTH[Number(begin.slice(5,7))]} ${Number(begin.slice(0,4))+543}`;
  const state = { year:initialYear, fiscal:true, month:1, visibleGroup:'ALL', summary:null, initialized:false, latest:null, actual:[], schemaReady:false, busy:false, request:0, maxDate:null, minDate:null };
  const fmt = (v) => Number(v || 0).toLocaleString('th-TH');
  const pct = (num,den) => den > 0 ? +(num*100/den).toFixed(2) : null;
  const html = (value) => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ymd = (v) => {
    const m = String(v ?? '').match(/^(\d{4})-(\d\d)-(\d\d)/);
    if (!m) return '';
    const y=+m[1],mo=+m[2],d=+m[3];
    return (y>=2000&&y<=2100&&mo>=1&&mo<=12&&d>=1&&d<=31) ? m[0] : '';
  };
  // LDPC is NOT LDPPC. Match the whole normalized product name or exact code only.
  // This rule applies to the RECEIPT counter, not to used/expired outcomes.
  function isLdpcReceipt(product) {
    const normalized = String(product || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    return normalized === 'ldpc' || normalized === 'leukocyte depleted platelet concentrate';
  }
  // Only these FOUR exact LIS product names represent CNMI self-produced
  // platelet receipts. Avoid substring matching: LDPC must not become LDPPC.
  const CNMI_SELF_MADE_PLATELETS = new Set([
    'leukocyte depleted pooled platelet concentrate',
    'single donor platelet',
    'irradiated leukocyte depleted pooled platelet concentrate',
    'irradiated single donor platelet'
  ]);
  function normalizeExactProduct(value) {
    return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function isSelfMadePlateletReceipt(product) {
    return CNMI_SELF_MADE_PLATELETS.has(normalizeExactProduct(product));
  }
  function eligibleReceiptRows(family,source) {
    if (family.group==='PLATELET' && source==='internal') {
      // This restricts INTERNAL PRODUCTION, not Released/Expired outcomes.
      return family.records.filter(r=>isSelfMadePlateletReceipt(r.productType));
    }
    // LDPC must never be included in receipt totals as a generic platelet.
    return family.records.filter(r=>!isLdpcReceipt(r.productType));
  }
  function receiptIsEligibleForFamily(family,source) {
    return eligibleReceiptRows(family,source).length>0;
  }
  function stockRequiresVerification(groupKey,row) {
    // SQL Cache cannot be reconstructed or 'fixed' on the client. New optional
    // explicit attestations may only be returned AFTER SQL/LIS audit is complete.
    if (groupKey==='PLATELET') return row.plateletSelfMadeVerified!==true || row.stockLedgerVerified!==true;
    if (groupKey==='CRYO') return row.stockLedgerVerified!==true;
    return false;
  }
  function group(product) {
    const s=String(product||'').toLowerCase().trim();
    if(normalizeExactProduct(product)==='fresh frozen plasma female')return null; // excluded from every FFP/Plasma KPI
    if (s.includes('cryo-removed plasma')||s.includes('cryo removed plasma')) return 'PLASMA';
    if (s.includes('cryoprecipitate')||/(^|[^a-z])cryo([^a-z]|$)/.test(s)) return 'CRYO';
    if (s.includes('platelet')||/(^|[^a-z0-9])(sdp|ldpc|ldppc|ppc)([^a-z0-9]|$)/.test(s)) return 'PLATELET';
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
  // Lightweight JS parity helper for synthetic tests / fallback. The live web reads
  // the authoritative monthly Supabase cache, rebuilt with the installed Supabase SQL Cache.
  function familiesFromRows(rows) {
    const m=new Map(), issues={noArrival:0,conflict:0,missingExit:0,estimatedExpiry:0,unclassified:0};
    for(const row of rows||[]) {
      if(row.aggregateEligible===false) continue;
      const g=group(row.productType);
      const id=String(row.bagNumber||'').trim().toUpperCase();
      const base=id.replace(/\.(?:S|U)\.?\d+$/i,'');
      if(!g||!base)continue;
      const key=base+'||'+g;
      if(!m.has(key))m.set(key,{key,group:g,records:[]});
      m.get(key).records.push({...row,_parent:id===base});
    }
    const results=[];
    for(const f of m.values()) {
      const arrivals=f.records.map(r=>ymd(r.dateStockIn)).filter(Boolean).sort();
      if(!arrivals.length){issues.noArrival++;continue;}
      const sourceValues=[...new Set(f.records.map(r=>classifySource(r.sourceGroup)))];
      const source=sourceValues.length===1?sourceValues[0]:'unclassified';
      if(source==='unclassified')issues.unclassified++;
      const selectRows=pred=>f.records.filter(pred);
      const dateMin=(rs,field)=>rs.map(r=>ymd(r[field])).filter(Boolean).sort()[0]||'';
      const dateMax=(rs,field)=>rs.map(r=>ymd(r[field])).filter(Boolean).sort().slice(-1)[0]||'';
      const used=selectRows(r=>outcome(r)==='used');
      const parentsExpired=selectRows(r=>r._parent&&String(r.status||'').trim().toUpperCase()==='EXPIRED');
      const rejected=selectRows(r=>outcome(r)==='rejected');
      const discarded=selectRows(r=>outcome(r)==='other');
      const childrenExpired=selectRows(r=>!r._parent&&String(r.status||'').trim().toUpperCase()==='EXPIRED');
      let outcomeCode='stockOnly',relevant=[];
      if(used.length){outcomeCode='used';relevant=used;}
      else if(parentsExpired.length){outcomeCode='expired';relevant=parentsExpired;}
      else if(rejected.length){outcomeCode='rejected';relevant=rejected;}
      else if(discarded.length){outcomeCode='other';relevant=discarded;}
      else if(childrenExpired.length){relevant=childrenExpired;}
      const shelfExpiry=dateMin(f.records,'expireDate');
      let exit=outcomeCode==='stockOnly'&&childrenExpired.length
        ? dateMax(relevant,'dateStockOut')
        : dateMin(relevant,'dateStockOut');
      const estimated=outcomeCode==='stockOnly';
      if(!exit) exit=outcomeCode==='expired'?dateMin(parentsExpired,'expireDate'):(estimated?shelfExpiry:'');
      if(outcomeCode==='expired'&&!dateMin(parentsExpired,'dateStockOut')&&exit)issues.estimatedExpiry++;
      if(estimated&&exit)issues.estimatedExpiry++;
      const terminalMissingExit=!exit;
      if(terminalMissingExit)issues.missingExit++;
      if(exit&&exit<arrivals[0])issues.conflict++;
      const eligibleReceipts=eligibleReceiptRows(f,source);
      const receiptArrival=dateMin(eligibleReceipts,'dateStockIn');
      results.push({key:f.key,group:f.group,source,arrival:arrivals[0],receiptArrival,exit,
        receiptEligible: !!receiptArrival,
        outcome:outcomeCode,estimated,terminalMissingExit,shelfExpiry});
    }
    return {families:results,issues};
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
      const receiptDate=f.receiptArrival===undefined?f.arrival:f.receiptArrival;
      if(receiptDate>=begin && receiptDate<=end && f.receiptEligible!==false)obj[f.source]++;
      if(hasExit&&f.exit>=begin&&f.exit<=end) {
        if(f.outcome==='used')obj.used++;
        else if(f.outcome==='expired')obj.expired++;
        else if(f.outcome==='rejected')obj.rejected++;
        else if(f.outcome==='other')obj.otherDiscard++;
        if(f.outcome==='stockOnly')obj.estimatedExpiry++;
      }
      if(aliveAtEnd)obj.ending++;
      if(!hasExit&&['used','expired','rejected','other'].includes(f.outcome))obj.unknownExit++;
      // 'Available' with an expiration date in the past needs LIS investigation, not an invented expiry event.
    }
    obj.plateletSelfMadeVerified=false;obj.stockLedgerVerified=false;
    obj.availability=obj.beginning+obj.internal+obj.trc+obj.otherHospital+obj.unclassified;
    // The supplied table explicitly marked Internal + TRC + Ending as denominator.
    obj.kpiDenominator=(productFamily==='CRYO'?0:obj.internal)+obj.trc+obj.ending;
    obj.kpi=pct(obj.expired,obj.kpiDenominator);
    obj.utilization=pct(obj.used,obj.availability);
    // Independently recorded physical count is required to call a value a discrepancy.
    if(Number.isInteger(obj.actual)&&obj.actual>=0)obj.discrepancy=obj.actual-obj.ending;
    obj.checkBalance=obj.beginning+obj.internal+obj.trc+obj.otherHospital+obj.unclassified-obj.used-obj.expired-obj.rejected-obj.otherDiscard-obj.estimatedExpiry-obj.ending;
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
    {key:'beginning',name:'คงคลังต้นเดือน (ประมาณการ LIS)',hint:'ไม่ใช่ยอดตรวจนับจริง'},
    {key:'internal',name:'ผลิตภายใน CNMI (ใน รพ. + ออกหน่วย)',hint:'ตัวหาร'},
    {key:'trc',name:'รับจากสภากาชาดไทย',hint:'ตัวหาร'},
    {key:'otherHospital',name:'รับจากโรงพยาบาลอื่น',hint:'ข้อมูลประกอบ'},
    {key:'used',name:'จ่ายใช้ / ส่งต่อ',hint:'สนับสนุน'},
    {key:'estimatedExpiry',name:'ปรับคงคลังตาม ExpireDate / ถุงแบ่ง (ไม่นับ Expired KPI)',hint:'ปรับ Stock เท่านั้น'},
    {key:'unknownExit',name:'รายการวันที่ไม่ครบ',hint:'รายละเอียด LIS · ไม่รวม Stock'},
    {key:'rejected',name:'Rejected / ไม่เหมาะสม',hint:'แยก ไม่ใช่ Expired'},
    {key:'otherDiscard',name:'ทำลายเหตุอื่น',hint:'แยก ไม่ใช่ Expired'},
    {key:'ending',name:'คงคลังสิ้นเดือน (ประมาณการ LIS)',hint:'ต้องเทียบตรวจนับจริง'},
    {key:'kpiDenominator',name:'ตัวหาร KPI ตามตาราง',hint:'ภายใน + กาชาด + ปลายเดือน'},
    {key:'kpi',name:'Wastage reduction (%)',hint:'KPI หลัก',percent:true},
    {key:'result',name:'ผลการประเมิน',hint:'เทียบเป้าหมาย KPI',isResult:true},
    {key:'utilization',name:'Utilization Rate (%)',hint:'KPI เสริม',percent:true},
    {key:'actual',name:'ยอดตรวจนับปลายเดือน',hint:'ถ้ามีการบันทึกแยก',nullable:true},
    {key:'discrepancy',name:'ผลต่างทางบัญชี (ตรวจนับ − LIS)',hint:'Check',nullable:true},
    {key:'checkBalance',name:'สมดุลรายการเคลื่อนไหว LIS',hint:'Check เชิงคำนวณ'}
  ];
  const mainMetricKeys = ['kpi','expired','beginning','internal','trc','used','ending','utilization','result'];
  const mainMetricRows = mainMetricKeys.map(key=>metricRows.find(r=>r.key===key));
  const detailMetricRows = metricRows.filter(m=>!mainMetricKeys.includes(m.key));
  const scalar = (v,percent=false) => v===null||v===undefined?'—':percent?`${Number(v).toFixed(2)}%`:fmt(v);
  // Reporting status is determined by the KPI value and its target. Secondary LIS audit
  // counters do NOT automatically turn a computable KPI into "ตรวจสอบข้อมูล".
  function resultLabel(row,g){
    if(!row.covered)return '—';
    if(row.kpi===null || !Number.isFinite(row.kpi))return '—';
    if(stockRequiresVerification(g.key,row))return 'รอตรวจสอบ';
    return row.kpi<=g.target?'ผ่านเกณฑ์':'ไม่ผ่านเกณฑ์';
  }
  function resultClass(row,g){
    const label=resultLabel(row,g);
    return label==='ผ่านเกณฑ์'?'waste-result-good':label==='ไม่ผ่านเกณฑ์'?'waste-result-bad':'';
  }
  function statusHtml(row,g){
    const label=resultLabel(row,g);
    if(label==='—')return '<span class="waste-status is-pending">ยังไม่มีผล</span>';
    if(label==='รอตรวจสอบ')return '<span class="waste-status is-pending">รอตรวจสอบ</span>';
    return label==='ผ่านเกณฑ์'?'<span class="waste-status is-good">ผ่านเกณฑ์</span>':'<span class="waste-status is-bad">ไม่ผ่านเกณฑ์</span>';
  }
  // Missing future months must be blank (not reported as false "0% pass").
  function displayMetric(row,metric,g){
    if(!row.covered)return '—';
    return metric.isResult?resultLabel(row,g):scalar(row[metric.key],metric.percent);
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
  function chooseGroup(group){const g=String(group);if(g!=='ALL'&&!GROUPS.some(x=>x.key===g))return;state.visibleGroup=g;render();}

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
          plateletSelfMadeVerified:src.platelet_internal_four_types_verified===true,
          stockLedgerVerified:src.inventory_ledger_verified===true,
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
        row.checkBalance=row.availability-row.used-row.expired-row.rejected-row.otherDiscard-row.estimatedExpiry-row.ending;
        row.provisional=!row.covered||row.unknownExit>0||row.estimatedExpiry>0||row.checkBalance!==0||issues.missingExit>0||issues.conflict>0||issues.noArrival>0; // Audit metadata only, not KPI pass/fail.
        return row;
      });
    }
    return result;
  }
  // Shared read-only source for the Utilization and Expiry KPI pages.
  // Preferred calendar-year cache; fiscal cache is a safe fallback if only FY
  // snapshots were refreshed in Supabase. Never invent missing months as zero.
  const alignedCache = new Map();
  async function alignedCacheRead(year, fiscal) {
    const key=`${year}:${fiscal?'FY':'CY'}`;
    if (!alignedCache.has(key)) {
      alignedCache.set(key, MinimumStockBackend.getWastageMonthlySummary(year, fiscal).catch(err=>{
        alignedCache.delete(key); throw err;
      }));
    }
    return alignedCache.get(key);
  }
  async function loadAlignedCalendarYears(years, bounds = {}) {
    const unique = [...new Set((years || []).map(Number).filter(y=>Number.isInteger(y)&&y>=2000&&y<=2100))];
    if (unique.length > 10) throw new Error('เลือกเทียบได้สูงสุด 10 ปี');
    const result = await Promise.all(unique.map(async year => {
      const minDate=bounds.minDate||'',maxDate=bounds.maxDate||'';
      let calendar=null;
      try { calendar=await alignedCacheRead(year, false); } catch(e) {
        // A missing CY snapshot may have a complete FY summary instead.
      }
      let report=null, sources=[];
      if (Array.isArray(calendar) && calendar.length===48) {
        sources=[calendar];
        report=reportFromSummary(calendar,year,[],maxDate,minDate,false);
      } else {
        let fiscal=null, following=null;
        try { fiscal=await alignedCacheRead(year,true); } catch(e) {}
        if (!Array.isArray(fiscal)||fiscal.length!==48) {
          throw new Error(`ยังไม่มี Cache KPI ปี ${year+543} แบบปีปฏิทินหรือปีงบประมาณ กรุณารีเฟรชข้อมูลใน Supabase ก่อน`);
        }
        try { following=await alignedCacheRead(year+1,true); } catch(e) {}
        if (!Array.isArray(following)||following.length!==48) following=null;
        sources=following?[fiscal,following]:[fiscal];
        const a=reportFromSummary(fiscal,year,[],maxDate,minDate,true);
        const b=following?reportFromSummary(following,year+1,[],maxDate,minDate,true):null;
        const empty=reportFromSummary([],year,[],maxDate,minDate,false);
        report={year,fiscal:false,months:{},issues:a.issues,familyCount:a.familyCount};
        for (const g of GROUPS) {
          report.months[g.key]=Array.from({length:12},(_,i)=>{
            if(i<9)return a.months[g.key][i+3]; // FY month 4..12 = Jan..Sep
            if(b)return b.months[g.key][i-9]; // next FY month 1..3 = Oct..Dec
            return {...empty.months[g.key][i],covered:false,kpi:null,utilization:null};
          });
        }
      }
      const dates=sources.map(rows=>rows[0]?.refreshed_at||'').filter(Boolean);
      const refreshedAt=dates.length?dates.sort()[0]:''; // oldest contributing cache
      return {
        year,report,refreshedAt,
        cacheStale:!!bounds.latestUploadedAt && !!refreshedAt && Date.parse(refreshedAt)<Date.parse(bounds.latestUploadedAt),
        // The current SQL may still include LDPC receipts. Do not claim otherwise.
        ldpcReceiptVerified:sources.length>0 && sources.every(rows=>rows.every(r=>r.ldpc_receipts_excluded===true)),
        plateletFourTypesVerified:sources.length>0 && sources.every(rows=>rows.every(r=>r.platelet_internal_four_types_verified===true)),
        stockLedgerVerified:sources.length>0 && sources.every(rows=>rows.every(r=>r.inventory_ledger_verified===true)),
      };
    }));
    return result.sort((a,b)=>a.year-b.year);
  }
  function invalidateAlignedCache() { alignedCache.clear(); }
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
    out.checkBalance=out.availability-sum('used')-sum('expired')-sum('rejected')-sum('otherDiscard')-sum('estimatedExpiry')-out.ending;
    out.actual=null;out.discrepancy=null;
    out.covered=rows.every(r=>r.covered);
    out.provisional=rows.some(r=>r.provisional)||out.checkBalance!==0;
    out.result=!out.covered||out.kpi===null?'—':rows.some(r=>stockRequiresVerification(g.key,r))?'รอตรวจสอบ':out.kpi<=g.target?'ผ่านเกณฑ์':'ไม่ผ่านเกณฑ์';
    return out;
  }
  function exportReport() {
    if(!state.summary) return;
    if(!window.XLSX){window.showModal?.('error','ส่งออกไม่ได้','ไม่พบไลบรารี Excel');return;}
    const report=snapshot(),wb=XLSX.utils.book_new();
    const definition=[
      ['CNMI Blood Stock • KPI ลดความสูญเสียรายเดือน',`${report.fiscal?'ปีงบประมาณ':'ปีปฏิทิน'} พ.ศ. ${report.year+543}`],
      ['สถานะ',report.cacheStale?'Cache เก่ากว่าการนำเข้า LIS ล่าสุด':'ผล KPI คำนวณจากสรุป LIS ใน Supabase'],
      ['วันที่คำนวณสถิติ Cache',cacheAgeLabel()],
      ['อัปเดตหลังนำเข้า','รัน SQL-v2.9.115-03-REFRESH-FY2569.sql (หรือคำสั่งรีเฟรชปีที่เลือก) ใน Supabase SQL Editor'],
      ['สูตร KPI ตามตาราง','สถานะ Expired ของถุงหลักเท่านั้น (1 family / ไม่มีสมาชิก Released,Dedicated) ÷ (Internal CNMI + TRC + Ending Inventory) × 100; Cryo ไม่มี Internal ในตัวหาร'],
      ['สูตร Utilization Rate รายเดือน','Used ÷ (Beginning + Internal + TRC + Other Hospital + Unclassified) × 100'],
      ['สูตร KPI รวมปี','Expired รวมปี ÷ (Internal รวมปี + TRC รวมปี + คงคลัง ณ สิ้นปี) × 100; Cryo ไม่รวม Internal'],
      ['สูตร Utilization Rate รวมปี','Used รวมปี ÷ (คงคลังต้นปี + รับเข้าตลอดปีทุกแหล่ง) × 100'],
      ['นิยามคงคลัง','ต้นเดือน = ถุงที่รับเข้าก่อนวันที่ 1 และยังไม่มี Action สิ้นสุดก่อนวันที่ 1; สิ้นเดือน = ยอดหลัง Action เดือนนั้น; ExpireDate ของถุงที่ไม่ Expired เป็นเพียง Stock-only adjustment ไม่นับ KPI'],
      ['สถานะการตรวจสอบ','เกล็ดเลือดและ Cryo ยังต้องยืนยัน Receipt/Stock จาก SQL Cache; ค่า KPI ที่ยังไม่ยืนยันเป็นข้อมูลสำหรับ Audit ไม่ใช่ผลผ่านเกณฑ์'],
      ['ผลิตเกล็ดเลือดภายใน','Leukocyte Depleted Pooled Platelet Concentrate; Single Donor Platelet; Irradiated-Leukocyte Depleted Pooled Platelet Concentrate; Irradiated-Single Donor Platelet เท่านั้น'],
      ['หมายเหตุ LIS','รายละเอียดการใช้ ExpireDate และรายการข้อมูลประกอบแยกจากผลผ่าน/ไม่ผ่านเกณฑ์'],
      ['ผลต่างทางบัญชี','Stock ตรวจนับจริง − Stock ปลายเดือนตาม LIS (ห้ามตั้งเป็น 0 เมื่อไม่มีการตรวจนับ)'],
      ['ขอบเขต','นับ Bag family (ถุงหลัก + .S1/.S.1/.S2/.S.2 และ .U1/.U2/...) 1 ครั้งต่อกลุ่มผลิตภัณฑ์; ต้อง Expired ที่ถุงหลักเท่านั้น; ยอดรับเข้าไม่รวม LDPC (ไม่ใช่ LDPPC) เมื่อ SQL Cache ปรับแล้ว'],
      ['หมายเหตุ','Dedicated นับใช้, Rejected และทำลายเหตุอื่นไม่นับหมดอายุ, Transform เป็นขั้นตอนกลาง'],
      ['การจัดกลุ่ม','เม็ดเลือดแดง, พลาสมา, เกล็ดเลือด, Cryo; Whole Blood ไม่รวม'],
      ['ความครอบคลุม LIS',state.latest?.source_end_date||state.maxDate||'ยังไม่ยืนยัน'],
      ['ช่วงเดือนที่รายงาน',`${periodMonths(report.year,report.fiscal)[0]} ถึง ${periodMonths(report.year,report.fiscal)[11]}`],
      ['รายการที่วันจ่ายหายไป',report.issues.missingExit],
      ['จำนวนรายการกำหนดวันที่จากวันหมดอายุ / ปรับ Stock เท่านั้น',report.issues.estimatedExpiry],
      ['ถุงที่ไม่มีวันรับเข้า',report.issues.noArrival],
      ['กลุ่มข้อมูลมีข้อขัดแย้ง',report.issues.conflict]
    ];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(definition),'คำอธิบาย');
    for(const g of GROUPS){
      const rows=report.months[g.key];
      const annual=annualSummary(rows,g);
      const header=['รายการ','เกณฑ์ / บทบาท',...rows.map(r=>monthLabel(r.begin)),'รวมปี'];
      const body=mainMetricRows.map(metric=>[metric.name,metric.hint,...rows.map(r=>r.covered ? (metric.isResult?resultLabel(r,g):(r[metric.key]??null)):null),metric.isResult?annual.result:(annual.covered?(annual[metric.key]??null):null)]);
      const checks=['ผลตามเกณฑ์ KPI','',...rows.map(r=>resultLabel(r,g)),annual.result];
      const sheet=XLSX.utils.aoa_to_sheet([[`KPI ลดความสูญเสีย ${g.label} • เป้าหมาย ≤ ${g.target}%`],header,...body,checks]);
      sheet['!cols']=[{wch:43},{wch:29},...Array.from({length:12},()=>({wch:15})),{wch:16}];
      XLSX.utils.book_append_sheet(wb,sheet,g.en);
      const detailRows=detailMetricRows.map(metric=>[metric.name,metric.hint,...rows.map(r=>r.covered?(r[metric.key]??null):null),annual[metric.key]??null]);
      const detailSheet=XLSX.utils.aoa_to_sheet([[`ข้อมูลประกอบ LIS • ${g.label}`],header,...detailRows]);
      detailSheet['!cols']=[{wch:43},{wch:29},...Array.from({length:12},()=>({wch:15})),{wch:16}];
      XLSX.utils.book_append_sheet(wb,detailSheet,g.en+' Detail');
    }
    XLSX.writeFile(wb,`CNMI-Wastage-KPI-${state.fiscal?'FY':'CY'}${state.year+543}-v2.9.119.xlsx`);
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
    const sections=GROUPS.filter(g=>state.visibleGroup==='ALL'||g.key===state.visibleGroup).map(g=>{
      const months=report.months[g.key],at=months[state.month-1],annual=annualSummary(months,g);
      const makeRows = metrics=>metrics.map(metric=>{
        const isKpi=metric.key==='kpi',isResult=metric.isResult;
        const rowClass=isKpi?'waste-main-row':isResult?'waste-result-row':metric.key==='discrepancy'?'waste-audit-row':'';
        return `<tr class="${rowClass}"><th scope="row"><span>${html(metric.name)}</span>${metric.hint?`<small>${html(metric.hint)}</small>`:''}</th>
          ${months.map((r,i)=>`<td class="${i+1===state.month?'waste-selected':''} ${isResult?resultClass(r,g):''}">${displayMetric(r,metric,g)}</td>`).join('')}
          <td class="waste-annual ${isResult?(annual.result==='ผ่านเกณฑ์'?'waste-result-good':annual.result==='ไม่ผ่านเกณฑ์'?'waste-result-bad':''):''}">${!annual.covered?'—':isResult?annual.result:scalar(annual[metric.key],metric.percent)}</td></tr>`;
      }).join('');
      const body=makeRows(mainMetricRows),detailBody=makeRows(detailMetricRows);
      const needsAudit=months.some(r=>r.covered&&stockRequiresVerification(g.key,r));
      const qaWarning=needsAudit ? `<div class="waste-audit-alert"><strong>ยังไม่รับรองค่า ${html(g.label)} จาก Cache</strong><span>${g.key==='PLATELET'?'ต้องตรวจยอดผลิตเองเฉพาะ 4 ชื่อผลิตภัณฑ์จาก LIS และคงคลังตามวันจริง':'ต้องตรวจรายการคงคลัง Cryo กับ ExpireDate / DateStockOut / Be Transformed ตาม Bag Family'} ก่อนใช้ตัวเลขเป็น KPI ทางการ · ตัวเลขด้านล่างยังแสดงค่าเดิมเพื่อ Audit</span></div>`:'';
      return `<section class="simple-panel waste-section" aria-label="KPI ${html(g.label)}">
        <div class="waste-section-head"><div><h3>${html(g.label)}</h3><span class="small-muted">${html(g.en)} · เป้าหมาย ≤ ${g.target}%</span></div><div class="waste-kpi-figure"><strong>${at.covered?scalar(at.kpi,true):'—'}</strong>${statusHtml(at,g)}</div></div>
        ${qaWarning}
        <div class="waste-table-scroll" tabindex="0" aria-label="ตารางสถิติรายเดือน ${html(g.label)}"><table class="waste-table"><thead><tr><th>รายการ / หน่วย</th>${months.map((r,i)=>`<th class="${i+1===state.month?'waste-selected':''}">${monthLabel(r.begin)}</th>`).join('')}<th class="waste-annual">รวมปี</th></tr></thead><tbody>${body}</tbody></table></div>
        <details class="waste-detail-panel"><summary>ข้อมูลประกอบ LIS และรายการอื่น ๆ <span>เปิดดูเพิ่มเติม</span></summary>
          <div class="waste-table-scroll"><table class="waste-table waste-extra-table"><thead><tr><th>รายการเพิ่มเติม</th>${months.map(r=>`<th>${monthLabel(r.begin)}</th>`).join('')}<th class="waste-annual">รวมปี</th></tr></thead><tbody>${detailBody}</tbody></table></div>
          <p>ตัวเลขประกอบ LIS แยกจากการตัดสินผล KPI ตามเป้าหมาย; การบันทึกยอดตรวจนับจริงเป็นคนละขั้นตอน</p>
        </details>
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
      ${!state.summary.every(r=>r.platelet_internal_four_types_verified===true)?`<div class="waste-notice waste-cache-stale"><strong>รับเข้าเกล็ดเลือด: ยังไม่ได้ยืนยันชื่อผลิตเองทั้ง 4 รายการ</strong><span>ต้องตรวจสอบ/ปรับ SQL ให้ CNMI Internal นับเฉพาะ 4 ชื่อที่ระบุ และไม่รวม LDPC; รายการใช้งาน/หมดอายุยังคงนับตามสถานะ ก่อนนำผลเกล็ดเลือดไปอ้างอิงเป็นตัวชี้วัดทางการ</span></div>`:''}
      <div class="waste-target-grid">${GROUPS.map(g=>{const at=report.months[g.key][state.month-1];return `<div class="waste-target-card"><span>${html(g.label)}</span><strong>${at.covered?scalar(at.kpi,true):'—'}</strong><div><small>เป้าหมาย ≤ ${g.target}%</small>${statusHtml(at,g)}</div></div>`;}).join('')}</div>
      ${(warning.missingExit||warning.noArrival||warning.conflict||warning.estimatedExpiry||warning.unclassified)?`<details class="simple-panel waste-method"><summary>ข้อมูลประกอบจาก LIS (ไม่รวมเป็นจำนวน Expired)</summary><p>ไม่พบวันจ่าย/ออก ${fmt(warning.missingExit)} family · วันสิ้นสุดอนุมาน / ปรับ Stock ${fmt(warning.estimatedExpiry)} · ไม่มีวันรับเข้า ${fmt(warning.noArrival)} · ข้อมูลขัดแย้ง ${fmt(warning.conflict)} · แหล่งรับเข้าไม่ชัด ${fmt(warning.unclassified)}</p></details>`:''}
      <details class="simple-panel waste-method"><summary>สูตรที่ใช้คำนวณ KPI</summary><p class="waste-formula"><strong>สูตร KPI:</strong> หมดอายุ ÷ (ผลิตภายใน CNMI + รับจาก TRC + คงคลังปลายเดือน) × 100 (Cryo: ใช้ TRC + ปลายเดือน) · Utilization รายเดือน = จ่ายใช้ ÷ (คงคลังต้นเดือน + รับเข้าทุกแหล่ง) × 100 · รวมปี = หมดอายุทั้งปี ÷ (ผลิตใน CNMI ทั้งปี + TRC ทั้งปี + คงคลังสิ้นปี) · คงคลังต้น/ปลายปีไม่นำ 12 เดือนมาบวกกัน</p></details>
      <div class="simple-panel waste-toolbar no-print"><label for="waste-group-filter">แสดงตารางผลิตภัณฑ์
        <select id="waste-group-filter" class="form-select" onchange="CNMIWastage.chooseGroup(this.value)"><option value="ALL" ${state.visibleGroup==='ALL'?'selected':''}>ทั้งหมด 4 กลุ่ม</option>
        ${GROUPS.map(g=>`<option value="${g.key}" ${state.visibleGroup===g.key?'selected':''}>${html(g.label)}</option>`).join('')}
        </select></label><span class="small-muted">จำนวน Expired = ถุงหลัก Status Expired และไม่มีถุงใดในครอบครัวจ่ายใช้แล้ว (นับครั้งเดียว)</span></div>
      ${sections}
      <details class="simple-panel waste-real-inventory"><summary>บันทึกยอดตรวจนับจริงและผลต่างทางบัญชี (เพิ่มเติม)</summary><div class="panel-heading-row"><div><h3>ผลต่างทางบัญชี · ${monthLabel(report.months.RBC[state.month-1].begin)}</h3><div class="small-muted">ใช้ยอดตรวจนับจริงมาเทียบกับยอดคงคลังจาก LIS · ไม่มีผลตรวจนับจะแสดง “—” ไม่ใช่ศูนย์</div></div></div>
        ${state.schemaReady?`<div class="waste-check-grid">${actualInputs}</div>`:`<div class="waste-notice"><strong>ยังไม่ได้ติดตั้งตารางตรวจนับจริง</strong><span>รายงานจาก LIS ใช้งานได้ แต่หากต้องการบันทึกสต๊อกตรวจนับและคำนวณ Discrepancy ให้รัน SQL-v2.9.108-MONTHLY-WASTAGE-CHECK.sql ที่ Supabase หนึ่งครั้ง</span></div>`}
        ${state.schemaReady&&!isAdmin?'<p class="small-muted">อ่านข้อมูลได้ตามสิทธิ์ผู้ใช้ · การบันทึกยอดตรวจนับสำหรับ Admin เท่านั้น</p>':''}</details>
      <details class="simple-panel waste-method"><summary>นิยามและวิธีนับถุงเลือด</summary><p><strong>ตัวตั้ง Expired:</strong> ต้องมี Status=Expired ที่ถุงหลักและไม่มีสมาชิกถุงใดในครอบครัวที่ Released หรือ Dedicated; ถุง .S1/.S.1/.S2/.S.2 ที่หมดอายุลำพังไม่นับ. หนึ่งครอบครัวนับได้มากสุดหนึ่งถุงต่อกลุ่มผลิตภัณฑ์; Be Transformed ไม่ใช่ผลลัพธ์ปลายทาง</p><p>คงคลังต้นเดือนนับก่อน Action ของวันที่ 1; DateStockIn คือวันรับเข้าจริง และ DateStockOut คือวันจ่าย/Action จริง ถ้า LIS ยังแสดง Available/Be Transformed แต่พ้น ExpireDate จะไม่ค้างเป็น Stock ตลอดไป: ใช้เป็นการปรับยอดคงคลังตามวันสิ้นสุดแยกต่างหาก <strong>ไม่ใช่จำนวน Expired ใน KPI</strong>; รายการออกจริงแต่ไม่มีวันที่ออกต้องตรวจสอบ</p><p>ยอดคงคลังต้น/ปลายเป็นยอดคำนวณย้อนหลังจาก LIS ไม่ใช่ผลตรวจนับจริง; ช่องรวมปีสำหรับคงคลังแสดงยอดต้นปีและสิ้นปี (ไม่ใช่ผลบวก 12 เดือน); ปริมาณรับจากโรงพยาบาลอื่นแยกแสดงเพื่อทวนสมดุล และไม่อยู่ในตัวหาร KPI ตามตารางต้นฉบับ</p><p>เดือนแรกของประวัติ LIS อาจมีเลือดคงคลังที่รับเข้าก่อนช่วงข้อมูล ต้องมีข้อมูลเพียงพอในช่วงเดือนนั้นจึงแสดงผล KPI; รายการอนุมานจาก ExpireDate จัดเป็นข้อมูลประกอบ LIS ไม่ใช่เกณฑ์ตัดสิน KPI; การแสดง 0 หมายถึงนับได้ 0; เครื่องหมาย — หมายถึงยังไม่มีค่าหรือคำนวณไม่ได้; รอตรวจสอบ = ยังไม่ยืนยันข้อกำหนดผลิตเองและ/หรือคงคลังจาก LIS</p></details>
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
    if(state.summary){await loadYear();return;} // Refresh when revisiting this route after a SQL cache rebuild.
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
  function retry(){state.summary=null;state.actual=[];state.minDate=null;state.maxDate=null;invalidateAlignedCache();load();}
  window.CNMIWastage={load,chooseYear,chooseMode,chooseMonth,chooseGroup,exportExcel:exportReport,saveActual,retry,loadAlignedCalendarYears,invalidateAlignedCache,_test:{familiesFromRows,sumMonth,buildReport,reportFromSummary,annualSummary,periodMonths,group,outcome,isLdpcReceipt,isSelfMadePlateletReceipt,receiptIsEligibleForFamily,eligibleReceiptRows,stockRequiresVerification}};
})();
