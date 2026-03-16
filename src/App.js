import { useState, useMemo, useCallback, useRef } from "react";
import { ComposedChart, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

/* ═══════════════════════════════════════════════════════════════════════
   MINING FLEET COST ENGINE v4
   Scenario Manager · Multi-Fleet · Field Mapping · Formula Editor
   ═══════════════════════════════════════════════════════════════════════ */

let _id = 100; const uid = () => "m" + (++_id);

// ─── MODEL FACTORIES ───────────────────────────────────────────────────
const mkTruck = (ov={}) => ({ id: uid(), truckName:"XCMG XGE150 Plus 10YMP", payload:85, powerSource:"Battery - Charge", batterySize:828, economicLife:80000, tkphLimit:254.2, availability:0.86, useOfAvailability:0.96, operatingEfficiency:0.79, utToSmuConversion:1.06, spotTimeLoad:0.46, queueTimeLoad:0, spotTimeDump:0.5, queueTimeDump:0, dumpTime:0.5, performanceEfficiency:0.99, totalTruckCapex:2185181.43, capexPerSmuHour:27.31, powerSystemCost:383890, opexPerSmuHour:156.54, operatorRate:133, nominalBatteryCapacityNew:828, averageBatteryUsableCapacity:563.04, travelToRechargeEnergy:10, travelToSwapChargerStationTime:2.96, chargerQueueTime:0, chargerConnectionPositioningTime:0, equivalentFullLifeCycles:4500, chargingTime:50, rechargeRateC:1.2, swapTotalSwapTime:14.5, chargerOperatingTime:6740.82, demandResponseAllowance:0, numBatteriesPerStation:1, totalChargerCapex:4703194.09, avgChargerEffectiveHours:6740.82, totalChargerOandO:70.19, ...ov });
const mkTruckL = () => mkTruck({ truckName:"Liebherr BET264 10ymp", payload:240, batterySize:2580, economicLife:84000, tkphLimit:1400, availability:0.88, useOfAvailability:0.936, operatingEfficiency:0.803, spotTimeLoad:0.46, queueTimeLoad:0, spotTimeDump:0.5, queueTimeDump:0, dumpTime:1.0, totalTruckCapex:11198255.71, capexPerSmuHour:133.31, powerSystemCost:2313980, opexPerSmuHour:478.80, nominalBatteryCapacityNew:2580, averageBatteryUsableCapacity:2037.5, travelToRechargeEnergy:17.4, equivalentFullLifeCycles:5950, chargingTime:33.18, rechargeRateC:2.0, totalChargerCapex:9722830, totalChargerOandO:143.25 });
const mkDigger = (ov={}) => ({ id: uid(), diggerName:"300t Cable Electric Backhoe", powerSource:"Cable Electric", availability:0.90, useOfAvailability:0.83, operatingEfficiency:0.38, utToSmuConversion:1.03, equipmentLife:80000, effectiveTime:2487, effectiveDigRate:2800, totalCapex:8995710, capexPerSmuHour:112.45, dieselElectricityCost:86.6, maintenanceLabour:91, oilAndCoolant:12.6, partsComponentsPM05:223, materialsConsumables:0, get:76.5, cableCost:2.4, tracks:0, tires:0, fmsLicenseFee:42.99, batteryReplacement:0, operatorCost:130, rehandleCostPerTonne:1.13, ...ov });
const mkDigger4 = () => mkDigger({ diggerName:"400t Cable Electric Backhoe", effectiveDigRate:5100, totalCapex:13698717.31, capexPerSmuHour:171.23, dieselElectricityCost:108.21, oilAndCoolant:21, partsComponentsPM05:304, get:90 });
const defaultOther = () => ({ moistureContent:0.052, exchangeRate:0.70, discountRate:0.115, electricityCost:0.1443, dieselCost:0.9102, allInFitterPerYear:182, mannedOperator:133, calendarTime:8760, diggerFleetRoundingThreshold:0.5 });

// ─── HELPERS ───────────────────────────────────────────────────────────
const fmt = (v,d=2) => { if(v===""||v==null||isNaN(v)) return "—"; return Number(v).toLocaleString("en-AU",{minimumFractionDigits:d,maximumFractionDigits:d}); };
const fmtInt = v => fmt(v,0);
const fmtC2 = v => { if(v===""||v==null||isNaN(v)) return "—"; return "$"+Number(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2}); };
const fmtCur = v => { if(v===""||v==null||isNaN(v)) return "—"; if(Math.abs(v)>=1e6) return "$"+(v/1e6).toFixed(2)+"M"; return "$"+Number(v).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0}); };

// ─── EXPRESSION ENGINE ─────────────────────────────────────────────────
function tokenize(e){const t=[];let i=0;while(i<e.length){if(/\s/.test(e[i])){i++;continue}if(/[0-9.]/.test(e[i])){let n="";while(i<e.length&&/[0-9.eE\-]/.test(e[i]))n+=e[i++];t.push({type:"num",val:parseFloat(n)})}else if(/[a-zA-Z_]/.test(e[i])){let d="";while(i<e.length&&/[a-zA-Z_0-9]/.test(e[i]))d+=e[i++];t.push({type:"id",val:d})}else if("+-*/(),<>=!&|?:".includes(e[i])){let o=e[i++];if("<>=!".includes(o[0])&&e[i]==='=')o+=e[i++];if(o==='&'&&e[i]==='&')o+=e[i++];if(o==='|'&&e[i]==='|')o+=e[i++];t.push({type:"op",val:o})}else i++}return t}
function evalExpr(expr,ctx){try{const tk=tokenize(expr);let p=0;const pk=()=>tk[p]||null,eat=(v)=>{const t=tk[p];if(v&&t?.val!==v)throw 0;p++;return t};function pT(){let r=pO();if(pk()?.val==='?'){eat('?');const a=pT();eat(':');const b=pT();return r?a:b}return r}function pO(){let r=pA();while(pk()?.val==='||'){eat();r=r||pA()}return r}function pA(){let r=pC();while(pk()?.val==='&&'){eat();r=r&&pC()}return r}function pC(){let r=pAd();while(pk()?.val&&['<','>','<=','>=','==','!='].includes(pk().val)){const o=eat().val,b=pAd();r=o==='<'?r<b:o==='>'?r>b:o==='<='?r<=b:o==='>='?r>=b:o==='=='?r==b:r!=b}return r}function pAd(){let r=pM();while(pk()?.val==='+'||pk()?.val==='-'){const o=eat().val,b=pM();r=o==='+'?r+b:r-b}return r}function pM(){let r=pU();while(pk()?.val==='*'||pk()?.val==='/'){const o=eat().val,b=pU();r=o==='*'?r*b:r/b}return r}function pU(){if(pk()?.val==='-'){eat();return -pP()}return pP()}function pP(){const t=pk();if(!t)throw 0;if(t.type==="num"){eat();return t.val}if(t.val==='('){eat('(');const r=pT();eat(')');return r}if(t.type==="id"){const nm=eat().val;const fns={ceil:Math.ceil,floor:Math.floor,max:Math.max,min:Math.min,abs:Math.abs,round:Math.round,CEIL:Math.ceil,FLOOR:Math.floor,MAX:Math.max,MIN:Math.min,ABS:Math.abs,ROUND:Math.round,ROUNDUP:Math.ceil,ROUNDDOWN:Math.floor};if((nm==="IF"||nm==="if")&&pk()?.val==='('){eat('(');const c=pT();eat(',');const a=pT();eat(',');const b=pT();eat(')');return c?a:b}if(fns[nm]&&pk()?.val==='('){eat('(');const args=[pT()];while(pk()?.val===','){eat(',');args.push(pT())}eat(')');return fns[nm](...args)}if(ctx.hasOwnProperty(nm)){const v=ctx[nm];return typeof v==="number"?v:(parseFloat(v)||0)}return 0}throw 0}const result=pT();return isFinite(result)?result:""}catch{return ""}}

// ─── DEFAULT FORMULAS ──────────────────────────────────────────────────
const defaultFormulas = () => [
  {key:"digOE",label:"Digger Overall Efficiency",unit:"ratio",section:"⛏️ DIGGER — Hours & Fleet",group:"Digger TUM",formula:"D_availability * D_useOfAvailability * D_operatingEfficiency",dec:4},
  {key:"digHrsReq",label:"Digger Hours Required",unit:"hrs",group:"Digger TUM",formula:"totalMined / D_effectiveDigRate"},
  {key:"smuHrs",label:"Digger SMU Hours",unit:"hrs",group:"Digger TUM",formula:"(digHrsReq / digOE) * D_utToSmuConversion"},
  {key:"digQty",label:"Digger Qty per Period",unit:"#",group:"Fleet Sizing",formula:"digHrsReq / (D_effectiveTime * periodMultiplier)",dec:3},
  {key:"digFleet",label:"Digger Fleet Required",unit:"#",group:"Fleet Sizing",formula:"IF(digQty <= 0, 0, IF((digQty - floor(digQty)) > O_diggerFleetRoundingThreshold, CEIL(digQty), MAX(1, floor(digQty))))",hl:1},
  {key:"digCapex",label:"Digger Capex",unit:"AUD",group:"Fleet Sizing",formula:"digFleet * D_totalCapex",cur:1},
  {key:"digOpxDiesel",label:"Diesel/Electricity",unit:"AUD",section:"⛏️ DIGGER — Opex",group:"Line Items",formula:"smuHrs * D_dieselElectricityCost",cur:1},
  {key:"digOpxMaint",label:"Maintenance Labour",unit:"AUD",group:"Line Items",formula:"smuHrs * D_maintenanceLabour",cur:1},
  {key:"digOpxOil",label:"Oil & Coolant",unit:"AUD",group:"Line Items",formula:"smuHrs * D_oilAndCoolant",cur:1},
  {key:"digOpxParts",label:"Parts & Components PM05",unit:"AUD",group:"Line Items",formula:"smuHrs * D_partsComponentsPM05",cur:1},
  {key:"digOpxMaterials",label:"Materials & Consumables",unit:"AUD",group:"Line Items",formula:"smuHrs * D_materialsConsumables",cur:1},
  {key:"digOpxGET",label:"GET",unit:"AUD",group:"Line Items",formula:"smuHrs * D_get",cur:1},
  {key:"digOpxCable",label:"Cable Cost",unit:"AUD",group:"Line Items",formula:"smuHrs * D_cableCost",cur:1},
  {key:"digOpxTracks",label:"Tracks",unit:"AUD",group:"Line Items",formula:"smuHrs * D_tracks",cur:1},
  {key:"digOpxTires",label:"Tires",unit:"AUD",group:"Line Items",formula:"smuHrs * D_tires",cur:1},
  {key:"digOpxFMS",label:"FMS License & Support",unit:"AUD",group:"Line Items",formula:"smuHrs * D_fmsLicenseFee",cur:1},
  {key:"digOpxBattery",label:"Battery Replacement",unit:"AUD",group:"Line Items",formula:"smuHrs * D_batteryReplacement",cur:1},
  {key:"digOpxOperator",label:"Operator Cost",unit:"AUD",group:"Line Items",formula:"smuHrs * D_operatorCost",cur:1},
  {key:"digOpxTotal",label:"Total Digger Opex (exc Cpx)",unit:"AUD",group:"Totals",formula:"digOpxDiesel+digOpxMaint+digOpxOil+digOpxParts+digOpxMaterials+digOpxGET+digOpxCable+digOpxTracks+digOpxTires+digOpxFMS+digOpxBattery+digOpxOperator",hl:1,cur:1},
  {key:"digOpxPerT",label:"Digger Opex/Tonne",unit:"$/t",group:"Totals",formula:"digOpxTotal / totalMined",cur:1},
  {key:"digOpxIncCpx",label:"Opex inc Capex/Tonne",unit:"$/t",group:"Totals",formula:"(digOpxTotal + smuHrs * D_capexPerSmuHour) / totalMined",cur:1},
  {key:"digCostActivity",label:"Total Digger Cost (inc Cpx)",unit:"AUD",group:"Totals",formula:"digOpxIncCpx * totalMined",hl:1,cur:1},
  {key:"digRehandle",label:"Digger Rehandle",unit:"AUD",group:"Totals",formula:"D_rehandleCostPerTonne * oreMined",cur:1},
  {key:"spotLoadQueueDump",label:"Spot/Load/Queue/Dump",unit:"min",section:"🚛 TRUCK — Cycle & Charging",group:"Cycle",formula:"T_spotTimeLoad + T_queueTimeLoad + F_loadTime + T_spotTimeDump + T_queueTimeDump + T_dumpTime",hl:1},
  {key:"cycleTime",label:"Total Cycle Time",unit:"min",group:"Cycle",formula:"spotLoadQueueDump + avgLoadedTravelTime + avgUnloadedTravelTime + avgTkphDelay"},
  {key:"energyBurn",label:"Energy Burn Rate",unit:"kWh/hr",group:"Cycle",formula:"avgNetPower / (cycleTime / 60)"},
  {key:"cycPerChg",label:"Cycles per Charge",unit:"#",group:"Charging",formula:"T_averageBatteryUsableCapacity / avgNetPower",dec:3},
  {key:"cycPerChgRD",label:"Cycles/Charge (Round Down)",unit:"#",group:"Charging",formula:"IF(cycPerChg <= 0, 0, IF(cycPerChg < 1, 1, floor(cycPerChg)))"},
  {key:"incompCyc",label:"Incomplete Cycles",unit:"#",group:"Charging",formula:"IF(cycPerChg == 0, 0, CEIL(1/cycPerChg)*cycPerChg - cycPerChgRD)",dec:4},
  {key:"batEngBefore",label:"Battery Energy Before Travel",unit:"kWh",group:"Eff Capacity",formula:"incompCyc * avgNetPower"},
  {key:"travRchgE",label:"Travel to Recharge Energy",unit:"kWh",group:"Eff Capacity",formula:"T_travelToRechargeEnergy"},
  {key:"effUsableCap",label:"Effective Usable Capacity",unit:"kWh",group:"Eff Capacity",formula:"IF(T_averageBatteryUsableCapacity==0,0,IF(travRchgE<batEngBefore,T_averageBatteryUsableCapacity-(batEngBefore-travRchgE),T_averageBatteryUsableCapacity-(avgNetPower+batEngBefore-travRchgE))+IF(cycPerChg==0,0,floor(1/cycPerChg))*T_averageBatteryUsableCapacity)",hl:1},
  {key:"effCycPerChg",label:"Effective Cycles/Charge",unit:"#",group:"Eff Capacity",formula:"IF(cycPerChg<1,cycPerChg,IF(travRchgE<batEngBefore,cycPerChgRD,cycPerChgRD-1))",dec:3},
  {key:"pctRchg",label:"% Battery Recharged",unit:"%",group:"Recharge",formula:"effUsableCap / T_averageBatteryUsableCapacity",dec:4},
  {key:"nomRchgT",label:"Nominal Recharge Time",unit:"min",group:"Recharge",formula:"T_chargingTime"},
  {key:"actRchgT",label:"Actual Recharge Time",unit:"min",group:"Recharge",formula:"pctRchg * nomRchgT"},
  {key:"totRchgT",label:"Total Recharge Time",unit:"min",group:"Recharge",formula:"IF(cycPerChg==0,0,actRchgT+(T_travelToSwapChargerStationTime*CEIL(1/effCycPerChg)+T_chargerQueueTime+T_chargerConnectionPositioningTime)*IF(cycPerChg<1,CEIL(1/cycPerChg),1))"},
  {key:"rchgPerHaul",label:"Recharges/Haul Cycle",unit:"#",group:"Per Cycle",formula:"1 / effCycPerChg",dec:4},
  {key:"totRchgPerCyc",label:"Total Recharge Time/Cycle",unit:"min",group:"Per Cycle",formula:"totRchgT * IF(cycPerChg<1, 1, rchgPerHaul)"},
  {key:"swpRchgPerCyc",label:"Swap/Recharge Time/Cycle",unit:"min",section:"📊 TRUCK — Productivity",group:"Time Build-up",formula:"totRchgPerCyc"},
  {key:"effCycT",label:"Effective Cycle Time",unit:"min",group:"Time Build-up",formula:"spotLoadQueueDump + avgLoadedTravelTime + avgUnloadedTravelTime"},
  {key:"prodCycT",label:"Productive Cycle Time",unit:"min",group:"Time Build-up",formula:"effCycT / T_performanceEfficiency"},
  {key:"icEffNoTKPH",label:"In-Cycle Eff No TKPH",unit:"ratio",group:"Efficiency",formula:"T_operatingEfficiency / T_performanceEfficiency",dec:4},
  {key:"utNoTKPH",label:"Utilised Time No TKPH",unit:"min",group:"Efficiency",formula:"prodCycT / icEffNoTKPH"},
  {key:"utIncTKPH",label:"Utilised Time Inc TKPH",unit:"min",group:"Efficiency",formula:"utNoTKPH + avgTkphDelay"},
  {key:"icEffIncTKPH",label:"In-Cycle Eff Inc TKPH",unit:"ratio",group:"Efficiency",formula:"prodCycT / utIncTKPH",dec:4},
  {key:"avCycNoChg",label:"Available Cycle No Charging",unit:"min",group:"Availability",formula:"utIncTKPH / T_useOfAvailability"},
  {key:"avCycIncChg",label:"Available Cycle Inc Charging",unit:"min",group:"Availability",formula:"avCycNoChg + swpRchgPerCyc"},
  {key:"uoaAfter",label:"UoA After Charging",unit:"ratio",group:"Availability",formula:"utIncTKPH / avCycIncChg",dec:4},
  {key:"calCycT",label:"Calendar Cycle Time",unit:"min",group:"Output",formula:"avCycIncChg / T_availability",hl:1},
  {key:"productivity",label:"Productivity",unit:"tph",group:"Output",formula:"T_payload / (calCycT / 60)",hl:1},
  {key:"effHrsDayAfter",label:"Eff Hours/Day",unit:"hrs",group:"Output",formula:"24 * T_availability * uoaAfter * icEffIncTKPH * T_performanceEfficiency"},
  {key:"trkCalHrs",label:"Truck Calendar Hrs Required",unit:"hrs",section:"🚚 TRUCK — Fleet & SMU",group:"Fleet",formula:"totalRampMined / productivity"},
  {key:"trkReq",label:"Trucks Required (dec)",unit:"#",group:"Fleet",formula:"trkCalHrs / calendarHours",dec:2},
  {key:"trkReqR",label:"Trucks Required (rnd)",unit:"#",group:"Fleet",formula:"CEIL(trkReq)",hl:1},
  {key:"trkCapex",label:"Truck Capex",unit:"AUD",group:"Fleet",formula:"trkReqR * T_totalTruckCapex",cur:1},
  {key:"trkCycDay",label:"Truck Cycles/Day",unit:"#",group:"Utilisation",formula:"24 / (calCycT / 60)"},
  {key:"trkRchgDay",label:"Truck Recharges/Day",unit:"#",group:"Utilisation",formula:"trkCycDay * rchgPerHaul"},
  {key:"utHrsNotChg",label:"Utilised Hrs excl Charge",unit:"hrs",group:"SMU",formula:"utIncTKPH / 60"},
  {key:"utHrsDay",label:"Utilised Hrs/Day",unit:"hrs",group:"SMU",formula:"utHrsNotChg * trkCycDay"},
  {key:"trkSmuDay",label:"Truck SMU/Day",unit:"hrs",group:"SMU",formula:"utHrsDay * T_utToSmuConversion"},
  {key:"trkSmuPer",label:"Truck SMU/Period",unit:"hrs",group:"SMU",formula:"trkSmuDay * calendarDays"},
  {key:"totTrkSmu",label:"Total Truck SMU Hours",unit:"hrs",group:"SMU",formula:"trkSmuPer * trkReq",hl:1},
  {key:"netEngPerCyc",label:"Net Energy/Cycle",unit:"kWh",section:"🔋 BATTERY & ⚡ CHARGER",group:"Battery",formula:"avgNetPower + (rchgPerHaul * T_travelToRechargeEnergy)"},
  {key:"eqLifeCycPerHaul",label:"Equiv Life Cycles/Haul",unit:"#",group:"Battery",formula:"netEngPerCyc / T_nominalBatteryCapacityNew",dec:6},
  {key:"eqLifeCycDay",label:"Equiv Life Cycles/Day",unit:"#",group:"Battery",formula:"eqLifeCycPerHaul * trkCycDay",dec:4},
  {key:"eqLifeCycPer",label:"Equiv Life Cycles/Period",unit:"#",group:"Battery",formula:"eqLifeCycDay * calendarDays"},
  {key:"batLifePer",label:"Battery Life (periods)",unit:"per",group:"Replacement",formula:"T_equivalentFullLifeCycles / eqLifeCycPer",hl:1},
  {key:"batPerTrkPer",label:"Batteries/Truck/Period",unit:"#",group:"Replacement",formula:"eqLifeCycPer / T_equivalentFullLifeCycles",dec:4},
  {key:"totReplBatCost",label:"Replacement Battery Cost",unit:"AUD",group:"Battery Cost",formula:"T_powerSystemCost * batPerTrkPer",cur:1},
  {key:"batReplPerSmu",label:"Battery Repl Cost/SMU",unit:"$/SMU",group:"Battery Cost",formula:"totReplBatCost / trkSmuPer",cur:1},
  {key:"chgDur",label:"Charge Duration inc Connection",unit:"min",group:"Charger",formula:"T_chargerQueueTime + T_chargerConnectionPositioningTime + actRchgT"},
  {key:"chgReqDec",label:"Chargers Required (dec)",unit:"#",group:"Charger",formula:"(trkRchgDay*trkReq*(1+T_demandResponseAllowance))/(T_chargerOperatingTime/365/(chgDur/60))",dec:2},
  {key:"chgStaDec",label:"Charger Stations (dec)",unit:"#",group:"Charger",formula:"chgReqDec / T_numBatteriesPerStation",dec:2},
  {key:"chgStaRnd",label:"Charger Stations (rnd)",unit:"#",group:"Charger",formula:"CEIL(chgStaDec)",hl:1},
  {key:"chgCapex",label:"Charger Capex",unit:"AUD",group:"Charger Cost",formula:"chgStaRnd * T_totalChargerCapex",cur:1},
  {key:"chgHrsReq",label:"Charger Hours Required",unit:"hrs",group:"Charger Cost",formula:"chgStaDec * T_avgChargerEffectiveHours * periodMultiplier"},
  {key:"chgCost",label:"Total Charger Cost",unit:"AUD",group:"Charger Cost",formula:"chgHrsReq * T_totalChargerOandO",cur:1},
  {key:"chgCostPerTrkHr",label:"Charger Cost/Truck Hr",unit:"$/hr",group:"Charger Cost",formula:"chgCost / totTrkSmu",cur:1},
  {key:"trkOpex",label:"Truck Opex (base)",unit:"AUD",section:"💰 SUMMARY",group:"Truck Rates",formula:"T_opexPerSmuHour * totTrkSmu",cur:1},
  {key:"trkCphrExc",label:"Truck $/Hr exc Cpx",unit:"$/SMU",group:"Truck Rates",formula:"T_opexPerSmuHour + batReplPerSmu + chgCostPerTrkHr",cur:1},
  {key:"trkCphrInc",label:"Truck $/Hr inc Cpx",unit:"$/SMU",group:"Truck Rates",formula:"trkCphrExc + T_capexPerSmuHour",cur:1},
  {key:"totTrkExc",label:"Total Truck exc Cpx",unit:"AUD",group:"Truck Totals",formula:"trkCphrExc * totTrkSmu",hl:1,cur:1},
  {key:"trkPerTExc",label:"Truck $/t exc Cpx",unit:"$/t",group:"Truck Totals",formula:"totTrkExc / totalRampMined",cur:1},
  {key:"totTrk",label:"Total Truck Cost",unit:"AUD",group:"Truck Totals",formula:"trkCphrInc * totTrkSmu",hl:1,cur:1},
  {key:"trkPerT",label:"Truck $/t",unit:"$/t",group:"Truck Totals",formula:"totTrk / totalRampMined",cur:1},
  {key:"totExc",label:"Total Scenario exc Cpx",unit:"AUD",section:"🏆 GRAND TOTAL",group:"Exc Capex",formula:"totTrkExc + digOpxTotal + digRehandle",hl:1,cur:1},
  {key:"totPerTExc",label:"Total $/t exc Cpx",unit:"$/t",group:"Exc Capex",formula:"totExc / totalMined",hl:1,cur:1},
  {key:"totCost",label:"Total Scenario Cost",unit:"AUD",group:"Inc Capex",formula:"totTrk + digCostActivity + digRehandle",hl:1,cur:1},
  {key:"totPerT",label:"Total $/t",unit:"$/t",group:"Inc Capex",formula:"totCost / totalRampMined",hl:1,cur:1},
];

// ─── CALC ENGINE ───────────────────────────────────────────────────────
function calcWithFormulas(inp,formulas){
  const{totalMined,oreMined,totalRampMined,avgLoadedTravelTime,avgUnloadedTravelTime,avgNetPower,avgTkphDelay,schedPeriod,calendarDays,calendarHours,truck:T,digger:D,other:O,fleet:F}=inp;
  if(!totalMined||totalMined<=0)return null;
  const pm=schedPeriod==="Quarterly"?0.25:schedPeriod==="Monthly"?1/12:1;
  const ctx={totalMined,oreMined,totalRampMined,avgLoadedTravelTime,avgUnloadedTravelTime,avgNetPower,avgTkphDelay,calendarDays,calendarHours,periodMultiplier:pm};
  for(const[k,v]of Object.entries(T))if(typeof v==="number")ctx["T_"+k]=v;
  for(const[k,v]of Object.entries(D))if(typeof v==="number")ctx["D_"+k]=v;
  for(const[k,v]of Object.entries(O))if(typeof v==="number")ctx["O_"+k]=v;
  if(F)for(const[k,v]of Object.entries(F))if(typeof v==="number")ctx["F_"+k]=v;
  const results={};
  for(const f of formulas){const val=evalExpr(f.formula,ctx);results[f.key]=val;ctx[f.key]=typeof val==="number"?val:0}
  return results;
}

// ─── GENERIC CSV PARSER ────────────────────────────────────────────────
function parseCSV(text){return text.split(/\r?\n/).filter(l=>l.trim()).map(l=>{const c=[];let cur="",q=false;for(let i=0;i<l.length;i++){if(l[i]==='"')q=!q;else if(l[i]===','&&!q){c.push(cur.trim());cur=""}else cur+=l[i]}c.push(cur.trim());return c})}
function parseGenericCSV(text){
  const rows=parseCSV(text);if(rows.length<2)return null;
  const hdr=rows[0];let dsc=2;for(let i=1;i<hdr.length;i++){if(/^\d/.test(hdr[i])){dsc=i;break}}
  const np=Math.max(...rows.map(r=>r.length))-dsc;
  const rm={},labels=[];
  for(const r of rows){const lb=(r[0]||"").trim();if(!lb)continue;labels.push(lb);rm[lb]=r;rm[lb.toLowerCase().replace(/[^a-z0-9]/g,"")]=r}
  const gv=(lb,pi)=>{const row=rm[lb]||rm[(lb||"").toLowerCase().replace(/[^a-z0-9]/g,"")];if(!row)return 0;const v=row[dsc+pi];if(!v)return 0;const n=parseFloat(v.replace(/,/g,""));return isNaN(n)?0:n};
  const gs=(lb,pi)=>{const row=rm[lb]||rm[(lb||"").toLowerCase().replace(/[^a-z0-9]/g,"")];return row?(row[dsc+pi]||""):""};
  return{rm,labels,dsc,np,gv,gs};
}

// ─── PHYSICAL SET FIELDS ───────────────────────────────────────────────
const PHYS_FIELDS = [
  {key:"oreMined",label:"Ore Mined",unit:"t"},
  {key:"wasteMined",label:"Waste Mined",unit:"t"},
  {key:"totalMined",label:"Total Mined (tonnage driver)",unit:"t"},
  {key:"totalRampMined",label:"Ramp Build Tonnes",unit:"t"},
  {key:"avgLoadedTravelTime",label:"Loaded Travel Time",unit:"min"},
  {key:"avgUnloadedTravelTime",label:"Unloaded Travel Time",unit:"min"},
  {key:"avgTkphDelay",label:"TKPH Delay",unit:"min"},
  {key:"avgNetPower",label:"Net Power",unit:"kWh"},
  {key:"oreFePct",label:"Ore Fe %",unit:"%",chart:true},
  {key:"oreSiPct",label:"Ore Si %",unit:"%",chart:true},
  {key:"oreAlPct",label:"Ore Al %",unit:"%",chart:true},
  {key:"orePPct",label:"Ore P %",unit:"%",chart:true},
];

// ─── SCENARIO DATA STRUCTURE ───────────────────────────────────────────
const mkScenario = (name="New Scenario") => ({
  id: uid(), name,
  csvData: null,          // parsed CSV or null
  csvRawLabels: [],       // detected row labels
  manualData: [           // used when no CSV
    {period:1,periodLabel:"2032/Q2",days:91,hours:2184,oreMined:0,wasteMined:77261,totalMined:77261,totalRampMined:77261,avgLoadedTravelTime:3.3,avgUnloadedTravelTime:2.5,avgTkphDelay:0,avgNetPower:255.9,oreFePct:61.5,oreSiPct:3.7,oreAlPct:2.2,orePPct:0.08},
  ],
  fieldMappings: [        // physical sets for this scenario
    {id:uid(),name:"Base Set",fields:{oreMined:"Ore Mined",wasteMined:"Waste Mined",totalMined:"Total Mined",totalRampMined:"Total Mined",avgLoadedTravelTime:"Average loaded travel time",avgUnloadedTravelTime:"Average unloaded travel time",avgTkphDelay:"Average TKPH delay",avgNetPower:"Average Net Power",oreFePct:"Ore Fe %",oreSiPct:"Ore Si %",oreAlPct:"Ore Al %",orePPct:"Ore P %"}},
  ],
  activeFleetIds: [],     // which global fleet combos are active for this scenario
  fleetPhysicalSets: {},  // maps fleet.id -> physicalSetIdx for this scenario
  schedPeriod: "Quarterly",
  unitMul: 1,
});

// ─── FLEET COMBO (global) ──────────────────────────────────────────────
const mkFleet = (name,truckIdx=0,diggerIdx=0) => ({
  id:uid(), name, truckIdx, diggerIdx, loadTime:1.0
});

// ─── DESIGN ────────────────────────────────────────────────────────────
const P={bg:"#f8f9fc",card:"#fff",input:"#f3f4f8",bd:"#e0e3ea",bdS:"#c7cbd4",pri:"#1d4ed8",priBg:"#eef2ff",priTx:"#1e3a8a",tx:"#1a1f2e",txM:"#4b5563",txD:"#8992a3",gn:"#0d7a5f",gnBg:"#ecfdf5",rd:"#c93131",rdBg:"#fef2f2",bl:"#2563eb",blBg:"#eff6ff",hdr:"#111827",hdrTx:"#f0f1f4",secBg:"#f1f4f9",hlBg:"#e8eeff",hlTx:"#1e3a8a"};
const ff="'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const mf="'SF Mono','Fira Code','Cascadia Code',Consolas,monospace";
const mClr=["#1d4ed8","#0d7a5f","#c93131","#7c3aed","#be185d","#0e7490"];
const ST=({children,icon})=>(<div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 0 10px",marginTop:20,borderBottom:`2px solid ${P.pri}`,marginBottom:14}}><span style={{fontSize:18}}>{icon}</span><span style={{color:P.pri,fontWeight:700,fontSize:15,fontFamily:ff}}>{children}</span></div>);
const ChartToggles=({series,hidden,onToggle})=>(<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"8px 16px 4px"}}>{series.map(function(s){var vis=!hidden[s.key];return(<button key={s.key} onClick={function(){onToggle(s.key)}} style={{padding:"3px 10px",borderRadius:12,border:"1.5px solid "+(vis?s.color:P.bd),background:vis?s.color+"18":"transparent",color:vis?s.color:P.txD,fontFamily:ff,fontSize:10,fontWeight:600,cursor:"pointer",opacity:vis?1:0.4}}>{vis?"●":"○"} {s.label}</button>)})}</div>);
const Btn=({children,onClick,color=P.pri,small,solid})=>(<button onClick={onClick} style={{padding:small?"5px 12px":"8px 20px",background:solid?color:"transparent",border:`1.5px solid ${color}`,borderRadius:7,color:solid?"#fff":color,fontFamily:ff,fontSize:12,cursor:"pointer",fontWeight:600}}>{children}</button>);
const cardS={background:P.card,borderRadius:10,border:`1px solid ${P.bd}`,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"};
const selS={padding:"6px 12px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:6,color:P.tx,fontFamily:ff,fontSize:12};
const thS={padding:"9px 10px",color:P.txM,textAlign:"left",fontSize:11,fontWeight:600};

const CompRow=({label,field,models,onChange,unit,type="number",step,section})=>{
  if(section)return(<tr><td colSpan={models.length+2} style={{padding:"16px 14px 6px",color:P.pri,fontWeight:700,fontSize:13,borderBottom:`2px solid ${P.pri}20`,fontFamily:ff,background:P.secBg}}>{label}</td></tr>);
  return(<tr style={{borderBottom:`1px solid ${P.bd}`}}><td style={{padding:"7px 14px",color:P.txM,fontSize:13,fontFamily:ff,whiteSpace:"nowrap",position:"sticky",left:0,background:P.card,zIndex:1}}>{label}</td><td style={{padding:"7px 8px",color:P.txD,fontSize:11,fontFamily:mf}}>{unit}</td>{models.map((m,i)=>(<td key={m.id||i} style={{padding:"3px 6px"}}>{type==="text"?<input type="text" value={m[field]||""} onChange={e=>onChange(i,field,e.target.value)} style={{width:"100%",minWidth:115,padding:"6px 10px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:6,color:P.tx,fontFamily:ff,fontSize:13}}/>:<input type="number" value={m[field]??""} onChange={e=>onChange(i,field,parseFloat(e.target.value)||0)} step={step||0.01} style={{width:"100%",minWidth:105,padding:"6px 10px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:6,color:P.tx,fontFamily:mf,fontSize:13,textAlign:"right"}}/>}</td>))}</tr>);
};

const truckRows=[{section:true,label:"Identity & TUM"},{field:"truckName",label:"Truck Name",type:"text"},{field:"payload",label:"Payload",unit:"t"},{field:"powerSource",label:"Power Source",type:"text"},{field:"availability",label:"Availability",unit:"%",step:0.01},{field:"useOfAvailability",label:"Use of Availability",unit:"%",step:0.01},{field:"operatingEfficiency",label:"Operating Efficiency",unit:"%",step:0.01},{field:"utToSmuConversion",label:"UT → SMU",unit:"#"},{field:"performanceEfficiency",label:"Perf Efficiency",unit:"%",step:0.01},{section:true,label:"Spot / Queue / Dump Times"},{field:"spotTimeLoad",label:"Spot Time at Load",unit:"min"},{field:"queueTimeLoad",label:"Queue Time at Load",unit:"min"},{field:"spotTimeDump",label:"Spot Time at Dump",unit:"min"},{field:"queueTimeDump",label:"Queue Time at Dump",unit:"min"},{field:"dumpTime",label:"Dump Time",unit:"min"},{section:true,label:"Capital Expenditure"},{field:"totalTruckCapex",label:"Total Capex",unit:"AUD",step:1000},{field:"capexPerSmuHour",label:"Capex/SMU Hr",unit:"$/SMU"},{field:"powerSystemCost",label:"Power System",unit:"AUD",step:1000},{section:true,label:"Operating Expenditure"},{field:"opexPerSmuHour",label:"Opex/SMU Hr",unit:"$/hr"},{field:"operatorRate",label:"Operator Rate",unit:"$/SMU"},{section:true,label:"Charging"},{field:"nominalBatteryCapacityNew",label:"Nom Battery Cap",unit:"kWh"},{field:"averageBatteryUsableCapacity",label:"Avg Usable Cap",unit:"kWh"},{field:"travelToRechargeEnergy",label:"Travel Rchg Energy",unit:"kWh"},{field:"travelToSwapChargerStationTime",label:"Travel to Charger",unit:"min"},{field:"chargerQueueTime",label:"Queue Time",unit:"min"},{field:"chargerConnectionPositioningTime",label:"Connection Time",unit:"min"},{field:"equivalentFullLifeCycles",label:"Equiv Life Cycles",unit:"#"},{field:"chargingTime",label:"Charging Time",unit:"min"},{field:"rechargeRateC",label:"Recharge Rate",unit:"C"},{section:true,label:"Charger Infrastructure"},{field:"chargerOperatingTime",label:"Charger Op Time",unit:"hrs"},{field:"demandResponseAllowance",label:"Demand Resp %",unit:"%",step:0.01},{field:"numBatteriesPerStation",label:"Batteries/Station",unit:"#"},{field:"totalChargerCapex",label:"Charger Capex",unit:"AUD",step:1000},{field:"avgChargerEffectiveHours",label:"Avg Charger Eff Hrs",unit:"hrs"},{field:"totalChargerOandO",label:"Charger O&O",unit:"$/SMU"}];
const diggerRows=[{section:true,label:"Identity & TUM"},{field:"diggerName",label:"Digger Name",type:"text"},{field:"powerSource",label:"Power Source",type:"text"},{field:"effectiveDigRate",label:"Eff Dig Rate",unit:"t/hr",step:100},{field:"availability",label:"Availability",unit:"%",step:0.01},{field:"useOfAvailability",label:"Use of Availability",unit:"%",step:0.01},{field:"operatingEfficiency",label:"Op Efficiency",unit:"%",step:0.01},{field:"utToSmuConversion",label:"UT → SMU",unit:"#"},{field:"equipmentLife",label:"Equip Life",unit:"hrs"},{field:"effectiveTime",label:"Eff Time",unit:"hrs"},{section:true,label:"Capital Expenditure"},{field:"totalCapex",label:"Total Capex",unit:"AUD",step:10000},{field:"capexPerSmuHour",label:"Capex/SMU",unit:"$/SMU"},{section:true,label:"Operating Expenditure (per SMU)"},{field:"dieselElectricityCost",label:"Diesel/Elec",unit:"$/SMU"},{field:"maintenanceLabour",label:"Maint Labour",unit:"$/SMU"},{field:"oilAndCoolant",label:"Oil & Coolant",unit:"$/SMU"},{field:"partsComponentsPM05",label:"Parts PM05",unit:"$/SMU"},{field:"materialsConsumables",label:"Materials",unit:"$/SMU"},{field:"get",label:"GET",unit:"$/SMU"},{field:"cableCost",label:"Cable Cost",unit:"$/SMU"},{field:"tracks",label:"Tracks",unit:"$/SMU"},{field:"tires",label:"Tires",unit:"$/SMU"},{field:"fmsLicenseFee",label:"FMS License",unit:"$/SMU"},{field:"batteryReplacement",label:"Battery Repl",unit:"$/SMU"},{field:"operatorCost",label:"Operator",unit:"$/SMU"},{field:"rehandleCostPerTonne",label:"Rehandle $/t",unit:"$/t"}];

// ─── LOCAL STORAGE ─────────────────────────────────────────────────────
// ─── LOCAL STORAGE (disabled for now - use Export/Import JSON instead) ──
function saveToLS(data){}
function loadFromLS(){return null}

// ─── EXPORT HELPERS ────────────────────────────────────────────────────
function exportToCSV(headers,rows,filename){
  var csv=headers.join(",")+"\n";
  for(var i=0;i<rows.length;i++){csv+=rows[i].map(function(c){var s=String(c==null?"":c);return s.indexOf(",")>=0||s.indexOf('"')>=0?'"'+s.replace(/"/g,'""')+'"':s}).join(",")+"\n"}
  var blob=new Blob([csv],{type:"text/csv"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function exportToXLSX(sheetsData,filename){
  // Pure JS fallback: export as multi-sheet CSV in a single file with sheet separators
  var content="";
  for(var i=0;i<sheetsData.length;i++){
    var sd=sheetsData[i];
    content+="=== "+sd.name+" ===\n";
    content+=sd.headers.map(function(h){var s=String(h);return s.indexOf(",")>=0?'"'+s+'"':s}).join(",")+"\n";
    for(var j=0;j<sd.rows.length;j++){
      content+=sd.rows[j].map(function(c){var s=String(c==null?"":c);return s.indexOf(",")>=0?'"'+s.replace(/"/g,'""')+'"':s}).join(",")+"\n";
    }
    content+="\n";
  }
  var blob=new Blob([content],{type:"text/csv"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=filename.replace(".xlsx",".csv");a.click();URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════
export default function App(){
  // ─── GLOBAL STATE ──────────────────────────────────────────────────
  const [page,setPage]=useState("scenarios");
  const [trucks,setTrucks]=useState(function(){return[mkTruck(),mkTruckL()]});
  const [diggers,setDiggers]=useState(function(){return[mkDigger(),mkDigger4()]});
  const [otherA,setOtherA]=useState(defaultOther);
  const [formulas,setFormulas]=useState(defaultFormulas);
  const [fleets,setFleets]=useState(function(){return[mkFleet("Fleet 1",0,0),mkFleet("Fleet 2",1,1)]});
  const [scenarios,setScenarios]=useState(function(){return[mkScenario("Scenario ST"),mkScenario("Scenario LT")]});
  const [activeScnIdx,setActiveScnIdx]=useState(0);
  const [formulaSearch,setFormulaSearch]=useState("");
  const [editingFormula,setEditingFormula]=useState(null);
  const [editText,setEditText]=useState("");
  const [collSec,setCollSec]=useState({});
  const [collGrp,setCollGrp]=useState({});
  const togSec=(s)=>setCollSec(p=>{const n=Object.assign({},p);n[s]=!n[s];return n});
  const togGrp=(g)=>setCollGrp(p=>{const n=Object.assign({},p);n[g]=!n[g];return n});
  const [testPeriodIdx,setTestPeriodIdx]=useState(0);
  const [testFleetIdx,setTestFleetIdx]=useState(0);
  const [hiddenSeries,setHiddenSeries]=useState({});
  const togSeries=(k)=>setHiddenSeries(function(p){var n=Object.assign({},p);n[k]=!n[k];return n});
  const isVis=(k)=>!hiddenSeries[k];
  const fileRef=useRef();

  // ─── EXPORT FUNCTIONS ──────────────────────────────────────────────
  const exportResultsCSV=useCallback(function(){
    if(!results.length)return;
    var headers=["Variable","Unit"].concat(results.map(function(r){return r.periodLabel+" ("+r.fleetName+")"}));
    var rows=formulas.map(function(f){
      var row=[f.label,f.unit||""];
      results.forEach(function(r){var v=r.res?r.res[f.key]:"";row.push(v===""||v==null?"":v)});
      return row;
    });
    exportToCSV(headers,rows,"results_"+scn.name.replace(/[^a-zA-Z0-9]/g,"_")+".csv");
  },[results,formulas,scn]);

  const exportResultsXLSX=useCallback(function(){
    if(!results.length)return;
    var sheets=[];
    // Results sheet
    var rHeaders=["Variable","Unit"].concat(results.map(function(r){return r.periodLabel+" ("+r.fleetName+")"}));
    var rRows=formulas.map(function(f){
      var row=[f.label,f.unit||""];
      results.forEach(function(r){var v=r.res?r.res[f.key]:"";row.push(typeof v==="number"?v:"")});
      return row;
    });
    sheets.push({name:"Results - "+scn.name.substring(0,20),headers:rHeaders,rows:rRows});
    // Schedule sheet
    if(scn.csvData){
      var sHeaders=["Row Label"].concat(Array.from({length:scn.csvData.np},function(_,i){return scn.csvData.gs("Period",i)||("P"+(i+1))}));
      var sRows=scn.csvRawLabels.map(function(label){
        var row=[label];for(var i=0;i<scn.csvData.np;i++){var v=scn.csvData.gv(label,i);var s=scn.csvData.gs(label,i);row.push(v||s||"")}return row;
      });
      sheets.push({name:"Schedule",headers:sHeaders,rows:sRows});
    }
    // Assumptions sheet
    var aHeaders=["Parameter","Unit"].concat(trucks.map(function(t,i){return"Truck "+(i+1)+": "+t.truckName}));
    var aRows=truckRows.filter(function(r){return!r.section}).map(function(r){
      var row=[r.label,r.unit||""];trucks.forEach(function(t){row.push(t[r.field]||"")});return row;
    });
    sheets.push({name:"Truck Assumptions",headers:aHeaders,rows:aRows});
    exportToXLSX(sheets,scn.name.replace(/[^a-zA-Z0-9]/g,"_")+"_export.xlsx");
  },[results,formulas,scn,trucks]);

  const scn=scenarios[activeScnIdx]||scenarios[0];
  const updScn=(fn)=>setScenarios(prev=>{const n=[...prev];n[activeScnIdx]=fn({...n[activeScnIdx]});return n});

  // CSV upload for active scenario
  const handleUpload=useCallback(e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=ev=>{try{
      const parsed=parseGenericCSV(ev.target.result);
      if(!parsed||parsed.np<1){updScn(s=>({...s,csvData:null,csvRawLabels:[]}));return}
      updScn(s=>({...s,csvData:parsed,csvRawLabels:parsed.labels}));
    }catch(err){console.error(err)}};
    rd.readAsText(f);
  },[activeScnIdx]);

  // Resolve period data for a fleet in active scenario
  const getPd=useCallback((pi,fleet)=>{
    const psIdx=scn.fleetPhysicalSets[fleet.id]||0;
    const mapping=scn.fieldMappings[psIdx]||scn.fieldMappings[0];
    if(!mapping)return null;
    if(scn.csvData){
      const r={period:pi+1,periodLabel:scn.csvData.gs("Period",pi)||`P${pi+1}`,days:scn.csvData.gv("Days",pi)||91};
      r.hours=scn.csvData.gv("Hours",pi)||r.days*24;
      for(const pf of PHYS_FIELDS)r[pf.key]=mapping.fields[pf.key]?scn.csvData.gv(mapping.fields[pf.key],pi):0;
      return r;
    }
    return scn.manualData[pi]||null;
  },[scn]);

  const numPeriods=scn.csvData?scn.csvData.np:scn.manualData.length;
  const activeFleets=fleets.filter(f=>scn.activeFleetIds.length===0||scn.activeFleetIds.includes(f.id));

  // Calculate results
  const results=useMemo(()=>{
    const all=[];
    for(let pi=0;pi<numPeriods;pi++){
      for(const fleet of activeFleets){
        const pd=getPd(pi,fleet);if(!pd)continue;
        const ti=Math.min(fleet.truckIdx,trucks.length-1),di=Math.min(fleet.diggerIdx,diggers.length-1);
        const res=calcWithFormulas({totalMined:(pd.totalMined||0)*scn.unitMul,oreMined:(pd.oreMined||0)*scn.unitMul,totalRampMined:(pd.totalRampMined||pd.totalMined||0)*scn.unitMul,avgLoadedTravelTime:pd.avgLoadedTravelTime||0,avgUnloadedTravelTime:pd.avgUnloadedTravelTime||0,avgNetPower:pd.avgNetPower||0,avgTkphDelay:pd.avgTkphDelay||0,schedPeriod:scn.schedPeriod,calendarDays:pd.days||91,calendarHours:pd.hours||2184,truck:trucks[ti],digger:diggers[di],other:otherA,fleet:fleet},formulas);
        all.push({pi,periodLabel:pd.periodLabel||`P${pi+1}`,fleet,fleetName:fleet.name,truckName:trucks[ti]?.truckName,diggerName:diggers[di]?.diggerName,equipKey:`${fleet.truckIdx}-${fleet.diggerIdx}`,res,pd});
      }
    }
    return all;
  },[numPeriods,activeFleets,trucks,diggers,otherA,formulas,scn,getPd]);

  const equipGroups=useMemo(()=>{
    const g={};for(const r of results){if(!g[r.equipKey])g[r.equipKey]={key:r.equipKey,truckName:r.truckName,diggerName:r.diggerName,fleetNames:[],results:[]};if(!g[r.equipKey].fleetNames.includes(r.fleetName))g[r.equipKey].fleetNames.push(r.fleetName);g[r.equipKey].results.push(r)}
    return Object.values(g);
  },[results]);

  const totals=useMemo(()=>{const t={m:0,c:0};results.forEach(r=>{if(!r.res)return;t.m+=(r.pd?.totalMined||0)*scn.unitMul;t.c+=r.res.totCost||0});t.cpt=t.m>0?t.c/t.m:0;return t},[results,scn.unitMul]);

  const testResult=useMemo(()=>{
    const fleet=activeFleets[testFleetIdx]||activeFleets[0];if(!fleet)return null;
    const pd=getPd(testPeriodIdx,fleet);if(!pd)return null;
    const ti=Math.min(fleet.truckIdx,trucks.length-1),di=Math.min(fleet.diggerIdx,diggers.length-1);
    return calcWithFormulas({totalMined:(pd.totalMined||0)*scn.unitMul,oreMined:(pd.oreMined||0)*scn.unitMul,totalRampMined:(pd.totalRampMined||pd.totalMined||0)*scn.unitMul,avgLoadedTravelTime:pd.avgLoadedTravelTime||0,avgUnloadedTravelTime:pd.avgUnloadedTravelTime||0,avgNetPower:pd.avgNetPower||0,avgTkphDelay:pd.avgTkphDelay||0,schedPeriod:scn.schedPeriod,calendarDays:pd.days||91,calendarHours:pd.hours||2184,truck:trucks[ti],digger:diggers[di],other:otherA,fleet:fleet},formulas);
  },[testPeriodIdx,testFleetIdx,activeFleets,trucks,diggers,otherA,formulas,scn,getPd]);

  const updT=(i,f,v)=>setTrucks(p=>{const n=[...p];n[i]={...n[i],[f]:v};return n});
  const updD=(i,f,v)=>setDiggers(p=>{const n=[...p];n[i]={...n[i],[f]:v};return n});
  const uO=(k,v)=>setOtherA(p=>({...p,[k]:v}));
  const updFleet=(i,k,v)=>setFleets(p=>{const n=[...p];n[i]={...n[i],[k]:v};return n});
  const updMapping=(si,fi,fk,v)=>updScn(s=>{const m=[...s.fieldMappings];m[si]={...m[si],fields:{...m[si].fields,[fk]:v}};return{...s,fieldMappings:m}});
  const addManP=()=>updScn(s=>({...s,manualData:[...s.manualData,{period:s.manualData.length+1,periodLabel:`P${s.manualData.length+1}`,days:91,hours:2184,oreMined:0,wasteMined:0,totalMined:0,totalRampMined:0,avgLoadedTravelTime:10,avgUnloadedTravelTime:8,avgTkphDelay:0,avgNetPower:150,oreFePct:0,oreSiPct:0,oreAlPct:0,orePPct:0}]}));
  const updManP=(i,k,v)=>updScn(s=>{const d=[...s.manualData];d[i]={...d[i],[k]:v};if(k==="oreMined"||k==="wasteMined"){d[i].totalMined=(d[i].oreMined||0)+(d[i].wasteMined||0);d[i].totalRampMined=d[i].totalMined}if(k==="days")d[i].hours=v*24;return{...s,manualData:d}});
  const toggleFleetInScn=(fid)=>updScn(s=>{const ids=s.activeFleetIds.includes(fid)?s.activeFleetIds.filter(x=>x!==fid):[...s.activeFleetIds,fid];return{...s,activeFleetIds:ids}});

  const navGroups=[
    {label:"Assumptions",items:[{id:"other",label:"General",icon:"⚙️"},{id:"truck",label:"Trucks",icon:"🚛"},{id:"digger",label:"Diggers",icon:"⛏️"},{id:"charts_assumptions",label:"Charts",icon:"📈"}]},
    {label:"Setup",items:[{id:"formulas",label:"Formulas",icon:"🧮"},{id:"fleets",label:"Fleet Combos",icon:"🏗️"},{id:"charts_setup",label:"Charts",icon:"📈"}]},
    {label:"Scenario Manager",items:[{id:"scenarios",label:"Scenarios",icon:"📋"},{id:"schedule",label:"Schedule",icon:"📅"},{id:"mapping",label:"Field Mapping",icon:"🔗"},{id:"results",label:"Results",icon:"📊"},{id:"charts_results",label:"Charts",icon:"📈"}]},
    {label:"Compare",items:[{id:"comparison",label:"Comparison",icon:"⚖️"},{id:"charts_compare",label:"Charts",icon:"📈"}]},
  ];
  const activeGroup=navGroups.find(g=>g.items.some(i=>i.id===page))||navGroups[0];

  return(
    <div style={{minHeight:"100vh",background:P.bg,color:P.tx,fontFamily:ff}}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{background:P.hdr,padding:"12px 32px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>⛏️</div>
          <div><h1 style={{margin:0,fontSize:17,fontWeight:700,color:P.hdrTx}}>Mining Fleet Cost Engine</h1><p style={{margin:0,color:"#9ca3af",fontSize:11}}>Scenario Manager · Multi-Fleet · Field Mapping</p></div>
        </div>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          {/* Active scenario selector in header */}
          <select value={activeScnIdx} onChange={e=>setActiveScnIdx(parseInt(e.target.value))} style={{padding:"6px 14px",background:"#1f2937",border:"1px solid #374151",borderRadius:6,color:"#60a5fa",fontFamily:ff,fontSize:13,fontWeight:700}}>
            {scenarios.map((s,i)=><option key={i} value={i}>{s.name}</option>)}
          </select>
          {totals.c>0&&(<>
            <div style={{textAlign:"right"}}><div style={{color:"#9ca3af",fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>$/Tonne</div><div style={{color:"#60a5fa",fontSize:20,fontWeight:800,fontFamily:mf}}>{fmtC2(totals.cpt)}</div></div>
            <div style={{width:1,height:32,background:"#374151"}}/>
            <div style={{textAlign:"right"}}><div style={{color:"#9ca3af",fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>Total</div><div style={{color:P.hdrTx,fontSize:15,fontWeight:700,fontFamily:mf}}>{fmtCur(totals.c)}</div></div>
          </>)}

        </div>
      </div>

      {/* NAV Level 1 - Groups */}
      <div style={{display:"flex",padding:"0 32px",background:"#1f2937",overflowX:"auto"}}>
        {navGroups.map(g=>{const isA=g===activeGroup;return(<button key={g.label} onClick={()=>setPage(g.items[0].id)} style={{padding:"10px 24px",background:isA?"rgba(255,255,255,0.08)":"transparent",border:"none",borderBottom:isA?"2px solid #60a5fa":"2px solid transparent",color:isA?"#f0f1f4":"#9ca3af",fontFamily:ff,fontSize:13,fontWeight:isA?700:500,cursor:"pointer",whiteSpace:"nowrap",letterSpacing:0.2}}>{g.label}</button>)})}
      </div>
      {/* NAV Level 2 - Pages */}
      <div style={{display:"flex",padding:"0 32px",background:P.card,borderBottom:"1px solid "+P.bd,overflowX:"auto"}}>
        {activeGroup.items.map(n=>(<button key={n.id} onClick={()=>setPage(n.id)} style={{padding:"11px 20px",background:"transparent",border:"none",borderBottom:page===n.id?"3px solid "+P.pri:"3px solid transparent",color:page===n.id?P.pri:P.txD,fontFamily:ff,fontSize:12,fontWeight:page===n.id?700:500,cursor:"pointer",whiteSpace:"nowrap"}}><span style={{marginRight:6}}>{n.icon}</span>{n.label}</button>))}
      </div>

      <div style={{padding:"20px 32px 60px",maxWidth:1600,margin:"0 auto"}}>

        {/* ══ SCENARIO MANAGER ══ */}
        {page==="scenarios"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <ST icon="📋">Scenario Manager</ST>
            <Btn onClick={()=>setScenarios(p=>[...p,mkScenario(`Scenario ${p.length+1}`)])} solid>+ New Scenario</Btn>
          </div>
          <p style={{color:P.txM,fontSize:13,marginBottom:16}}>Each scenario has its own schedule data, field mappings, and active fleet selection. Switch between scenarios using the dropdown in the header. Equipment models, fleet definitions, and formulas are shared across all scenarios.</p>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))",gap:16}}>
            {scenarios.map((s,si)=>(
              <div key={s.id} style={{...cardS,padding:20,border:si===activeScnIdx?`2px solid ${P.pri}`:`1px solid ${P.bd}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <input type="text" value={s.name} onChange={e=>setScenarios(p=>{const n=[...p];n[si]={...n[si],name:e.target.value};return n})} style={{padding:"6px 10px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:6,color:P.pri,fontFamily:ff,fontSize:16,fontWeight:700,width:200}}/>
                  {scenarios.length>1&&<button onClick={()=>{setScenarios(p=>p.filter((_,i)=>i!==si));if(activeScnIdx>=scenarios.length-1)setActiveScnIdx(Math.max(0,activeScnIdx-1))}} style={{background:P.rdBg,border:`1px solid ${P.rd}22`,borderRadius:5,color:P.rd,cursor:"pointer",padding:"4px 10px",fontSize:11}}>Delete</button>}
                </div>
                <div style={{fontSize:12,color:P.txM,marginBottom:8}}>
                  <div>📅 {s.csvData?`${s.csvData.np} periods from CSV`:`${s.manualData.length} manual periods`}</div>
                  <div>🔗 {s.fieldMappings.length} physical set{s.fieldMappings.length>1?"s":""}</div>
                  <div>⏱️ {s.schedPeriod} · {s.unitMul===1?"Tonnes":s.unitMul===1000?"kt":"Mt"}</div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <Btn onClick={()=>setActiveScnIdx(si)} solid={si===activeScnIdx} color={si===activeScnIdx?P.pri:P.txD} small>{si===activeScnIdx?"Active":"Select"}</Btn>
                  <Btn onClick={()=>{const copy={...JSON.parse(JSON.stringify(s)),id:uid(),name:s.name+" (Copy)"};setScenarios(p=>[...p,copy])}} small color={P.txM}>Duplicate</Btn>
                </div>
              </div>
            ))}
          </div>

          {/* Fleet Configuration for Active Scenario */}
          <ST icon="🏗️">Fleet Configuration — {scn.name}</ST>
          <p style={{color:P.txM,fontSize:13,marginBottom:12}}>Select which fleets are active in this scenario and assign a physical set to each fleet.</p>

          <div style={{...cardS,overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%"}}>
              <thead><tr style={{background:P.secBg,borderBottom:`2px solid ${P.bdS}`}}>
                <th style={{...thS,width:50}}>Active</th>
                <th style={{...thS,minWidth:130}}>Fleet</th>
                <th style={{...thS,minWidth:150}}>Truck</th>
                <th style={{...thS,minWidth:150}}>Digger</th>
                <th style={{...thS,minWidth:180}}>Physical Set (tonnage & productivity driver)</th>
              </tr></thead>
              <tbody>{fleets.map((fl,fi)=>{
                const isActive=scn.activeFleetIds.length===0||scn.activeFleetIds.includes(fl.id);
                const psIdx=scn.fleetPhysicalSets[fl.id]||0;
                const trk=trucks[Math.min(fl.truckIdx,trucks.length-1)];
                const dig=diggers[Math.min(fl.diggerIdx,diggers.length-1)];
                return(<tr key={fl.id} style={{borderBottom:`1px solid ${P.bd}`,background:isActive?"transparent":P.input+"88",opacity:isActive?1:0.5}}>
                  <td style={{padding:"8px 12px",textAlign:"center"}}>
                    <input type="checkbox" checked={isActive} onChange={()=>toggleFleetInScn(fl.id)} style={{width:18,height:18,cursor:"pointer"}}/>
                  </td>
                  <td style={{padding:"8px 12px",color:mClr[fi%mClr.length],fontWeight:700,fontSize:13}}>{fl.name}</td>
                  <td style={{padding:"8px 12px",color:P.txM,fontSize:12}}>{trk?.truckName}</td>
                  <td style={{padding:"8px 12px",color:P.txM,fontSize:12}}>{dig?.diggerName}</td>
                  <td style={{padding:"6px 10px"}}>
                    <select value={psIdx} onChange={e=>setScenarios(prev=>{const n=[...prev];const fps=Object.assign({},n[activeScnIdx].fleetPhysicalSets);fps[fl.id]=parseInt(e.target.value);n[activeScnIdx]=Object.assign({},n[activeScnIdx],{fleetPhysicalSets:fps});return n})} disabled={!isActive}
                      style={{...selS,width:"100%",color:isActive?mClr[psIdx%mClr.length]:P.txD,fontWeight:600}}>
                      {scn.fieldMappings.map((m,mi)=><option key={mi} value={mi}>{m.name}</option>)}
                    </select>
                  </td>
                </tr>);
              })}</tbody>
            </table>
          </div>
          {scn.activeFleetIds.length===0&&<p style={{color:P.txD,fontSize:11,marginTop:6}}>All fleets active by default. Uncheck to exclude specific fleets.</p>}
        </div>)}

        {/* ══ SCHEDULE (for active scenario) ══ */}
        {page==="schedule"&&(<div>
          <ST icon="📤">Schedule — {scn.name}</ST>
          <div style={{...cardS,padding:18,marginBottom:18}}>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleUpload} style={{color:P.tx,fontSize:12}}/>
              <select value={scn.schedPeriod} onChange={e=>updScn(s=>({...s,schedPeriod:e.target.value}))} style={selS}><option value="Yearly">Yearly</option><option value="Quarterly">Quarterly</option><option value="Monthly">Monthly</option></select>
              <select value={scn.unitMul} onChange={e=>updScn(s=>({...s,unitMul:Number(e.target.value)}))} style={selS}><option value={1}>Tonnes</option><option value={1000}>kt (×1000)</option><option value={1000000}>Mt (×1M)</option></select>
              {scn.csvData&&<Btn color={P.rd} small onClick={()=>updScn(s=>({...s,csvData:null,csvRawLabels:[]}))}>Clear CSV</Btn>}
            </div>
            {scn.csvData&&<p style={{color:P.gn,fontSize:12,marginTop:8,fontWeight:600}}>✓ {scn.csvData.np} periods · {scn.csvRawLabels.length} rows detected. Configure field mappings in the Field Mapping tab.</p>}
          </div>

          {/* CSV Preview Table */}
          {scn.csvData&&(<div>
            <ST icon="📋">Imported Data Preview</ST>
            <div style={{...cardS,overflowX:"auto",maxHeight:500,overflowY:"auto"}}>
              <table style={{borderCollapse:"collapse",fontFamily:mf,fontSize:11,width:"100%"}}>
                <thead><tr style={{background:P.secBg,borderBottom:"2px solid "+P.bdS,position:"sticky",top:0,zIndex:2}}>
                  <th style={Object.assign({},thS,{position:"sticky",left:0,background:P.secBg,zIndex:3,minWidth:200})}>Row Label</th>
                  {Array.from({length:scn.csvData.np},function(_,i){return <th key={i} style={Object.assign({},thS,{textAlign:"right",minWidth:90})}>{scn.csvData.gs("Period",i)||("P"+(i+1))}</th>})}
                </tr></thead>
                <tbody>{scn.csvRawLabels.map(function(label,ri){
                  return(<tr key={ri} style={{borderBottom:"1px solid "+P.bd,background:ri%2?P.input+"44":"transparent"}}>
                    <td style={{padding:"4px 10px",color:P.txM,fontSize:11,fontWeight:500,position:"sticky",left:0,background:ri%2?P.input+"44":P.card,zIndex:1,whiteSpace:"nowrap"}}>{label}</td>
                    {Array.from({length:scn.csvData.np},function(_,pi){var v=scn.csvData.gv(label,pi);var s=scn.csvData.gs(label,pi);return <td key={pi} style={{padding:"4px 8px",textAlign:"right",color:v!==0?P.tx:P.txD,fontSize:11}}>{s||"—"}</td>})}
                  </tr>);
                })}</tbody>
              </table>
            </div>
          </div>)}

          {/* Manual Entry Table */}
          {!scn.csvData&&(<div>
            <ST icon="✏️">Manual Schedule Entry</ST>
            <div style={{...cardS,overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%"}}>
              <thead><tr style={{background:P.secBg,borderBottom:"2px solid "+P.bdS}}>
                {["#","Period","Days","Hrs","Ore","Waste","Total","Ramp","LoadTT","UnloadTT","TKPH","NetPwr","Fe%","Si%","Al%","P%"].map(function(h,i){return <th key={i} style={Object.assign({},thS,{textAlign:i>3?"right":"left"})}>{h}</th>})}
                <th/>
              </tr></thead>
              <tbody>{scn.manualData.map(function(p,idx){return(<tr key={idx} style={{borderBottom:"1px solid "+P.bd,background:idx%2?P.input+"55":"transparent"}}>
                <td style={{padding:"6px 8px",color:P.txD}}>{p.period}</td>
                {[["periodLabel","t"],["days","n"],["hours","n"],["oreMined","n"],["wasteMined","n"],["totalMined","n"],["totalRampMined","n"],["avgLoadedTravelTime","n"],["avgUnloadedTravelTime","n"],["avgTkphDelay","n"],["avgNetPower","n"],["oreFePct","n"],["oreSiPct","n"],["oreAlPct","n"],["orePPct","n"]].map(function(arr){var k=arr[0],t=arr[1];return(<td key={k} style={{padding:"4px 5px"}}><input type={t==="t"?"text":"number"} value={p[k]||0} onChange={function(e){updManP(idx,k,t==="t"?e.target.value:parseFloat(e.target.value)||0)}} style={{width:t==="t"?70:65,padding:"4px 6px",background:P.input,border:"1px solid "+P.bd,borderRadius:5,color:k==="totalMined"?P.pri:P.tx,fontFamily:mf,fontSize:11,textAlign:t==="t"?"left":"right",fontWeight:k==="totalMined"?700:400}}/></td>)})}
                <td>{scn.manualData.length>1&&<button onClick={function(){updScn(function(s){return Object.assign({},s,{manualData:s.manualData.filter(function(_,i){return i!==idx})})})}} style={{background:P.rdBg,border:"1px solid "+P.rd+"22",borderRadius:5,color:P.rd,cursor:"pointer",padding:"2px 8px"}}>×</button>}</td>
              </tr>)})}</tbody>
            </table></div>
            <div style={{marginTop:12}}><Btn onClick={addManP} solid>+ Add Period</Btn></div>
          </div>)}
        </div>)}

        {/* ══ FIELD MAPPING ══ */}
        {page==="mapping"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <ST icon="🔗">Field Mapping — {scn.name}</ST>
            <Btn onClick={()=>updScn(s=>({...s,fieldMappings:[...s.fieldMappings,{id:uid(),name:`Set ${s.fieldMappings.length+1}`,fields:PHYS_FIELDS.reduce((a,f)=>({...a,[f.key]:""}),{})}]}))} solid>+ Add Physical Set</Btn>
          </div>
          <div style={{...cardS,overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%"}}>
            <thead><tr style={{background:P.secBg,borderBottom:`2px solid ${P.bdS}`}}>
              <th style={{...thS,minWidth:180}}>Calc Input</th><th style={{...thS,minWidth:45}}>Unit</th>
              {scn.fieldMappings.map((m,mi)=>(<th key={m.id} style={{...thS,minWidth:200}}>
                <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
                  <input type="text" value={m.name} onChange={e=>updScn(s=>{const fm=[...s.fieldMappings];fm[mi]={...fm[mi],name:e.target.value};return{...s,fieldMappings:fm}})} style={{padding:"4px 8px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:5,color:mClr[mi%mClr.length],fontFamily:ff,fontSize:12,fontWeight:700,width:120}}/>
                  {scn.fieldMappings.length>1&&<button onClick={()=>updScn(s=>({...s,fieldMappings:s.fieldMappings.filter((_,i)=>i!==mi)}))} style={{background:P.rdBg,border:`1px solid ${P.rd}22`,borderRadius:4,color:P.rd,cursor:"pointer",padding:"2px 6px",fontSize:11}}>×</button>}
                </div>
              </th>))}
            </tr></thead>
            <tbody>{PHYS_FIELDS.map(pf=>(<tr key={pf.key} style={{borderBottom:`1px solid ${P.bd}`}}>
              <td style={{padding:"8px 14px",color:P.txM,fontWeight:500}}>{pf.label}</td>
              <td style={{padding:"8px 8px",color:P.txD,fontSize:11,fontFamily:mf}}>{pf.unit}</td>
              {scn.fieldMappings.map((m,mi)=>(<td key={m.id} style={{padding:"4px 6px"}}>
                {scn.csvData?(<select value={m.fields[pf.key]||""} onChange={e=>updMapping(mi,0,pf.key,e.target.value)} style={{...selS,width:"100%",minWidth:160,color:m.fields[pf.key]?P.tx:P.txD}}><option value="">— Select row —</option>{scn.csvRawLabels.map(l=><option key={l} value={l}>{l}</option>)}</select>)
                :(<input type="text" value={m.fields[pf.key]||""} onChange={e=>updMapping(mi,0,pf.key,e.target.value)} placeholder="CSV row label..." style={{width:"100%",minWidth:160,padding:"6px 10px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:6,color:P.tx,fontFamily:ff,fontSize:12}}/>)}
              </td>))}
            </tr>))}</tbody>
          </table></div>
        </div>)}

        {/* ══ FLEETS ══ */}
        {page==="fleets"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <ST icon="🏗️">Fleet Combinations (Global)</ST>
            <Btn onClick={()=>setFleets(p=>[...p,mkFleet(`Fleet ${p.length+1}`)])} solid>+ Add Fleet</Btn>
          </div>
          <p style={{color:P.txM,fontSize:13,marginBottom:8}}>Define all possible fleet combos (Truck + Digger). Activate fleets and assign physical sets per scenario in the Scenario Manager tab.</p>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))",gap:14}}>
            {fleets.map((fl,fi)=>{
              const trk=trucks[Math.min(fl.truckIdx,trucks.length-1)];
              const dig=diggers[Math.min(fl.diggerIdx,diggers.length-1)];
              return(<div key={fl.id} style={{...cardS,padding:18}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <input type="text" value={fl.name} onChange={e=>updFleet(fi,"name",e.target.value)} style={{padding:"5px 8px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:6,color:mClr[fi%mClr.length],fontFamily:ff,fontSize:14,fontWeight:700,width:160}}/>
                  {fleets.length>1&&<button onClick={()=>setFleets(p=>p.filter((_,i)=>i!==fi))} style={{background:P.rdBg,border:`1px solid ${P.rd}22`,borderRadius:5,color:P.rd,cursor:"pointer",padding:"3px 8px",fontSize:11}}>Remove</button>}
                </div>
                {[["Truck",fl.truckIdx,"truckIdx",trucks.map((t,i)=>({v:i,l:t.truckName}))],["Digger",fl.diggerIdx,"diggerIdx",diggers.map((d,i)=>({v:i,l:d.diggerName}))]].map(([lbl,val,key,opts])=>(
                  <div key={key} style={{marginBottom:8}}><label style={{display:"block",color:P.txD,fontSize:11,fontWeight:600,marginBottom:3}}>{lbl}</label>
                  <select value={val} onChange={e=>updFleet(fi,key,parseInt(e.target.value))} style={{...selS,width:"100%"}}>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
                ))}
                <div style={{marginBottom:8}}><label style={{display:"block",color:P.txD,fontSize:11,fontWeight:600,marginBottom:3}}>Load Time (min) — depends on digger-truck pairing</label>
                  <input type="number" value={fl.loadTime||0} onChange={e=>updFleet(fi,"loadTime",parseFloat(e.target.value)||0)} step={0.1} style={{width:"100%",padding:"6px 10px",background:P.input,border:"1px solid "+P.bd,borderRadius:6,color:P.tx,fontFamily:mf,fontSize:13,textAlign:"right"}}/>
                </div>
                <div style={{padding:"8px 10px",background:P.secBg,borderRadius:6,fontSize:11,color:P.txM,marginTop:4}}><b>{trk?.truckName}</b> + <b>{dig?.diggerName}</b></div>
              </div>);
            })}
          </div>
        </div>)}

        {/* ══ RESULTS ══ */}
        {page==="results"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <ST icon="📊">Results — {scn.name}</ST>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={exportResultsCSV} small color={P.gn}>Export CSV</Btn>
              <Btn onClick={exportResultsXLSX} small solid color={P.gn}>Export Excel</Btn>
            </div>
          </div>
          {equipGroups.length===0?<p style={{color:P.txD}}>No results. Check schedule data and active fleets.</p>:equipGroups.map(grp=>(<div key={grp.key} style={{marginBottom:28}}>
            <div style={{padding:"10px 16px",background:P.priBg,borderRadius:"8px 8px 0 0",border:`1px solid ${P.pri}22`,borderBottom:"none"}}>
              <span style={{color:P.pri,fontWeight:700,fontSize:14}}>{grp.truckName} + {grp.diggerName}</span>
              <span style={{color:P.txD,fontSize:12,marginLeft:12}}>({grp.fleetNames.join(" + ")})</span>
            </div>
            <div style={{...cardS,borderTopLeftRadius:0,borderTopRightRadius:0,overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%",minWidth:600}}>
              <thead><tr style={{background:P.secBg,borderBottom:`2px solid ${P.bdS}`}}>
                <th style={{...thS,minWidth:220,position:"sticky",left:0,background:P.secBg,zIndex:2}}>Variable</th>
                <th style={{...thS,fontSize:10}}>Unit</th>
                {grp.results.map((r,i)=><th key={i} style={{...thS,textAlign:"right",color:P.pri,fontWeight:700,minWidth:100}}>{r.periodLabel}<div style={{fontSize:9,color:P.txD,fontWeight:400}}>{r.fleetName}</div></th>)}
              </tr></thead>
              <tbody>{(()=>{let curSec2=null,curGrp2=null;return formulas.reduce((acc,f)=>{
                if(f.section){curSec2=f.section;curGrp2=null;acc.push(<tr key={`sec-${f.key}`} onClick={()=>togSec(f.section)} style={{cursor:"pointer"}}><td colSpan={2+grp.results.length} style={{padding:"14px 10px 6px",color:P.pri,fontWeight:700,fontSize:13,borderBottom:`2px solid ${P.pri}20`,background:P.secBg,userSelect:"none"}}>{collSec[f.section]?"▶":"▼"} {f.section}</td></tr>)}
                if(collSec[curSec2])return acc;
                if(f.group&&f.group!==curGrp2){curGrp2=f.group;acc.push(<tr key={`grp-${f.key}`} onClick={()=>togGrp(f.group)} style={{cursor:"pointer"}}><td colSpan={2+grp.results.length} style={{padding:"7px 10px 3px 22px",color:P.txD,fontWeight:600,fontSize:11,borderBottom:`1px solid ${P.bd}`,background:"#f8fafc",userSelect:"none"}}>{collGrp[f.group]?"▶":"▸"} {f.group}</td></tr>)}
                if(collGrp[curGrp2])return acc;
                acc.push(<tr key={f.key} style={{background:f.hl?P.hlBg:"transparent",borderBottom:`1px solid ${P.bd}`}}>
                  <td style={{padding:"5px 10px",color:f.hl?P.hlTx:P.txM,fontSize:12,fontWeight:f.hl?600:400,position:"sticky",left:0,background:f.hl?P.hlBg:P.card,zIndex:1}}>{f.label}</td>
                  <td style={{padding:"5px 6px",color:P.txD,fontSize:10,fontFamily:mf}}>{f.unit}</td>
                  {grp.results.map((r,pi)=>{const v=r.res?.[f.key];const d=f.cur?fmtC2(v):fmt(v,f.dec||2);return<td key={pi} style={{padding:"5px 8px",textAlign:"right",color:f.hl?P.hlTx:P.tx,fontWeight:f.hl?700:400,fontSize:12,fontFamily:mf}}>{d}</td>})}
                </tr>);return acc},[])})()}</tbody>
            </table></div>
          </div>))}
        </div>)}

        {/* ══ FORMULA EDITOR ══ */}
        {page==="formulas"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <ST icon="🧮">Formula Editor</ST>
            <div style={{display:"flex",gap:8}}><input type="text" placeholder="Search..." value={formulaSearch} onChange={e=>setFormulaSearch(e.target.value)} style={{...selS,width:160}}/><Btn onClick={()=>{const k="custom_"+Date.now();setFormulas(p=>[...p,{key:k,label:"New Variable",unit:"",formula:"0",section:"🔧 CUSTOM"}]);setEditingFormula(k);setEditText("0")}} color={P.gn} solid>+ Add</Btn><Btn onClick={()=>{setFormulas(defaultFormulas());setEditingFormula(null)}} color={P.rd} small>Reset</Btn></div>
          </div>
          <div style={{...cardS,padding:"10px 14px",marginBottom:10,display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",background:P.gnBg,borderColor:`${P.gn}33`}}>
            <span style={{color:P.gn,fontWeight:700,fontSize:12}}>🧪 Test:</span>
            <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{color:P.txM,fontSize:11,fontWeight:600}}>Period:</span><select value={testPeriodIdx} onChange={e=>setTestPeriodIdx(parseInt(e.target.value))} style={{...selS,fontSize:11}}>{Array.from({length:numPeriods},(_,i)=><option key={i} value={i}>P{i+1}</option>)}</select></div>
            <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{color:P.txM,fontSize:11,fontWeight:600}}>Fleet:</span><select value={testFleetIdx} onChange={e=>setTestFleetIdx(parseInt(e.target.value))} style={{...selS,fontSize:11}}>{activeFleets.map((f,i)=><option key={i} value={i}>{f.name}</option>)}</select></div>
          </div>
          <div style={{...cardS,overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%"}}>
            <thead><tr style={{background:P.secBg,borderBottom:`2px solid ${P.bdS}`}}>
              {[["#",28],["Key",105],["Label",180],["Unit",40],["Formula",null],["🧪",110],["",50]].map(([h,w],i)=>(<th key={i} style={{...thS,width:w||"auto",textAlign:i===5?"right":"left",color:i===5?P.gn:P.txM}}>{h}</th>))}
            </tr></thead>
            <tbody>{(()=>{let lS=null,lG=null,rn=0,curSec=null,curGrp=null;return formulas.filter(f=>{if(!formulaSearch)return true;const s=formulaSearch.toLowerCase();return[f.key,f.label,f.formula,f.section||"",f.group||""].some(x=>x.toLowerCase().includes(s))}).flatMap((f,i)=>{
              const rows=[];
              if(f.section&&f.section!==lS){lS=f.section;curSec=f.section;lG=null;curGrp=null;rows.push(<tr key={`s${i}`} onClick={()=>togSec(f.section)} style={{cursor:"pointer"}}><td colSpan={7} style={{padding:"14px 10px 6px",color:P.pri,fontWeight:700,fontSize:13,borderBottom:`2px solid ${P.pri}`,background:P.secBg,userSelect:"none"}}>{collSec[f.section]?"▶":"▼"} {f.section}</td></tr>)}
              if(collSec[curSec])return rows;
              if(f.group&&f.group!==lG){lG=f.group;curGrp=f.group;rows.push(<tr key={`g${i}`} onClick={()=>togGrp(f.group)} style={{cursor:"pointer"}}><td colSpan={7} style={{padding:"7px 10px 3px 22px",color:P.txD,fontWeight:600,fontSize:11,borderBottom:`1px solid ${P.bd}`,background:"#f8fafc",userSelect:"none"}}>{collGrp[f.group]?"▶":"▸"} {f.group}</td></tr>)}
              if(collGrp[curGrp])return rows;
              rn++;const isE=editingFormula===f.key;const tv=testResult?testResult[f.key]:"";const td=f.cur?fmtC2(tv):fmt(tv,f.dec||2);
              rows.push(<tr key={f.key} style={{borderBottom:`1px solid ${P.bd}`,background:isE?P.blBg:f.hl?P.hlBg:"transparent"}}>
                <td style={{padding:"4px 8px",color:P.txD,fontSize:10,fontFamily:mf}}>{rn}</td>
                <td style={{padding:"4px 8px"}}><code style={{color:P.pri,fontSize:10,fontFamily:mf,fontWeight:600}}>{f.key}</code></td>
                <td style={{padding:"4px 8px",color:f.hl?P.hlTx:P.txM,fontWeight:f.hl?600:400,fontSize:12}}>{f.label}</td>
                <td style={{padding:"4px 6px",color:P.txD,fontSize:10}}>{f.unit}</td>
                <td style={{padding:"4px 8px"}}>{isE?(<div style={{display:"flex",gap:5}}><input type="text" value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setFormulas(p=>p.map(ff=>ff.key===f.key?{...ff,formula:editText}:ff));setEditingFormula(null)}if(e.key==="Escape")setEditingFormula(null)}} style={{flex:1,padding:"4px 8px",background:P.input,border:`1.5px solid ${P.bl}`,borderRadius:6,color:P.tx,fontFamily:mf,fontSize:11}} autoFocus/><Btn onClick={()=>{setFormulas(p=>p.map(ff=>ff.key===f.key?{...ff,formula:editText}:ff));setEditingFormula(null)}} color={P.gn} small solid>✓</Btn></div>):(<code onClick={()=>{setEditingFormula(f.key);setEditText(f.formula)}} style={{color:"#475569",fontSize:10,fontFamily:mf,cursor:"pointer",display:"block",padding:"3px 8px",borderRadius:5,background:P.input}}>{f.formula}</code>)}</td>
                <td style={{padding:"4px 8px",textAlign:"right",fontWeight:f.hl?700:500,color:tv===""?P.txD:f.hl?P.gn:P.tx,fontSize:11,fontFamily:mf,background:P.gnBg+"55"}}>{td}</td>
                <td style={{padding:"4px 6px",textAlign:"center"}}>{!isE&&<button onClick={()=>{setEditingFormula(f.key);setEditText(f.formula)}} style={{background:P.blBg,border:`1px solid ${P.bl}22`,borderRadius:4,color:P.bl,cursor:"pointer",fontSize:10,padding:"2px 6px"}}>✏️</button>}</td>
              </tr>);return rows})})()}</tbody>
          </table></div>
        </div>)}

        {/* ══ TRUCKS ══ */}
        {page==="truck"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><ST icon="🚛">Truck Models</ST><div style={{display:"flex",gap:8}}><Btn onClick={()=>setTrucks(p=>[...p,mkTruck({truckName:`Truck ${p.length+1}`})])} solid>+ New</Btn><Btn onClick={()=>setTrucks(p=>[...p,mkTruckL()])} color={P.bl}>+ Liebherr</Btn><Btn onClick={()=>setTrucks(p=>[...p,mkTruck()])} color={P.gn}>+ XCMG</Btn></div></div>
          <div style={{...cardS,overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%"}}>
            <thead><tr style={{background:P.secBg,borderBottom:`2px solid ${P.bdS}`}}><th style={{...thS,minWidth:190,position:"sticky",left:0,background:P.secBg,zIndex:2}}>Parameter</th><th style={{...thS,minWidth:45,fontSize:10}}>Unit</th>{trucks.map((t,i)=>(<th key={t.id} style={{...thS,minWidth:145}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{color:mClr[i%mClr.length],fontWeight:700,fontSize:13}}>Model {i+1}</span>{trucks.length>1&&<button onClick={()=>setTrucks(p=>p.filter((_,j)=>j!==i))} style={{background:P.rdBg,border:`1px solid ${P.rd}22`,borderRadius:5,color:P.rd,cursor:"pointer",padding:"2px 7px"}}>×</button>}</div></th>))}</tr></thead>
            <tbody>{truckRows.map((r,i)=><CompRow key={i} {...r} models={trucks} onChange={updT}/>)}</tbody>
          </table></div>
        </div>)}

        {/* ══ DIGGERS ══ */}
        {page==="digger"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><ST icon="⛏️">Digger Models</ST><div style={{display:"flex",gap:8}}><Btn onClick={()=>setDiggers(p=>[...p,mkDigger({diggerName:`Digger ${p.length+1}`})])} solid>+ New</Btn><Btn onClick={()=>setDiggers(p=>[...p,mkDigger()])} color={P.bl}>+ 300t</Btn><Btn onClick={()=>setDiggers(p=>[...p,mkDigger4()])} color={P.gn}>+ 400t</Btn></div></div>
          <div style={{...cardS,overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%"}}>
            <thead><tr style={{background:P.secBg,borderBottom:`2px solid ${P.bdS}`}}><th style={{...thS,minWidth:190,position:"sticky",left:0,background:P.secBg,zIndex:2}}>Parameter</th><th style={{...thS,minWidth:45,fontSize:10}}>Unit</th>{diggers.map((d,i)=>(<th key={d.id} style={{...thS,minWidth:145}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{color:mClr[i%mClr.length],fontWeight:700,fontSize:13}}>Model {i+1}</span>{diggers.length>1&&<button onClick={()=>setDiggers(p=>p.filter((_,j)=>j!==i))} style={{background:P.rdBg,border:`1px solid ${P.rd}22`,borderRadius:5,color:P.rd,cursor:"pointer",padding:"2px 7px"}}>×</button>}</div></th>))}</tr></thead>
            <tbody>{diggerRows.map((r,i)=><CompRow key={i} {...r} models={diggers} onChange={updD}/>)}</tbody>
          </table></div>
        </div>)}

        {/* ══ SETTINGS ══ */}
        {page==="other"&&(<div style={{maxWidth:620}}><ST icon="⚙️">General Assumptions</ST><div style={{...cardS,padding:24}}>
          {[["moistureContent","Moisture Content","%",0.001],["exchangeRate","Exchange Rate (AUD:USD)","ratio",0.01],["discountRate","Discount Rate","%",0.005],["electricityCost","Electricity Cost","$/kWh",0.001],["dieselCost","Diesel Cost","$/L",0.01],["allInFitterPerYear","All-in Fitter Rate","$/hr"],["mannedOperator","Manned Operator","$/SMU"],["calendarTime","Calendar Time","hrs/yr"],["diggerFleetRoundingThreshold","Digger Rounding","frac",0.05]].map(([k,l,u,s])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}><div style={{flex:1,color:P.txM,fontSize:14,fontWeight:500}}>{l}</div><input type="number" value={otherA[k]} onChange={e=>uO(k,parseFloat(e.target.value)||0)} step={s||0.01} style={{width:145,padding:"7px 12px",background:P.input,border:`1px solid ${P.bd}`,borderRadius:7,color:P.tx,fontFamily:mf,fontSize:14,textAlign:"right"}}/><span style={{color:P.txD,fontSize:12,fontWeight:500,minWidth:55}}>{u}</span></div>))}
        </div>
          <ST icon="💾">Data Management</ST>
          <div style={{...cardS,padding:20}}>
            <p style={{color:P.txM,fontSize:13,marginBottom:14}}>Your data is auto-saved to browser storage. Note: CSV file data is not persisted — you will need to re-import CSVs after refreshing. All other settings, scenarios, fleet combos, formulas, and manual schedule data are preserved.</p>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <Btn onClick={function(){window.location.reload()}} color={P.rd} small>Reset to Defaults</Btn>
              <Btn onClick={function(){var blob=new Blob([JSON.stringify({trucks:trucks,diggers:diggers,otherA:otherA,formulas:formulas,fleets:fleets,scenarios:scenarios.map(function(s){return Object.assign({},s,{csvData:null})})},null,2)],{type:"application/json"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="mining_fleet_config_backup.json";a.click();URL.revokeObjectURL(url)}} color={P.bl} small>Export Config (JSON)</Btn>
              <Btn onClick={function(){var inp=document.createElement("input");inp.type="file";inp.accept=".json";inp.onchange=function(e){var f=e.target.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(ev){try{var d=JSON.parse(ev.target.result);if(d.trucks)setTrucks(d.trucks);if(d.diggers)setDiggers(d.diggers);if(d.otherA)setOtherA(d.otherA);if(d.formulas)setFormulas(d.formulas);if(d.fleets)setFleets(d.fleets);if(d.scenarios)setScenarios(d.scenarios);alert("Configuration restored!")}catch(err){alert("Error: "+err.message)}};rd.readAsText(f)};inp.click()}} color={P.gn} small>Import Config (JSON)</Btn>
            </div>

          </div>
        </div>)}

        {/* ══ COMPARISON ══ */}
        {page==="comparison"&&(<div>
          <ST icon="⚖️">Scenario Comparison</ST>
          <p style={{color:P.txM,fontSize:13,marginBottom:16}}>Side-by-side comparison of key metrics across all scenarios.</p>
          {(()=>{
            const scnTots=scenarios.map(function(s){
              var aFl=fleets.filter(function(f){return s.activeFleetIds.length===0||s.activeFleetIds.includes(f.id)});
              var np2=s.csvData?s.csvData.np:s.manualData.length;
              var t={mined:0,cost:0,costExc:0,trkCapex:0,digCapex:0,chgCapex:0,trucks:0,diggers:0,chargers:0};
              for(var pi=0;pi<np2;pi++){for(var fi2=0;fi2<aFl.length;fi2++){var fleet=aFl[fi2];
                var psIdx2=s.fleetPhysicalSets[fleet.id]||0;
                var mapping=s.fieldMappings[psIdx2]||s.fieldMappings[0];
                var pd2=null;
                if(s.csvData&&mapping){pd2={days:s.csvData.gv("Days",pi)||91};pd2.hours=s.csvData.gv("Hours",pi)||pd2.days*24;for(var pfi=0;pfi<PHYS_FIELDS.length;pfi++){var pf=PHYS_FIELDS[pfi];pd2[pf.key]=mapping.fields[pf.key]?s.csvData.gv(mapping.fields[pf.key],pi):0}}
                else{pd2=s.manualData[pi]}
                if(!pd2)continue;
                var ti2=Math.min(fleet.truckIdx,trucks.length-1),di2=Math.min(fleet.diggerIdx,diggers.length-1);
                var res2=calcWithFormulas({totalMined:(pd2.totalMined||0)*s.unitMul,oreMined:(pd2.oreMined||0)*s.unitMul,totalRampMined:(pd2.totalRampMined||pd2.totalMined||0)*s.unitMul,avgLoadedTravelTime:pd2.avgLoadedTravelTime||0,avgUnloadedTravelTime:pd2.avgUnloadedTravelTime||0,avgNetPower:pd2.avgNetPower||0,avgTkphDelay:pd2.avgTkphDelay||0,schedPeriod:s.schedPeriod,calendarDays:pd2.days||91,calendarHours:pd2.hours||2184,truck:trucks[ti2],digger:diggers[di2],other:otherA,fleet:fleet},formulas);
                if(!res2)continue;
                t.mined+=(pd2.totalMined||0)*s.unitMul;t.cost+=res2.totCost||0;t.costExc+=res2.totExc||0;
                t.trkCapex+=res2.trkCapex||0;t.digCapex+=res2.digCapex||0;t.chgCapex+=res2.chgCapex||0;
                t.trucks=Math.max(t.trucks,res2.trkReqR||0);t.diggers=Math.max(t.diggers,res2.digFleet||0);t.chargers=Math.max(t.chargers,res2.chgStaRnd||0);
              }}
              t.cpt=t.mined>0?t.cost/t.mined:0;t.cptExc=t.mined>0?t.costExc/t.mined:0;
              return t;
            });
            var cmpRows=[
              {label:"Total Mined",key:"mined",unit:"t",fn:fmtInt},
              {label:"Total Cost (inc Cpx)",key:"cost",unit:"AUD",fn:fmtCur,hl:1},
              {label:"Cost per Tonne (inc Cpx)",key:"cpt",unit:"$/t",fn:fmtC2,hl:1},
              {label:"Total Cost (exc Cpx)",key:"costExc",unit:"AUD",fn:fmtCur},
              {label:"Cost per Tonne (exc Cpx)",key:"cptExc",unit:"$/t",fn:fmtC2},
              {sep:true,label:"Fleet Sizing"},
              {label:"Peak Trucks Required",key:"trucks",unit:"#",fn:fmtInt},
              {label:"Peak Diggers Required",key:"diggers",unit:"#",fn:fmtInt},
              {label:"Peak Charger Stations",key:"chargers",unit:"#",fn:fmtInt},
              {sep:true,label:"Capital Expenditure"},
              {label:"Truck Capex (total)",key:"trkCapex",unit:"AUD",fn:fmtCur},
              {label:"Digger Capex (total)",key:"digCapex",unit:"AUD",fn:fmtCur},
              {label:"Charger Capex (total)",key:"chgCapex",unit:"AUD",fn:fmtCur},
            ];
            return(<div style={cardS}><div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontFamily:ff,fontSize:12,width:"100%",minWidth:500}}>
              <thead><tr style={{background:P.secBg,borderBottom:"2px solid "+P.bdS}}>
                <th style={Object.assign({},thS,{minWidth:250,position:"sticky",left:0,background:P.secBg,zIndex:2})}>Metric</th>
                <th style={thS}>Unit</th>
                {scenarios.map(function(s,si){return(<th key={si} style={Object.assign({},thS,{textAlign:"right",minWidth:140,color:si===activeScnIdx?P.pri:P.txM})}>
                  <div style={{fontWeight:700,fontSize:13}}>{s.name}</div>
                  <div style={{fontSize:10,fontWeight:400,color:P.txD}}>{s.csvData?s.csvData.np+" periods":s.manualData.length+" periods"}</div>
                </th>)})}
              </tr></thead>
              <tbody>{cmpRows.map(function(r,ri){
                if(r.sep)return(<tr key={ri}><td colSpan={2+scenarios.length} style={{padding:"14px 10px 6px",color:P.pri,fontWeight:700,fontSize:13,borderBottom:"2px solid "+P.pri+"20",background:P.secBg}}>{r.label}</td></tr>);
                var vals=scnTots.map(function(t){return t[r.key]||0});
                var isCostMetric=r.key.indexOf("cost")>=0||r.key.indexOf("cpt")>=0||r.key.indexOf("Capex")>=0;
                var posVals=vals.filter(function(v){return v>0});
                var bestVal=isCostMetric?(posVals.length?Math.min.apply(null,posVals):0):Math.max.apply(null,vals);
                return(<tr key={ri} style={{background:r.hl?P.hlBg:"transparent",borderBottom:"1px solid "+P.bd}}>
                  <td style={{padding:"7px 14px",color:r.hl?P.hlTx:P.txM,fontSize:13,fontWeight:r.hl?600:400,position:"sticky",left:0,background:r.hl?P.hlBg:P.card,zIndex:1}}>{r.label}</td>
                  <td style={{padding:"7px 8px",color:P.txD,fontSize:11,fontFamily:mf}}>{r.unit}</td>
                  {scnTots.map(function(t,si){var v=t[r.key]||0;var isBest=v===bestVal&&v>0;
                    return(<td key={si} style={{padding:"7px 12px",textAlign:"right",fontFamily:mf,fontSize:13,fontWeight:r.hl?700:isBest?700:400,color:isBest?P.gn:r.hl?P.hlTx:P.tx,background:isBest?P.gnBg+"66":"transparent"}}>{r.fn(v)}{isBest?" ✓":""}</td>)})}
                </tr>);
              })}</tbody>
            </table></div></div>);
          })()}
        </div>)}

        {/* ══ CHARTS — ASSUMPTIONS ══ */}
        {page==="charts_assumptions"&&(<div>
          <ST icon="📈">Fleet Parameter Comparison</ST>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Truck Capex & Power System</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={trucks.map(function(t){return{name:t.truckName.substring(0,15),Capex:t.totalTruckCapex,PowerSystem:t.powerSystemCost}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} tickFormatter={function(v){return "$"+(v/1e6).toFixed(1)+"M"}}/><Tooltip formatter={function(v){return fmtCur(v)}}/>
                <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="Capex" fill={mClr[0]}/><Bar dataKey="PowerSystem" fill={mClr[1]}/>
              </BarChart></ResponsiveContainer>
            </div>
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Truck TUM Parameters (%)</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={trucks.map(function(t){return{name:t.truckName.substring(0,15),Availability:t.availability*100,UoA:t.useOfAvailability*100,OE:t.operatingEfficiency*100,PerfEff:t.performanceEfficiency*100}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} domain={[0,100]}/><Tooltip/>
                <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="Availability" fill={mClr[0]}/><Bar dataKey="UoA" fill={mClr[1]}/><Bar dataKey="OE" fill={mClr[2]}/><Bar dataKey="PerfEff" fill={mClr[3]}/>
              </BarChart></ResponsiveContainer>
            </div>
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Digger Dig Rate & Capex</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={diggers.map(function(d){return{name:d.diggerName.substring(0,18),DigRate:d.effectiveDigRate,CapexM:d.totalCapex/1e6}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10}/><Tooltip/>
                <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="DigRate" fill={mClr[0]} name="Dig Rate (t/hr)"/><Bar dataKey="CapexM" fill={mClr[1]} name="Capex ($M)"/>
              </BarChart></ResponsiveContainer>
            </div>
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Battery & Charging</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={trucks.map(function(t){return{name:t.truckName.substring(0,15),BatteryCap:t.averageBatteryUsableCapacity,ChargeTime:t.chargingTime,LifeCyclesX100:t.equivalentFullLifeCycles/100}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10}/><Tooltip/>
                <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="BatteryCap" fill={mClr[0]} name="Usable Cap (kWh)"/><Bar dataKey="ChargeTime" fill={mClr[1]} name="Charge Time (min)"/><Bar dataKey="LifeCyclesX100" fill={mClr[2]} name="Life Cycles (x100)"/>
              </BarChart></ResponsiveContainer>
            </div>
          </div>
        </div>)}

        {/* ══ CHARTS — SETUP ══ */}
        {page==="charts_setup"&&(<div>
          <ST icon="📈">Fleet & Formula Overview</ST>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Fleet Load Time Breakdown (Stacked)</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={fleets.map(function(fl){var trk=trucks[Math.min(fl.truckIdx,trucks.length-1)];return{name:fl.name,Load:fl.loadTime||0,SpotLoad:trk.spotTimeLoad||0,QueueLoad:trk.queueTimeLoad||0,SpotDump:trk.spotTimeDump||0,QueueDump:trk.queueTimeDump||0,Dump:trk.dumpTime||0}})} margin={{top:10,right:20,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={10} label={{value:"min",angle:-90,position:"insideLeft",fontSize:10}}/><Tooltip/>
                <Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="SpotLoad" stackId="a" fill={mClr[0]} name="Spot@Load"/><Bar dataKey="QueueLoad" stackId="a" fill={mClr[1]} name="Queue@Load"/><Bar dataKey="Load" stackId="a" fill={mClr[2]} name="Load"/><Bar dataKey="SpotDump" stackId="a" fill={mClr[3]} name="Spot@Dump"/><Bar dataKey="QueueDump" stackId="a" fill={mClr[4]} name="Queue@Dump"/><Bar dataKey="Dump" stackId="a" fill={mClr[5]} name="Dump"/>
              </BarChart></ResponsiveContainer>
            </div>
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Formulas by Section</div>
              <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={
                (function(){var secs={};formulas.forEach(function(f){var s=f.section||"Other";if(!secs[s])secs[s]=0;secs[s]++});return Object.keys(secs).map(function(s){return{name:s.replace(/[^\w\s\u2014]/g,"").trim().substring(0,22),value:secs[s]}})})()
              } cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2} dataKey="value" label={function(e){return e.value}}>
                {Object.keys((function(){var secs={};formulas.forEach(function(f){var s=f.section||"Other";if(!secs[s])secs[s]=0;secs[s]++});return secs})()).map(function(_,i){return <Cell key={i} fill={mClr[i%mClr.length]}/>})}
              </Pie><Tooltip/><Legend wrapperStyle={{fontSize:9}}/></PieChart></ResponsiveContainer>
            </div>
          </div>
        </div>)}

        {/* ══ CHARTS — RESULTS ══ */}
        {page==="charts_results"&&(<div>
          <ST icon="📈">Results Charts — {scn.name}</ST>
          {results.length===0?<p style={{color:P.txD}}>No results data.</p>:(function(){
            var pData=results.filter(function(r){return r.res});
            // Build physicals data per period, aggregating across all active fleets
            var physData=[];
            for(var pi2=0;pi2<numPeriods;pi2++){
              var pRow={period:"P"+(pi2+1),Ore:0,Waste:0,RampBuild:0,Fe:0,Si:0,Al:0,P:0,oreCount:0};
              for(var fi3=0;fi3<activeFleets.length;fi3++){
                var fl3=activeFleets[fi3];
                var pd3=getPd(pi2,fl3);
                if(!pd3)continue;
                if(!pRow.periodSet){pRow.period=pd3.periodLabel||pRow.period;pRow.periodSet=true}
                pRow.Ore+=(pd3.oreMined||0)*scn.unitMul;
                pRow.Waste+=(pd3.wasteMined||0)*scn.unitMul;
                pRow.RampBuild+=(pd3.totalRampMined||0)*scn.unitMul;
                // For grades, take from whichever fleet has ore (weighted average or just first non-zero)
                if((pd3.oreFePct||0)>0&&pRow.Fe===0){pRow.Fe=pd3.oreFePct;pRow.Si=pd3.oreSiPct||0;pRow.Al=pd3.oreAlPct||0;pRow.P=pd3.orePPct||0}
              }
              physData.push(pRow);
            }
            return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {/* Physicals: Tonnage stacked bar */}
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Mining Physicals — Tonnage</div>
              <ChartToggles series={[{key:"Ore",label:"Ore",color:mClr[0]},{key:"Waste",label:"Waste",color:mClr[1]},{key:"RampBuild",label:"Ramp Build",color:mClr[2]}]} hidden={hiddenSeries} onToggle={togSeries}/>
              <ResponsiveContainer width="100%" height={300}><BarChart data={physData} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} tickFormatter={function(v){return(v/1e3).toFixed(0)+"k"}}/><Tooltip formatter={function(v){return fmtInt(v)+" t"}}/>
                <Legend wrapperStyle={{fontSize:11}}/>{isVis("Ore")&&<Bar dataKey="Ore" stackId="a" fill={mClr[0]}/>}{isVis("Waste")&&<Bar dataKey="Waste" stackId="a" fill={mClr[1]}/>}{isVis("RampBuild")&&<Bar dataKey="RampBuild" stackId="a" fill={mClr[2]} name="Ramp Build"/>}
              </BarChart></ResponsiveContainer>
            </div>
            {/* Physicals: Ore grade combo chart */}
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Ore Tonnage & Grade</div>
              <ChartToggles series={[{key:"cOre",label:"Ore (bar)",color:mClr[0]},{key:"cFe",label:"Fe%",color:"#dc2626"},{key:"cSi",label:"Si%",color:"#2563eb"},{key:"cAl",label:"Al%",color:"#059669"},{key:"cP",label:"P%",color:"#d97706"}]} hidden={hiddenSeries} onToggle={togSeries}/>
              <ResponsiveContainer width="100%" height={300}><ComposedChart data={physData} margin={{top:10,right:50,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={10} angle={-20} textAnchor="end"/><YAxis yAxisId="left" fontSize={10} tickFormatter={function(v){return(v/1e3).toFixed(0)+"k"}}/><YAxis yAxisId="right" orientation="right" fontSize={10} tickFormatter={function(v){return v.toFixed(1)+"%"}}/><Tooltip/>
                <Legend wrapperStyle={{fontSize:10}}/>{isVis("cOre")&&<Bar yAxisId="left" dataKey="Ore" fill={mClr[0]} name="Ore (t)" opacity={0.6}/>}{isVis("cFe")&&<Line yAxisId="right" type="monotone" dataKey="Fe" stroke="#dc2626" strokeWidth={2} name="Fe%" dot={{r:3}}/>}{isVis("cSi")&&<Line yAxisId="right" type="monotone" dataKey="Si" stroke="#2563eb" strokeWidth={2} name="Si%" dot={{r:3}}/>}{isVis("cAl")&&<Line yAxisId="right" type="monotone" dataKey="Al" stroke="#059669" strokeWidth={2} name="Al%" dot={{r:3}}/>}{isVis("cP")&&<Line yAxisId="right" type="monotone" dataKey="P" stroke="#d97706" strokeWidth={2} name="P%" dot={{r:3}}/>}
              </ComposedChart></ResponsiveContainer>
            </div>
            {/* Cost per tonne */}
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Cost per Tonne by Period</div>
              <ChartToggles series={[{key:"TotalCPT",label:"Total $/t",color:mClr[0]},{key:"TruckCPT",label:"Truck $/t",color:mClr[1]},{key:"DiggerCPT",label:"Digger $/t",color:mClr[2]}]} hidden={hiddenSeries} onToggle={togSeries}/>
              <ResponsiveContainer width="100%" height={300}><LineChart data={pData.map(function(r){return{period:r.periodLabel,TotalCPT:r.res.totPerT||0,TruckCPT:r.res.trkPerT||0,DiggerCPT:r.res.digOpxPerT||0}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} tickFormatter={function(v){return "$"+v.toFixed(1)}}/><Tooltip formatter={function(v){return fmtC2(v)}}/>
                <Legend wrapperStyle={{fontSize:11}}/>{isVis("TotalCPT")&&<Line type="monotone" dataKey="TotalCPT" stroke={mClr[0]} strokeWidth={2} name="Total $/t"/>}{isVis("TruckCPT")&&<Line type="monotone" dataKey="TruckCPT" stroke={mClr[1]} strokeWidth={2} name="Truck $/t"/>}{isVis("DiggerCPT")&&<Line type="monotone" dataKey="DiggerCPT" stroke={mClr[2]} strokeWidth={2} name="Digger $/t"/>}
              </LineChart></ResponsiveContainer>
            </div>
            {/* Total cost stacked */}
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Total Cost Breakdown (Stacked)</div>
              <ChartToggles series={[{key:"TruckOpex",label:"Truck exc Cpx",color:mClr[0]},{key:"DiggerOpex",label:"Digger Opex",color:mClr[1]},{key:"Rehandle",label:"Rehandle",color:mClr[2]}]} hidden={hiddenSeries} onToggle={togSeries}/>
              <ResponsiveContainer width="100%" height={300}><BarChart data={pData.map(function(r){return{period:r.periodLabel,TruckOpex:r.res.totTrkExc||0,DiggerOpex:r.res.digOpxTotal||0,Rehandle:r.res.digRehandle||0}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} tickFormatter={function(v){return "$"+(v/1e6).toFixed(1)+"M"}}/><Tooltip formatter={function(v){return fmtCur(v)}}/>
                <Legend wrapperStyle={{fontSize:11}}/>{isVis("TruckOpex")&&<Bar dataKey="TruckOpex" stackId="a" fill={mClr[0]} name="Truck exc Cpx"/>}{isVis("DiggerOpex")&&<Bar dataKey="DiggerOpex" stackId="a" fill={mClr[1]} name="Digger Opex"/>}{isVis("Rehandle")&&<Bar dataKey="Rehandle" stackId="a" fill={mClr[2]} name="Rehandle"/>}
              </BarChart></ResponsiveContainer>
            </div>
            {/* Fleet sizing */}
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Fleet Sizing by Period</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={pData.map(function(r){return{period:r.periodLabel,Trucks:r.res.trkReqR||0,Diggers:r.res.digFleet||0,Chargers:r.res.chgStaRnd||0}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} allowDecimals={false}/><Tooltip/>
                <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="Trucks" fill={mClr[0]}/><Bar dataKey="Diggers" fill={mClr[1]}/><Bar dataKey="Chargers" fill={mClr[2]}/>
              </BarChart></ResponsiveContainer>
            </div>
            {/* Cost split pie */}
            <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Cost Split — Digger vs Truck</div>
              <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={
                (function(){var tc=0,dc=0,rh=0;results.forEach(function(r){if(!r.res)return;tc+=r.res.totTrkExc||0;dc+=r.res.digOpxTotal||0;rh+=r.res.digRehandle||0});return[{name:"Truck",value:tc},{name:"Digger",value:dc},{name:"Rehandle",value:rh}]})()
              } cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3} dataKey="value" label={function(e){return e.name+": "+fmtCur(e.value)}}>
                <Cell fill={mClr[0]}/><Cell fill={mClr[1]}/><Cell fill={mClr[2]}/>
              </Pie><Tooltip formatter={function(v){return fmtCur(v)}}/></PieChart></ResponsiveContainer>
            </div>
            {/* Digger opex stacked full width */}
            <div style={Object.assign({},cardS,{gridColumn:"1 / -1"})}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Digger Opex Components (Stacked)</div>
              <ResponsiveContainer width="100%" height={300}><BarChart data={pData.map(function(r){return{period:r.periodLabel,Diesel:r.res.digOpxDiesel||0,Maint:r.res.digOpxMaint||0,Parts:r.res.digOpxParts||0,GET:r.res.digOpxGET||0,Operator:r.res.digOpxOperator||0,Other:(r.res.digOpxOil||0)+(r.res.digOpxCable||0)+(r.res.digOpxTracks||0)+(r.res.digOpxTires||0)+(r.res.digOpxFMS||0)+(r.res.digOpxBattery||0)+(r.res.digOpxMaterials||0)}})} margin={{top:10,right:20,left:10,bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={10} angle={-20} textAnchor="end"/><YAxis fontSize={10} tickFormatter={function(v){return "$"+(v/1e6).toFixed(1)+"M"}}/><Tooltip formatter={function(v){return fmtCur(v)}}/>
                <Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="Diesel" stackId="a" fill="#3b82f6" name="Diesel/Elec"/><Bar dataKey="Maint" stackId="a" fill="#10b981" name="Maint Labour"/><Bar dataKey="Parts" stackId="a" fill="#f59e0b" name="Parts PM05"/><Bar dataKey="GET" stackId="a" fill="#ef4444" name="GET"/><Bar dataKey="Operator" stackId="a" fill="#8b5cf6" name="Operator"/><Bar dataKey="Other" stackId="a" fill="#6b7280" name="Other"/>
              </BarChart></ResponsiveContainer>
            </div>
          </div>)})()}
        </div>)}

        {/* ══ CHARTS — COMPARE ══ */}
        {page==="charts_compare"&&(<div>
          <ST icon="📈">Scenario Comparison Charts</ST>
          {(function(){
            var scnData=scenarios.map(function(s){
              var aFl=fleets.filter(function(f){return s.activeFleetIds.length===0||s.activeFleetIds.includes(f.id)});
              var np2=s.csvData?s.csvData.np:s.manualData.length;
              var t={name:s.name,mined:0,cost:0,costExc:0,trkCapex:0,digCapex:0,chgCapex:0,trucks:0,diggers:0,chargers:0};
              for(var pi=0;pi<np2;pi++){for(var fi2=0;fi2<aFl.length;fi2++){var fleet=aFl[fi2];
                var psIdx2=s.fleetPhysicalSets[fleet.id]||0;var mapping=s.fieldMappings[psIdx2]||s.fieldMappings[0];var pd2=null;
                if(s.csvData&&mapping){pd2={days:s.csvData.gv("Days",pi)||91};pd2.hours=s.csvData.gv("Hours",pi)||pd2.days*24;for(var pfi=0;pfi<PHYS_FIELDS.length;pfi++){var pf=PHYS_FIELDS[pfi];pd2[pf.key]=mapping.fields[pf.key]?s.csvData.gv(mapping.fields[pf.key],pi):0}}
                else{pd2=s.manualData[pi]}
                if(!pd2)continue;var ti2=Math.min(fleet.truckIdx,trucks.length-1),di2=Math.min(fleet.diggerIdx,diggers.length-1);
                var res2=calcWithFormulas({totalMined:(pd2.totalMined||0)*s.unitMul,oreMined:(pd2.oreMined||0)*s.unitMul,totalRampMined:(pd2.totalRampMined||pd2.totalMined||0)*s.unitMul,avgLoadedTravelTime:pd2.avgLoadedTravelTime||0,avgUnloadedTravelTime:pd2.avgUnloadedTravelTime||0,avgNetPower:pd2.avgNetPower||0,avgTkphDelay:pd2.avgTkphDelay||0,schedPeriod:s.schedPeriod,calendarDays:pd2.days||91,calendarHours:pd2.hours||2184,truck:trucks[ti2],digger:diggers[di2],other:otherA,fleet:fleet},formulas);
                if(!res2)continue;t.mined+=(pd2.totalMined||0)*s.unitMul;t.cost+=res2.totCost||0;t.costExc+=res2.totExc||0;
                t.trkCapex+=res2.trkCapex||0;t.digCapex+=res2.digCapex||0;t.chgCapex+=res2.chgCapex||0;
                t.trucks=Math.max(t.trucks,res2.trkReqR||0);t.diggers=Math.max(t.diggers,res2.digFleet||0);t.chargers=Math.max(t.chargers,res2.chgStaRnd||0);
              }}
              t.cpt=t.mined>0?t.cost/t.mined:0;t.cptExc=t.mined>0?t.costExc/t.mined:0;return t;
            });
            return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Total Cost by Scenario</div>
                <ResponsiveContainer width="100%" height={300}><BarChart data={scnData} margin={{top:10,right:20,left:10,bottom:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={10} tickFormatter={function(v){return "$"+(v/1e6).toFixed(0)+"M"}}/><Tooltip formatter={function(v){return fmtCur(v)}}/>
                  <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="cost" fill={mClr[0]} name="Inc Capex"/><Bar dataKey="costExc" fill={mClr[1]} name="Exc Capex"/>
                </BarChart></ResponsiveContainer>
              </div>
              <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Cost per Tonne by Scenario</div>
                <ResponsiveContainer width="100%" height={300}><BarChart data={scnData} margin={{top:10,right:20,left:10,bottom:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={10} tickFormatter={function(v){return "$"+v.toFixed(2)}}/><Tooltip formatter={function(v){return fmtC2(v)}}/>
                  <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="cpt" fill={mClr[0]} name="$/t Inc Cpx"/><Bar dataKey="cptExc" fill={mClr[1]} name="$/t Exc Cpx"/>
                </BarChart></ResponsiveContainer>
              </div>
              <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Peak Fleet Sizing</div>
                <ResponsiveContainer width="100%" height={300}><BarChart data={scnData} margin={{top:10,right:20,left:10,bottom:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={10} allowDecimals={false}/><Tooltip/>
                  <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="trucks" fill={mClr[0]} name="Trucks"/><Bar dataKey="diggers" fill={mClr[1]} name="Diggers"/><Bar dataKey="chargers" fill={mClr[2]} name="Chargers"/>
                </BarChart></ResponsiveContainer>
              </div>
              <div style={cardS}><div style={{padding:"16px 16px 4px",fontWeight:700,color:P.pri,fontSize:13}}>Capex Breakdown (Stacked)</div>
                <ResponsiveContainer width="100%" height={300}><BarChart data={scnData} margin={{top:10,right:20,left:10,bottom:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={10} tickFormatter={function(v){return "$"+(v/1e6).toFixed(0)+"M"}}/><Tooltip formatter={function(v){return fmtCur(v)}}/>
                  <Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="trkCapex" stackId="a" fill={mClr[0]} name="Truck"/><Bar dataKey="digCapex" stackId="a" fill={mClr[1]} name="Digger"/><Bar dataKey="chgCapex" stackId="a" fill={mClr[2]} name="Charger"/>
                </BarChart></ResponsiveContainer>
              </div>
            </div>);
          })()}
          {/* Physicals per scenario - stacked vertically */}
          <ST icon="⛏️">Mining Physicals by Scenario</ST>
          {scenarios.map(function(s,si){
            var np3=s.csvData?s.csvData.np:s.manualData.length;
            var aFl2=fleets.filter(function(f){return s.activeFleetIds.length===0||s.activeFleetIds.includes(f.id)});
            if(aFl2.length===0)return null;
            var physData3=[];
            for(var pi3=0;pi3<np3;pi3++){
              var pRow3={period:"P"+(pi3+1),Ore:0,Waste:0,RampBuild:0,Fe:0,Si:0,Al:0,P:0};
              for(var fi4=0;fi4<aFl2.length;fi4++){
                var fl4=aFl2[fi4];
                var psIdx3=s.fleetPhysicalSets[fl4.id]||0;
                var mapping3=s.fieldMappings[psIdx3]||s.fieldMappings[0];
                var pd4=null;
                if(s.csvData&&mapping3){
                  pd4={periodLabel:s.csvData.gs("Period",pi3)||("P"+(pi3+1))};
                  for(var pfi2=0;pfi2<PHYS_FIELDS.length;pfi2++){var pf2=PHYS_FIELDS[pfi2];pd4[pf2.key]=mapping3.fields[pf2.key]?s.csvData.gv(mapping3.fields[pf2.key],pi3):0}
                } else if(s.manualData[pi3]){
                  pd4=Object.assign({},s.manualData[pi3]);pd4.periodLabel=pd4.periodLabel||("P"+(pi3+1));
                }
                if(!pd4)continue;
                if(!pRow3.periodSet){pRow3.period=pd4.periodLabel;pRow3.periodSet=true}
                pRow3.Ore+=(pd4.oreMined||0)*s.unitMul;
                pRow3.Waste+=(pd4.wasteMined||0)*s.unitMul;
                pRow3.RampBuild+=(pd4.totalRampMined||0)*s.unitMul;
                if((pd4.oreFePct||0)>0&&pRow3.Fe===0){pRow3.Fe=pd4.oreFePct;pRow3.Si=pd4.oreSiPct||0;pRow3.Al=pd4.oreAlPct||0;pRow3.P=pd4.orePPct||0}
              }
              physData3.push(pRow3);
            }
            return(<div key={si} style={{marginBottom:24}}>
              <div style={{padding:"8px 14px",background:P.priBg,borderRadius:"8px 8px 0 0",border:"1px solid "+P.pri+"22",borderBottom:"none"}}><span style={{color:P.pri,fontWeight:700,fontSize:14}}>{s.name}</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,border:"1px solid "+P.bd,borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
                <div style={{padding:12,borderRight:"1px solid "+P.bd}}>
                  <div style={{fontWeight:600,color:P.txM,fontSize:12,marginBottom:4}}>Tonnage (Stacked)</div>
                  <ResponsiveContainer width="100%" height={250}><BarChart data={physData3} margin={{top:5,right:10,left:5,bottom:35}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={9} angle={-20} textAnchor="end"/><YAxis fontSize={9} tickFormatter={function(v){return(v/1e3).toFixed(0)+"k"}}/><Tooltip formatter={function(v){return fmtInt(v)+" t"}}/>
                    <Legend wrapperStyle={{fontSize:9}}/><Bar dataKey="Ore" stackId="a" fill={mClr[0]}/><Bar dataKey="Waste" stackId="a" fill={mClr[1]}/><Bar dataKey="RampBuild" stackId="a" fill={mClr[2]} name="Ramp Build"/>
                  </BarChart></ResponsiveContainer>
                </div>
                <div style={{padding:12}}>
                  <div style={{fontWeight:600,color:P.txM,fontSize:12,marginBottom:4}}>Ore & Grade</div>
                  <ResponsiveContainer width="100%" height={250}><ComposedChart data={physData3} margin={{top:5,right:40,left:5,bottom:35}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.bd}/><XAxis dataKey="period" fontSize={9} angle={-20} textAnchor="end"/><YAxis yAxisId="left" fontSize={9} tickFormatter={function(v){return(v/1e3).toFixed(0)+"k"}}/><YAxis yAxisId="right" orientation="right" fontSize={9} tickFormatter={function(v){return v.toFixed(1)+"%"}}/><Tooltip/>
                    <Legend wrapperStyle={{fontSize:9}}/><Bar yAxisId="left" dataKey="Ore" fill={mClr[0]} name="Ore (t)" opacity={0.5}/><Line yAxisId="right" type="monotone" dataKey="Fe" stroke="#dc2626" strokeWidth={2} name="Fe%" dot={{r:2}}/><Line yAxisId="right" type="monotone" dataKey="Si" stroke="#2563eb" strokeWidth={2} name="Si%" dot={{r:2}}/><Line yAxisId="right" type="monotone" dataKey="Al" stroke="#059669" strokeWidth={2} name="Al%" dot={{r:2}}/><Line yAxisId="right" type="monotone" dataKey="P" stroke="#d97706" strokeWidth={2} name="P%" dot={{r:2}}/>
                  </ComposedChart></ResponsiveContainer>
                </div>
              </div>
            </div>);
          })}
        </div>)}
      </div>
    </div>
  );
}
