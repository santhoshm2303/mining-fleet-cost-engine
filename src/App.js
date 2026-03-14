import { useState, useMemo, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   MINING FLEET COST ENGINE v3
   Multi-Period · Multi-Fleet · Field Mapping · Formula Editor
   ═══════════════════════════════════════════════════════════════════════ */

let _id = 100;
const uid = () => "m" + (++_id);

// ─── MODEL FACTORIES ───────────────────────────────────────────────────
const mkTruck = (ov = {}) => ({ id: uid(),
  truckName: "XCMG XGE150 Plus 10YMP", payload: 85, powerSource: "Battery - Charge",
  batterySize: 828, economicLife: 80000, tkphLimit: 254.2,
  availability: 0.86, useOfAvailability: 0.96, operatingEfficiency: 0.79, utToSmuConversion: 1.06,
  spotLoadQueueDump: 2.46, performanceEfficiency: 0.99,
  totalTruckCapex: 2185181.43, capexPerSmuHour: 27.31, powerSystemCost: 383890,
  opexPerSmuHour: 156.54, operatorRate: 133,
  nominalBatteryCapacityNew: 828, averageBatteryUsableCapacity: 563.04,
  travelToRechargeEnergy: 10, travelToSwapChargerStationTime: 2.96,
  chargerQueueTime: 0, chargerConnectionPositioningTime: 0,
  equivalentFullLifeCycles: 4500, chargingTime: 50, rechargeRateC: 1.2,
  swapTotalSwapTime: 14.5,
  chargerOperatingTime: 6740.82, demandResponseAllowance: 0, numBatteriesPerStation: 1,
  totalChargerCapex: 4703194.09, avgChargerEffectiveHours: 6740.82, totalChargerOandO: 70.19,
  ...ov });
const mkTruckL = () => mkTruck({ truckName: "Liebherr BET264 10ymp", payload: 240, batterySize: 2580, economicLife: 84000, tkphLimit: 1400, availability: 0.88, useOfAvailability: 0.936, operatingEfficiency: 0.803, spotLoadQueueDump: 4.32, totalTruckCapex: 11198255.71, capexPerSmuHour: 133.31, powerSystemCost: 2313980, opexPerSmuHour: 478.80, nominalBatteryCapacityNew: 2580, averageBatteryUsableCapacity: 2037.5, travelToRechargeEnergy: 17.4, equivalentFullLifeCycles: 5950, chargingTime: 33.18, rechargeRateC: 2.0, totalChargerCapex: 9722830, totalChargerOandO: 143.25 });
const mkDigger = (ov = {}) => ({ id: uid(),
  diggerName: "300t Cable Electric Backhoe", powerSource: "Cable Electric",
  availability: 0.90, useOfAvailability: 0.83, operatingEfficiency: 0.38,
  utToSmuConversion: 1.03, equipmentLife: 80000, effectiveTime: 2487, effectiveDigRate: 2800,
  totalCapex: 8995710, capexPerSmuHour: 112.45,
  dieselElectricityCost: 86.6, maintenanceLabour: 91, oilAndCoolant: 12.6,
  partsComponentsPM05: 223, materialsConsumables: 0, get: 76.5,
  cableCost: 2.4, tracks: 0, tires: 0, fmsLicenseFee: 42.99,
  batteryReplacement: 0, operatorCost: 130, rehandleCostPerTonne: 1.13, ...ov });
const mkDigger4 = () => mkDigger({ diggerName: "400t Cable Electric Backhoe", effectiveDigRate: 5100, totalCapex: 13698717.31, capexPerSmuHour: 171.23, dieselElectricityCost: 108.21, oilAndCoolant: 21, partsComponentsPM05: 304, get: 90 });
const defaultOther = () => ({ moistureContent: 0.052, exchangeRate: 0.70, discountRate: 0.115, electricityCost: 0.1443, dieselCost: 0.9102, allInFitterPerYear: 182, mannedOperator: 133, calendarTime: 8760, diggerFleetRoundingThreshold: 0.5 });

// ─── HELPERS ───────────────────────────────────────────────────────────
const fmt = (v, d = 2) => { if (v === "" || v == null || isNaN(v)) return "—"; return Number(v).toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const fmtInt = v => fmt(v, 0);
const fmtC2 = v => { if (v === "" || v == null || isNaN(v)) return "—"; return "$" + Number(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const fmtCur = v => { if (v === "" || v == null || isNaN(v)) return "—"; if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M"; return "$" + Number(v).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };

// ─── EXPRESSION ENGINE ─────────────────────────────────────────────────
function tokenize(expr) {
  const tokens = []; let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) { i++; continue; }
    if (/[0-9.]/.test(expr[i])) { let n = ""; while (i < expr.length && /[0-9.eE\-]/.test(expr[i])) { n += expr[i++]; } tokens.push({ type: "num", val: parseFloat(n) }); }
    else if (/[a-zA-Z_]/.test(expr[i])) { let id = ""; while (i < expr.length && /[a-zA-Z_0-9]/.test(expr[i])) { id += expr[i++]; } tokens.push({ type: "id", val: id }); }
    else if ("+-*/(),<>=!&|?:".includes(expr[i])) { let op = expr[i++]; if ("<>=!".includes(op[0]) && expr[i] === '=') op += expr[i++]; if (op === '&' && expr[i] === '&') op += expr[i++]; if (op === '|' && expr[i] === '|') op += expr[i++]; tokens.push({ type: "op", val: op }); }
    else i++;
  }
  return tokens;
}
function evalExpr(expr, ctx) {
  try {
    const tokens = tokenize(expr); let pos = 0;
    const peek = () => tokens[pos] || null;
    const eat = (v) => { const t = tokens[pos]; if (v && t?.val !== v) throw 0; pos++; return t; };
    function pTern() { let r = pOr(); if (peek()?.val === '?') { eat('?'); const a = pTern(); eat(':'); const b = pTern(); return r ? a : b; } return r; }
    function pOr() { let r = pAnd(); while (peek()?.val === '||') { eat(); r = r || pAnd(); } return r; }
    function pAnd() { let r = pCmp(); while (peek()?.val === '&&') { eat(); r = r && pCmp(); } return r; }
    function pCmp() { let r = pAdd(); while (peek()?.val && ['<','>','<=','>=','==','!='].includes(peek().val)) { const o = eat().val, b = pAdd(); r = o==='<'?r<b:o==='>'?r>b:o==='<='?r<=b:o==='>='?r>=b:o==='=='?r==b:r!=b; } return r; }
    function pAdd() { let r = pMul(); while (peek()?.val === '+' || peek()?.val === '-') { const o = eat().val, b = pMul(); r = o === '+' ? r + b : r - b; } return r; }
    function pMul() { let r = pUn(); while (peek()?.val === '*' || peek()?.val === '/') { const o = eat().val, b = pUn(); r = o === '*' ? r * b : r / b; } return r; }
    function pUn() { if (peek()?.val === '-') { eat(); return -pPri(); } return pPri(); }
    function pPri() {
      const t = peek(); if (!t) throw 0;
      if (t.type === "num") { eat(); return t.val; }
      if (t.val === '(') { eat('('); const r = pTern(); eat(')'); return r; }
      if (t.type === "id") {
        const nm = eat().val;
        const fns = { ceil: Math.ceil, floor: Math.floor, max: Math.max, min: Math.min, abs: Math.abs, round: Math.round, CEIL: Math.ceil, FLOOR: Math.floor, MAX: Math.max, MIN: Math.min, ABS: Math.abs, ROUND: Math.round, ROUNDUP: Math.ceil, ROUNDDOWN: Math.floor };
        if ((nm === "IF" || nm === "if") && peek()?.val === '(') { eat('('); const c = pTern(); eat(','); const a = pTern(); eat(','); const b = pTern(); eat(')'); return c ? a : b; }
        if (fns[nm] && peek()?.val === '(') { eat('('); const args = [pTern()]; while (peek()?.val === ',') { eat(','); args.push(pTern()); } eat(')'); return fns[nm](...args); }
        if (ctx.hasOwnProperty(nm)) { const v = ctx[nm]; return typeof v === "number" ? v : (parseFloat(v) || 0); }
        return 0;
      }
      throw 0;
    }
    const result = pTern(); return isFinite(result) ? result : "";
  } catch { return ""; }
}

// ─── DEFAULT FORMULAS ──────────────────────────────────────────────────
const defaultFormulas = () => [
  { key: "digOE", label: "Digger Overall Efficiency", unit: "ratio", section: "⛏️ DIGGER — Hours & Fleet Sizing", group: "Digger TUM", formula: "D_availability * D_useOfAvailability * D_operatingEfficiency", dec: 4 },
  { key: "digHrsReq", label: "Digger Hours Required", unit: "hrs", group: "Digger TUM", formula: "totalMined / D_effectiveDigRate" },
  { key: "smuHrs", label: "Digger SMU Hours", unit: "hrs", group: "Digger TUM", formula: "(digHrsReq / digOE) * D_utToSmuConversion" },
  { key: "digQty", label: "Digger Quantity per Period", unit: "#", group: "Fleet Sizing", formula: "digHrsReq / (D_effectiveTime * periodMultiplier)", dec: 3 },
  { key: "digFleet", label: "Digger Fleet Required", unit: "#", group: "Fleet Sizing", formula: "IF(digQty <= 0, 0, IF((digQty - floor(digQty)) > O_diggerFleetRoundingThreshold, CEIL(digQty), MAX(1, floor(digQty))))", hl: 1 },
  { key: "digCapex", label: "Digger Capex", unit: "AUD", group: "Fleet Sizing", formula: "digFleet * D_totalCapex", cur: 1 },
  { key: "digOpxDiesel", label: "Diesel/Electricity Cost", unit: "AUD", section: "⛏️ DIGGER — Operating Costs", group: "Opex Line Items", formula: "smuHrs * D_dieselElectricityCost", cur: 1 },
  { key: "digOpxMaint", label: "Maintenance Labour", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_maintenanceLabour", cur: 1 },
  { key: "digOpxOil", label: "Oil and Coolant", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_oilAndCoolant", cur: 1 },
  { key: "digOpxParts", label: "Parts & Components PM05", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_partsComponentsPM05", cur: 1 },
  { key: "digOpxMaterials", label: "Materials & Consumables", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_materialsConsumables", cur: 1 },
  { key: "digOpxGET", label: "GET", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_get", cur: 1 },
  { key: "digOpxCable", label: "Cable Cost", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_cableCost", cur: 1 },
  { key: "digOpxTracks", label: "Tracks", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_tracks", cur: 1 },
  { key: "digOpxTires", label: "Tires", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_tires", cur: 1 },
  { key: "digOpxFMS", label: "FMS License & Support", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_fmsLicenseFee", cur: 1 },
  { key: "digOpxBattery", label: "Battery Replacement", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_batteryReplacement", cur: 1 },
  { key: "digOpxOperator", label: "Operator Cost", unit: "AUD", group: "Opex Line Items", formula: "smuHrs * D_operatorCost", cur: 1 },
  { key: "digOpxTotal", label: "Total Digger Opex (exc Cpx)", unit: "AUD", group: "Digger Totals", formula: "digOpxDiesel + digOpxMaint + digOpxOil + digOpxParts + digOpxMaterials + digOpxGET + digOpxCable + digOpxTracks + digOpxTires + digOpxFMS + digOpxBattery + digOpxOperator", hl: 1, cur: 1 },
  { key: "digOpxPerT", label: "Digger Opex per Tonne", unit: "$/t", group: "Digger Totals", formula: "digOpxTotal / totalMined", cur: 1 },
  { key: "digOpxIncCpx", label: "Opex inc Capex per Tonne", unit: "$/t", group: "Digger Totals", formula: "(digOpxTotal + smuHrs * D_capexPerSmuHour) / totalMined", cur: 1 },
  { key: "digCostActivity", label: "Total Digger Cost (inc Cpx)", unit: "AUD", group: "Digger Totals", formula: "digOpxIncCpx * totalMined", hl: 1, cur: 1 },
  { key: "digRehandle", label: "Digger Rehandle Opex", unit: "AUD", group: "Digger Totals", formula: "D_rehandleCostPerTonne * oreMined", cur: 1 },
  { key: "cycleTime", label: "Total Cycle Time", unit: "min", section: "🚛 TRUCK — Cycle Time", group: "Cycle Time", formula: "T_spotLoadQueueDump + avgLoadedTravelTime + avgUnloadedTravelTime + avgTkphDelay" },
  { key: "energyBurn", label: "Energy Burn Rate", unit: "kWh/hr", group: "Cycle Time", formula: "avgNetPower / (cycleTime / 60)" },
  { key: "cycPerChg", label: "Cycles per Charge", unit: "#", section: "🔌 TRUCK — Charging", group: "Charge Cycles", formula: "T_averageBatteryUsableCapacity / avgNetPower", dec: 3 },
  { key: "cycPerChgRD", label: "Cycles per Charge (Round Down)", unit: "#", group: "Charge Cycles", formula: "IF(cycPerChg <= 0, 0, IF(cycPerChg < 1, 1, floor(cycPerChg)))" },
  { key: "incompCyc", label: "Incomplete Cycles", unit: "#", group: "Charge Cycles", formula: "IF(cycPerChg == 0, 0, CEIL(1 / cycPerChg) * cycPerChg - cycPerChgRD)", dec: 4 },
  { key: "batEngBefore", label: "Battery Energy Before Travel", unit: "kWh", group: "Effective Capacity", formula: "incompCyc * avgNetPower" },
  { key: "travRchgE", label: "Travel to Recharge Energy", unit: "kWh", group: "Effective Capacity", formula: "T_travelToRechargeEnergy" },
  { key: "effUsableCap", label: "Effective Usable Capacity", unit: "kWh", group: "Effective Capacity", formula: "IF(T_averageBatteryUsableCapacity == 0, 0, IF(travRchgE < batEngBefore, T_averageBatteryUsableCapacity - (batEngBefore - travRchgE), T_averageBatteryUsableCapacity - (avgNetPower + batEngBefore - travRchgE)) + IF(cycPerChg == 0, 0, floor(1 / cycPerChg)) * T_averageBatteryUsableCapacity)", hl: 1 },
  { key: "effCycPerChg", label: "Effective Cycles per Charge", unit: "#", group: "Effective Capacity", formula: "IF(cycPerChg < 1, cycPerChg, IF(travRchgE < batEngBefore, cycPerChgRD, cycPerChgRD - 1))", dec: 3 },
  { key: "pctRchg", label: "% Battery Recharged", unit: "%", group: "Recharge Timing", formula: "effUsableCap / T_averageBatteryUsableCapacity", dec: 4 },
  { key: "nomRchgT", label: "Nominal Recharge Time", unit: "min", group: "Recharge Timing", formula: "T_chargingTime" },
  { key: "actRchgT", label: "Actual Recharge Time", unit: "min", group: "Recharge Timing", formula: "pctRchg * nomRchgT" },
  { key: "totRchgT", label: "Total Recharge Time", unit: "min", group: "Recharge Timing", formula: "IF(cycPerChg == 0, 0, actRchgT + (T_travelToSwapChargerStationTime * CEIL(1 / effCycPerChg) + T_chargerQueueTime + T_chargerConnectionPositioningTime) * IF(cycPerChg < 1, CEIL(1 / cycPerChg), 1))" },
  { key: "rchgPerHaul", label: "Recharges per Haul Cycle", unit: "#", group: "Recharge per Cycle", formula: "1 / effCycPerChg", dec: 4 },
  { key: "totRchgPerCyc", label: "Total Recharge Time/Cycle", unit: "min", group: "Recharge per Cycle", formula: "totRchgT * IF(cycPerChg < 1, 1, rchgPerHaul)" },
  { key: "totTravRchgPerCyc", label: "Travel to Recharge Time/Cycle", unit: "min", group: "Recharge per Cycle", formula: "T_travelToSwapChargerStationTime * CEIL(rchgPerHaul)" },
  { key: "swpRchgPerCyc", label: "Swap/Recharge Time per Cycle", unit: "min", section: "📊 TRUCK — Productivity", group: "Time Build-up", formula: "totRchgPerCyc" },
  { key: "effCycT", label: "Effective Cycle Time", unit: "min", group: "Time Build-up", formula: "T_spotLoadQueueDump + avgLoadedTravelTime + avgUnloadedTravelTime" },
  { key: "prodCycT", label: "Productive Cycle Time", unit: "min", group: "Time Build-up", formula: "effCycT / T_performanceEfficiency" },
  { key: "icEffNoTKPH", label: "In-Cycle Efficiency No TKPH", unit: "ratio", group: "Efficiency Cascade", formula: "T_operatingEfficiency / T_performanceEfficiency", dec: 4 },
  { key: "utNoTKPH", label: "Utilised Time No TKPH", unit: "min", group: "Efficiency Cascade", formula: "prodCycT / icEffNoTKPH" },
  { key: "utIncTKPH", label: "Utilised Time Inc TKPH", unit: "min", group: "Efficiency Cascade", formula: "utNoTKPH + avgTkphDelay" },
  { key: "icEffIncTKPH", label: "In-Cycle Efficiency Inc TKPH", unit: "ratio", group: "Efficiency Cascade", formula: "prodCycT / utIncTKPH", dec: 4 },
  { key: "avCycNoChg", label: "Available Cycle Time No Charging", unit: "min", group: "Availability Cascade", formula: "utIncTKPH / T_useOfAvailability" },
  { key: "avCycIncChg", label: "Available Cycle Time Inc Charging", unit: "min", group: "Availability Cascade", formula: "avCycNoChg + swpRchgPerCyc" },
  { key: "uoaAfter", label: "Use of Availability After Charging", unit: "ratio", group: "Availability Cascade", formula: "utIncTKPH / avCycIncChg", dec: 4 },
  { key: "calCycT", label: "Calendar Cycle Time", unit: "min", group: "Productivity Output", formula: "avCycIncChg / T_availability", hl: 1 },
  { key: "productivity", label: "Productivity", unit: "tph", group: "Productivity Output", formula: "T_payload / (calCycT / 60)", hl: 1 },
  { key: "effHrsDayAfter", label: "Effective Hours/Day (after charging)", unit: "hrs", group: "Productivity Output", formula: "24 * T_availability * uoaAfter * icEffIncTKPH * T_performanceEfficiency" },
  { key: "trkCalHrs", label: "Truck Calendar Hours Required", unit: "hrs", section: "🚚 TRUCK — Fleet Sizing & SMU", group: "Fleet Sizing", formula: "totalRampMined / productivity" },
  { key: "trkReq", label: "Trucks Required (decimal)", unit: "#", group: "Fleet Sizing", formula: "trkCalHrs / calendarHours", dec: 2 },
  { key: "trkReqR", label: "Trucks Required (rounded)", unit: "#", group: "Fleet Sizing", formula: "CEIL(trkReq)", hl: 1 },
  { key: "trkCapex", label: "Truck Capex", unit: "AUD", group: "Fleet Sizing", formula: "trkReqR * T_totalTruckCapex", cur: 1 },
  { key: "trkCycDay", label: "Truck Cycles per Day", unit: "#", group: "Truck Utilisation", formula: "24 / (calCycT / 60)" },
  { key: "trkRchgDay", label: "Truck Recharges per Day", unit: "#", group: "Truck Utilisation", formula: "trkCycDay * rchgPerHaul" },
  { key: "utHrsNotChg", label: "Utilised Hrs Not Inc Charge", unit: "hrs", group: "SMU Calculation", formula: "utIncTKPH / 60" },
  { key: "utHrsDay", label: "Utilised Hrs per Day", unit: "hrs", group: "SMU Calculation", formula: "utHrsNotChg * trkCycDay" },
  { key: "trkSmuDay", label: "Truck SMU per Day", unit: "hrs", group: "SMU Calculation", formula: "utHrsDay * T_utToSmuConversion" },
  { key: "trkSmuPer", label: "Truck SMU per Period", unit: "hrs", group: "SMU Calculation", formula: "trkSmuDay * calendarDays" },
  { key: "totTrkSmu", label: "Total Truck SMU Hours", unit: "hrs", group: "SMU Calculation", formula: "trkSmuPer * trkReq", hl: 1 },
  { key: "netEngPerCyc", label: "Net Energy Usage per Cycle", unit: "kWh", section: "🔋 BATTERY — Lifecycle & Replacement", group: "Energy per Cycle", formula: "avgNetPower + (rchgPerHaul * T_travelToRechargeEnergy)" },
  { key: "eqLifeCycPerHaul", label: "Equiv Full Life Cycles per Haul", unit: "#", group: "Lifecycle Calcs", formula: "netEngPerCyc / T_nominalBatteryCapacityNew", dec: 6 },
  { key: "eqLifeCycDay", label: "Equiv Life Cycles per Day", unit: "#", group: "Lifecycle Calcs", formula: "eqLifeCycPerHaul * trkCycDay", dec: 4 },
  { key: "eqLifeCycPer", label: "Equiv Life Cycles per Period", unit: "#", group: "Lifecycle Calcs", formula: "eqLifeCycDay * calendarDays" },
  { key: "batLifePer", label: "Battery Life in Periods", unit: "per", group: "Battery Replacement", formula: "T_equivalentFullLifeCycles / eqLifeCycPer", hl: 1 },
  { key: "batPerTrkPer", label: "Batteries per Truck per Period", unit: "#", group: "Battery Replacement", formula: "eqLifeCycPer / T_equivalentFullLifeCycles", dec: 4 },
  { key: "totBatPerYr", label: "Total Batteries per Year", unit: "#", group: "Battery Replacement", formula: "batPerTrkPer * trkReq" },
  { key: "totReplBatCost", label: "Replacement Battery Cost/Period", unit: "AUD", group: "Battery Cost", formula: "T_powerSystemCost * batPerTrkPer", cur: 1 },
  { key: "batReplPerSmu", label: "Battery Replacement Cost/SMU", unit: "$/SMU", group: "Battery Cost", formula: "totReplBatCost / trkSmuPer", cur: 1 },
  { key: "chgDur", label: "Avg Charge Duration inc Connection", unit: "min", section: "⚡ CHARGER — Infrastructure", group: "Charger Demand", formula: "T_chargerQueueTime + T_chargerConnectionPositioningTime + actRchgT" },
  { key: "chgReqDec", label: "Connected Chargers Required", unit: "#", group: "Charger Demand", formula: "(trkRchgDay * trkReq * (1 + T_demandResponseAllowance)) / (T_chargerOperatingTime / 365 / (chgDur / 60))", dec: 2 },
  { key: "chgStaDec", label: "Charger Stations Required (decimal)", unit: "#", group: "Charger Stations", formula: "chgReqDec / T_numBatteriesPerStation", dec: 2 },
  { key: "chgStaRnd", label: "Charger Stations Required (rounded)", unit: "#", group: "Charger Stations", formula: "CEIL(chgStaDec)", hl: 1 },
  { key: "chgCapex", label: "Charger Capex", unit: "AUD", group: "Charger Cost", formula: "chgStaRnd * T_totalChargerCapex", cur: 1 },
  { key: "chgHrsReq", label: "Charger Hours Required", unit: "hrs", group: "Charger Cost", formula: "chgStaDec * T_avgChargerEffectiveHours * periodMultiplier" },
  { key: "chgCost", label: "Total Charger Cost per Period", unit: "AUD", group: "Charger Cost", formula: "chgHrsReq * T_totalChargerOandO", cur: 1 },
  { key: "chgCostPerTrkHr", label: "Charger Cost per Truck SMU Hr", unit: "$/hr", group: "Charger Cost", formula: "chgCost / totTrkSmu", cur: 1 },
  { key: "trkOpex", label: "Truck Opex (base)", unit: "AUD", section: "💰 SUMMARY — Truck Cost", group: "Truck Cost Rates", formula: "T_opexPerSmuHour * totTrkSmu", cur: 1 },
  { key: "trkCphrExc", label: "Truck Cost/Hr (O&O exc Cpx)", unit: "$/SMU", group: "Truck Cost Rates", formula: "T_opexPerSmuHour + batReplPerSmu + chgCostPerTrkHr", cur: 1 },
  { key: "trkCphrInc", label: "Truck Cost/Hr (O&O inc Cpx)", unit: "$/SMU", group: "Truck Cost Rates", formula: "trkCphrExc + T_capexPerSmuHour", cur: 1 },
  { key: "totTrkExc", label: "Total Truck Cost (exc Cpx)", unit: "AUD", group: "Truck Cost Totals", formula: "trkCphrExc * totTrkSmu", hl: 1, cur: 1 },
  { key: "trkPerTExc", label: "Truck Cost per Tonne (exc Cpx)", unit: "$/t", group: "Truck Cost Totals", formula: "totTrkExc / totalRampMined", cur: 1 },
  { key: "totTrk", label: "Total Truck Cost (inc Cpx)", unit: "AUD", group: "Truck Cost Totals", formula: "trkCphrInc * totTrkSmu", hl: 1, cur: 1 },
  { key: "trkPerT", label: "Truck Cost per Tonne (inc Cpx)", unit: "$/t", group: "Truck Cost Totals", formula: "totTrk / totalRampMined", cur: 1 },
  { key: "totExc", label: "Total Scenario Cost (exc Cpx)", unit: "AUD", section: "🏆 GRAND TOTAL", group: "Excluding Capex", formula: "totTrkExc + digOpxTotal + digRehandle", hl: 1, cur: 1 },
  { key: "totPerTExc", label: "Total Cost per Tonne (exc Cpx)", unit: "$/t", group: "Excluding Capex", formula: "totExc / totalMined", hl: 1, cur: 1 },
  { key: "totCost", label: "Total Scenario Cost (inc Cpx)", unit: "AUD", group: "Including Capex", formula: "totTrk + digCostActivity + digRehandle", hl: 1, cur: 1 },
  { key: "totPerT", label: "Total Cost per Tonne (inc Cpx)", unit: "$/t", group: "Including Capex", formula: "totCost / totalRampMined", hl: 1, cur: 1 },
];

// ─── FORMULA-BASED CALCULATOR ──────────────────────────────────────────
function calcWithFormulas(inp, formulas) {
  const { totalMined, oreMined, totalRampMined, avgLoadedTravelTime, avgUnloadedTravelTime, avgNetPower, avgTkphDelay, schedPeriod, calendarDays, calendarHours, truck: T, digger: D, other: O } = inp;
  if (!totalMined || totalMined <= 0) return null;
  const pm = schedPeriod === "Quarterly" ? 0.25 : schedPeriod === "Monthly" ? 1 / 12 : 1;
  const ctx = { totalMined, oreMined, totalRampMined, avgLoadedTravelTime, avgUnloadedTravelTime, avgNetPower, avgTkphDelay, calendarDays, calendarHours, periodMultiplier: pm };
  for (const [k, v] of Object.entries(T)) { if (typeof v === "number") ctx["T_" + k] = v; }
  for (const [k, v] of Object.entries(D)) { if (typeof v === "number") ctx["D_" + k] = v; }
  for (const [k, v] of Object.entries(O)) { if (typeof v === "number") ctx["O_" + k] = v; }
  const results = {};
  for (const f of formulas) { const val = evalExpr(f.formula, ctx); results[f.key] = val; ctx[f.key] = typeof val === "number" ? val : 0; }
  return results;
}

// ─── GENERIC CSV PARSER ────────────────────────────────────────────────
// Parses CSV into { rowLabels: [...], dataStartCol, numPeriods, getVal(rowLabel, periodIdx), getStr(rowLabel, periodIdx), allRowLabels }
function parseCSV(text) {
  return text.split(/\r?\n/).filter(l => l.trim()).map(l => {
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) { if (l[i] === '"') q = !q; else if (l[i] === ',' && !q) { cells.push(cur.trim()); cur = ""; } else cur += l[i]; }
    cells.push(cur.trim()); return cells;
  });
}

function parseGenericCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return null;

  // Detect data start column (first column header that looks like a period number or date)
  const hdr = rows[0];
  let dsc = 2;
  for (let i = 1; i < hdr.length; i++) { if (/^\d/.test(hdr[i])) { dsc = i; break; } }

  const numPeriods = Math.max(...rows.map(r => r.length)) - dsc;

  // Build a map: normalised row label → row array
  const rowMap = {};
  const allLabels = [];
  for (const r of rows) {
    const rawLabel = (r[0] || "").trim();
    if (!rawLabel) continue;
    allLabels.push(rawLabel);
    rowMap[rawLabel] = r;
    // Also store normalised version for fuzzy matching
    rowMap[rawLabel.toLowerCase().replace(/[^a-z0-9]/g, "")] = r;
  }

  const getVal = (label, periodIdx) => {
    const row = rowMap[label] || rowMap[(label || "").toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (!row) return 0;
    const v = row[dsc + periodIdx];
    if (v === undefined || v === "") return 0;
    const n = parseFloat(v.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const getStr = (label, periodIdx) => {
    const row = rowMap[label] || rowMap[(label || "").toLowerCase().replace(/[^a-z0-9]/g, "")];
    return row ? (row[dsc + periodIdx] || "") : "";
  };

  return { rowMap, allLabels, dsc, numPeriods, getVal, getStr };
}

// ─── DEFAULT FIELD MAPPINGS ────────────────────────────────────────────
// Each "physical set" maps CSV row names → calculation input names
const defaultFieldMappings = () => [
  {
    id: uid(), name: "Base Set",
    fields: {
      oreMined: "Ore Mined", wasteMined: "Waste Mined",
      totalMined: "Total Mined", totalRampMined: "Total Mined",
      avgLoadedTravelTime: "Average loaded travel time",
      avgUnloadedTravelTime: "Average unloaded travel time",
      avgTkphDelay: "Average TKPH delay",
      avgNetPower: "Average Net Power",
    }
  },
];

// The calc input fields that each physical set must provide
const PHYS_FIELDS = [
  { key: "oreMined", label: "Ore Mined", unit: "t" },
  { key: "wasteMined", label: "Waste Mined", unit: "t" },
  { key: "totalMined", label: "Total Mined (tonnage driver)", unit: "t" },
  { key: "totalRampMined", label: "Ramp Build Tonnes", unit: "t" },
  { key: "avgLoadedTravelTime", label: "Loaded Travel Time", unit: "min" },
  { key: "avgUnloadedTravelTime", label: "Unloaded Travel Time", unit: "min" },
  { key: "avgTkphDelay", label: "TKPH Delay", unit: "min" },
  { key: "avgNetPower", label: "Net Power", unit: "kWh" },
];

// ─── FLEET COMBO DEFINITION ───────────────────────────────────────────
const defaultFleets = () => [
  { id: uid(), name: "Fleet 1", truckIdx: 0, diggerIdx: 0, physicalSetIdx: 0 },
];

// ─── DESIGN SYSTEM ─────────────────────────────────────────────────────
const P = { bg: "#f8f9fc", card: "#ffffff", input: "#f3f4f8", bd: "#e0e3ea", bdS: "#c7cbd4", pri: "#1d4ed8", priL: "#3b6cf4", priBg: "#eef2ff", priTx: "#1e3a8a", tx: "#1a1f2e", txM: "#4b5563", txD: "#8992a3", gn: "#0d7a5f", gnBg: "#ecfdf5", rd: "#c93131", rdBg: "#fef2f2", bl: "#2563eb", blBg: "#eff6ff", hdr: "#111827", hdrTx: "#f0f1f4", secBg: "#f1f4f9", hlBg: "#e8eeff", hlTx: "#1e3a8a" };
const ff = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const mf = "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace";
const mClr = ["#1d4ed8", "#0d7a5f", "#c93131", "#7c3aed", "#be185d", "#0e7490"];
const ST = ({ children, icon }) => (<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0 10px", marginTop: 20, borderBottom: `2px solid ${P.pri}`, marginBottom: 14 }}><span style={{ fontSize: 18 }}>{icon}</span><span style={{ color: P.pri, fontWeight: 700, fontSize: 15, fontFamily: ff }}>{children}</span></div>);
const Btn = ({ children, onClick, color = P.pri, small, solid }) => (<button onClick={onClick} style={{ padding: small ? "5px 12px" : "8px 20px", background: solid ? color : "transparent", border: `1.5px solid ${color}`, borderRadius: 7, color: solid ? "#fff" : color, fontFamily: ff, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{children}</button>);
const CompRow = ({ label, field, models, onChange, unit, type = "number", step, section }) => {
  if (section) return (<tr><td colSpan={models.length + 2} style={{ padding: "16px 14px 6px", color: P.pri, fontWeight: 700, fontSize: 13, borderBottom: `2px solid ${P.pri}20`, fontFamily: ff, background: P.secBg }}>{label}</td></tr>);
  return (<tr style={{ borderBottom: `1px solid ${P.bd}` }}><td style={{ padding: "7px 14px", color: P.txM, fontSize: 13, fontFamily: ff, whiteSpace: "nowrap", position: "sticky", left: 0, background: P.card, zIndex: 1 }}>{label}</td><td style={{ padding: "7px 8px", color: P.txD, fontSize: 11, fontFamily: mf }}>{unit}</td>{models.map((m, i) => (<td key={m.id || i} style={{ padding: "3px 6px" }}>{type === "text" ? <input type="text" value={m[field] || ""} onChange={e => onChange(i, field, e.target.value)} style={{ width: "100%", minWidth: 115, padding: "6px 10px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 6, color: P.tx, fontFamily: ff, fontSize: 13 }} /> : <input type="number" value={m[field] ?? ""} onChange={e => onChange(i, field, parseFloat(e.target.value) || 0)} step={step || 0.01} style={{ width: "100%", minWidth: 105, padding: "6px 10px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 6, color: P.tx, fontFamily: mf, fontSize: 13, textAlign: "right" }} />}</td>))}</tr>);
};
const cardS = { background: P.card, borderRadius: 10, border: `1px solid ${P.bd}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };
const selS = { padding: "6px 12px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 6, color: P.tx, fontFamily: ff, fontSize: 12 };
const thS = { padding: "9px 10px", color: P.txM, textAlign: "left", fontSize: 11, fontWeight: 600 };

const truckRows = [
  { section: true, label: "Identity & TUM Parameters" },
  { field: "truckName", label: "Truck Name", type: "text" }, { field: "payload", label: "Payload", unit: "t" }, { field: "powerSource", label: "Power Source", type: "text" },
  { field: "availability", label: "Availability", unit: "%", step: 0.01 }, { field: "useOfAvailability", label: "Use of Availability", unit: "%", step: 0.01 },
  { field: "operatingEfficiency", label: "Operating Efficiency", unit: "%", step: 0.01 }, { field: "utToSmuConversion", label: "UT → SMU Ratio", unit: "#" },
  { field: "spotLoadQueueDump", label: "Spot/Load/Queue/Dump", unit: "min" }, { field: "performanceEfficiency", label: "Performance Efficiency", unit: "%", step: 0.01 },
  { section: true, label: "Capital Expenditure" },
  { field: "totalTruckCapex", label: "Total Truck Capex", unit: "AUD", step: 1000 }, { field: "capexPerSmuHour", label: "Capex per SMU Hour", unit: "$/SMU" }, { field: "powerSystemCost", label: "Power System Cost", unit: "AUD", step: 1000 },
  { section: true, label: "Operating Expenditure" },
  { field: "opexPerSmuHour", label: "Opex per SMU Hour", unit: "$/hr" }, { field: "operatorRate", label: "Operator Rate", unit: "$/SMU" },
  { section: true, label: "Charging Parameters" },
  { field: "nominalBatteryCapacityNew", label: "Nominal Battery Capacity", unit: "kWh" }, { field: "averageBatteryUsableCapacity", label: "Avg Usable Capacity", unit: "kWh" },
  { field: "travelToRechargeEnergy", label: "Travel to Recharge Energy", unit: "kWh" }, { field: "travelToSwapChargerStationTime", label: "Travel to Charger Time", unit: "min" },
  { field: "chargerQueueTime", label: "Charger Queue Time", unit: "min" }, { field: "chargerConnectionPositioningTime", label: "Connection Time", unit: "min" },
  { field: "equivalentFullLifeCycles", label: "Equiv Full Life Cycles", unit: "#" }, { field: "chargingTime", label: "Charging Time", unit: "min" }, { field: "rechargeRateC", label: "Recharge Rate", unit: "C" },
  { section: true, label: "Charger Infrastructure" },
  { field: "chargerOperatingTime", label: "Charger Operating Time", unit: "hrs" }, { field: "demandResponseAllowance", label: "Demand Response %", unit: "%", step: 0.01 },
  { field: "numBatteriesPerStation", label: "Batteries per Station", unit: "#" }, { field: "totalChargerCapex", label: "Charger Capex", unit: "AUD", step: 1000 },
  { field: "avgChargerEffectiveHours", label: "Avg Charger Eff Hours", unit: "hrs" }, { field: "totalChargerOandO", label: "Charger O&O Rate", unit: "$/SMU" },
];
const diggerRows = [
  { section: true, label: "Identity & TUM Parameters" },
  { field: "diggerName", label: "Digger Name", type: "text" }, { field: "powerSource", label: "Power Source", type: "text" },
  { field: "effectiveDigRate", label: "Effective Dig Rate", unit: "t/hr", step: 100 },
  { field: "availability", label: "Availability", unit: "%", step: 0.01 }, { field: "useOfAvailability", label: "Use of Availability", unit: "%", step: 0.01 },
  { field: "operatingEfficiency", label: "Operating Efficiency", unit: "%", step: 0.01 }, { field: "utToSmuConversion", label: "UT → SMU Ratio", unit: "#" },
  { field: "equipmentLife", label: "Equipment Life", unit: "hrs" }, { field: "effectiveTime", label: "Effective Time", unit: "hrs" },
  { section: true, label: "Capital Expenditure" },
  { field: "totalCapex", label: "Total Capex", unit: "AUD", step: 10000 }, { field: "capexPerSmuHour", label: "Capex per SMU", unit: "$/SMU" },
  { section: true, label: "Operating Expenditure (per SMU Hour)" },
  { field: "dieselElectricityCost", label: "Diesel / Electricity", unit: "$/SMU" }, { field: "maintenanceLabour", label: "Maintenance Labour", unit: "$/SMU" },
  { field: "oilAndCoolant", label: "Oil & Coolant", unit: "$/SMU" }, { field: "partsComponentsPM05", label: "Parts & Components PM05", unit: "$/SMU" },
  { field: "materialsConsumables", label: "Materials & Consumables", unit: "$/SMU" }, { field: "get", label: "GET", unit: "$/SMU" },
  { field: "cableCost", label: "Cable Cost", unit: "$/SMU" }, { field: "tracks", label: "Tracks", unit: "$/SMU" }, { field: "tires", label: "Tires", unit: "$/SMU" },
  { field: "fmsLicenseFee", label: "FMS License & Support", unit: "$/SMU" }, { field: "batteryReplacement", label: "Battery Replacement", unit: "$/SMU" },
  { field: "operatorCost", label: "Operator Cost", unit: "$/SMU" }, { field: "rehandleCostPerTonne", label: "Rehandle Cost per Tonne", unit: "$/t" },
];

// ═══════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("schedule");
  const [trucks, setTrucks] = useState([mkTruck(), mkTruckL()]);
  const [diggers, setDiggers] = useState([mkDigger(), mkDigger4()]);
  const [otherA, setOtherA] = useState(defaultOther);
  const [formulas, setFormulas] = useState(defaultFormulas);
  const [fieldMappings, setFieldMappings] = useState(defaultFieldMappings);
  const [fleets, setFleets] = useState(defaultFleets);
  const [csvData, setCsvData] = useState(null); // parsed generic CSV
  const [csvRawLabels, setCsvRawLabels] = useState([]);
  const [schedPeriod, setSchedPeriod] = useState("Quarterly");
  const [uploadError, setUploadError] = useState("");
  const [unitMul, setUnitMul] = useState(1);
  const [formulaSearch, setFormulaSearch] = useState("");
  const [editingFormula, setEditingFormula] = useState(null);
  const [editText, setEditText] = useState("");
  const [testPeriodIdx, setTestPeriodIdx] = useState(0);
  const [testFleetIdx, setTestFleetIdx] = useState(0);
  const fileRef = useRef();

  // Manual schedule data (used when no CSV uploaded)
  const [manual, setManual] = useState([
    { period: 1, periodLabel: "2032/Q2", days: 91, hours: 2184, oreMined: 0, wasteMined: 77261, totalMined: 77261, totalRampMined: 77261, avgLoadedTravelTime: 3.3, avgUnloadedTravelTime: 2.5, avgTkphDelay: 0, avgNetPower: 255.9 },
    { period: 2, periodLabel: "2032/Q3", days: 90, hours: 2160, oreMined: 0, wasteMined: 171091, totalMined: 171091, totalRampMined: 171091, avgLoadedTravelTime: 15.4, avgUnloadedTravelTime: 10.6, avgTkphDelay: 4.9, avgNetPower: 115.7 },
    { period: 3, periodLabel: "2032/Q4", days: 90, hours: 2160, oreMined: 0, wasteMined: 360855, totalMined: 360855, totalRampMined: 360855, avgLoadedTravelTime: 10.8, avgUnloadedTravelTime: 8.0, avgTkphDelay: 2.2, avgNetPower: 35.9 },
  ]);

  const handleUpload = useCallback(e => {
    const f = e.target.files[0]; if (!f) return;
    setUploadError("");
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const parsed = parseGenericCSV(ev.target.result);
        if (!parsed || parsed.numPeriods < 1) { setUploadError("Could not parse CSV — no period columns found."); return; }
        setCsvData(parsed);
        setCsvRawLabels(parsed.allLabels);
        setUploadError("");
      } catch (err) { setUploadError("Error: " + err.message); }
    };
    rd.readAsText(f);
  }, []);

  // Resolve period data for a given fleet using field mappings
  const getPeriodDataForFleet = useCallback((periodIdx, fleet) => {
    const mapping = fieldMappings[fleet.physicalSetIdx] || fieldMappings[0];
    if (!mapping) return null;

    if (csvData) {
      // Read from uploaded CSV using mapping
      const result = { period: periodIdx + 1, periodLabel: csvData.getStr("Period", periodIdx) || `P${periodIdx + 1}` };
      result.days = csvData.getVal("Days", periodIdx) || 91;
      result.hours = csvData.getVal("Hours", periodIdx) || result.days * 24;
      for (const pf of PHYS_FIELDS) {
        const csvLabel = mapping.fields[pf.key] || "";
        result[pf.key] = csvLabel ? csvData.getVal(csvLabel, periodIdx) : 0;
      }
      return result;
    } else {
      // Use manual data (ignoring field mapping — manual is direct)
      return manual[periodIdx] || null;
    }
  }, [csvData, fieldMappings, manual]);

  // Number of periods
  const numPeriods = csvData ? csvData.numPeriods : manual.length;

  // Calculate results: for each period × each fleet
  const results = useMemo(() => {
    const allResults = [];
    for (let pi = 0; pi < numPeriods; pi++) {
      for (const fleet of fleets) {
        const pd = getPeriodDataForFleet(pi, fleet);
        if (!pd) continue;
        const ti = Math.min(fleet.truckIdx, trucks.length - 1);
        const di = Math.min(fleet.diggerIdx, diggers.length - 1);
        const res = calcWithFormulas({
          totalMined: (pd.totalMined || 0) * unitMul,
          oreMined: (pd.oreMined || 0) * unitMul,
          totalRampMined: (pd.totalRampMined || pd.totalMined || 0) * unitMul,
          avgLoadedTravelTime: pd.avgLoadedTravelTime || 0,
          avgUnloadedTravelTime: pd.avgUnloadedTravelTime || 0,
          avgNetPower: pd.avgNetPower || 0,
          avgTkphDelay: pd.avgTkphDelay || 0,
          schedPeriod, calendarDays: pd.days || 91, calendarHours: pd.hours || 2184,
          truck: trucks[ti], digger: diggers[di], other: otherA,
        }, formulas);
        allResults.push({
          periodIdx: pi, periodLabel: pd.periodLabel || `P${pi + 1}`,
          fleet, fleetName: fleet.name,
          truckName: trucks[ti]?.truckName, diggerName: diggers[di]?.diggerName,
          equipKey: `${fleet.truckIdx}-${fleet.diggerIdx}`, // for grouping same equipment
          res, pd,
        });
      }
    }
    return allResults;
  }, [numPeriods, fleets, trucks, diggers, otherA, formulas, schedPeriod, unitMul, getPeriodDataForFleet]);

  // Group results by equipment key for combined reporting
  const equipGroups = useMemo(() => {
    const groups = {};
    for (const r of results) {
      if (!groups[r.equipKey]) groups[r.equipKey] = { key: r.equipKey, truckName: r.truckName, diggerName: r.diggerName, fleetNames: [], results: [] };
      if (!groups[r.equipKey].fleetNames.includes(r.fleetName)) groups[r.equipKey].fleetNames.push(r.fleetName);
      groups[r.equipKey].results.push(r);
    }
    return Object.values(groups);
  }, [results]);

  // Totals
  const totals = useMemo(() => {
    const t = { m: 0, c: 0 };
    results.forEach(r => { if (!r.res) return; t.m += r.res.totCost ? ((r.pd?.totalMined || 0) * unitMul) : 0; t.c += r.res.totCost || 0; });
    t.cpt = t.m > 0 ? t.c / t.m : 0;
    return t;
  }, [results, unitMul]);

  // Test result for formula editor
  const testResult = useMemo(() => {
    const fleet = fleets[testFleetIdx] || fleets[0]; if (!fleet) return null;
    const pd = getPeriodDataForFleet(testPeriodIdx, fleet); if (!pd) return null;
    const ti = Math.min(fleet.truckIdx, trucks.length - 1), di = Math.min(fleet.diggerIdx, diggers.length - 1);
    return calcWithFormulas({ totalMined: (pd.totalMined || 0) * unitMul, oreMined: (pd.oreMined || 0) * unitMul, totalRampMined: (pd.totalRampMined || pd.totalMined || 0) * unitMul, avgLoadedTravelTime: pd.avgLoadedTravelTime || 0, avgUnloadedTravelTime: pd.avgUnloadedTravelTime || 0, avgNetPower: pd.avgNetPower || 0, avgTkphDelay: pd.avgTkphDelay || 0, schedPeriod, calendarDays: pd.days || 91, calendarHours: pd.hours || 2184, truck: trucks[ti], digger: diggers[di], other: otherA }, formulas);
  }, [testPeriodIdx, testFleetIdx, fleets, trucks, diggers, otherA, formulas, schedPeriod, unitMul, getPeriodDataForFleet]);

  // Updaters
  const updT = (i, f, v) => setTrucks(p => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const updD = (i, f, v) => setDiggers(p => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const uO = (k, v) => setOtherA(p => ({ ...p, [k]: v }));
  const updFleet = (i, k, v) => setFleets(p => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });
  const updMapping = (setIdx, fieldKey, csvLabel) => setFieldMappings(p => { const n = [...p]; n[setIdx] = { ...n[setIdx], fields: { ...n[setIdx].fields, [fieldKey]: csvLabel } }; return n; });
  const addP = () => setManual(p => [...p, { period: p.length + 1, periodLabel: `P${p.length + 1}`, days: 91, hours: 2184, oreMined: 0, wasteMined: 0, totalMined: 0, totalRampMined: 0, avgLoadedTravelTime: 10, avgUnloadedTravelTime: 8, avgTkphDelay: 0, avgNetPower: 150 }]);
  const updPM = (i, k, v) => setManual(p => { const n = [...p]; n[i] = { ...n[i], [k]: v }; if (k === "oreMined" || k === "wasteMined") { n[i].totalMined = (n[i].oreMined || 0) + (n[i].wasteMined || 0); n[i].totalRampMined = n[i].totalMined; } if (k === "days") n[i].hours = v * 24; return n; });
  const updateFormula = (key, nf) => { setFormulas(prev => prev.map(f => f.key === key ? { ...f, formula: nf } : f)); setEditingFormula(null); };
  const addFormula = () => { const k = "custom_" + Date.now(); setFormulas(prev => [...prev, { key: k, label: "New Variable", unit: "", formula: "0", section: "🔧 CUSTOM" }]); setEditingFormula(k); setEditText("0"); };

  const navs = [
    { id: "schedule", label: "Schedule", icon: "📅" },
    { id: "mapping", label: "Field Mapping", icon: "🔗" },
    { id: "fleets", label: "Fleet Combos", icon: "🏗️" },
    { id: "results", label: "Results", icon: "📊" },
    { id: "formulas", label: "Formulas", icon: "🧮" },
    { id: "truck", label: "Trucks", icon: "🚛" },
    { id: "digger", label: "Diggers", icon: "⛏️" },
    { id: "other", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: P.bg, color: P.tx, fontFamily: ff }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ background: P.hdr, padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>⛏️</div>
          <div><h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: P.hdrTx }}>Mining Fleet Cost Engine</h1><p style={{ margin: 0, color: "#9ca3af", fontSize: 12 }}>Multi-Fleet · Field Mapping · Editable Formulas</p></div>
        </div>
        {totals.c > 0 && (<div style={{ display: "flex", gap: 24 }}>
          <div style={{ textAlign: "right" }}><div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Cost / Tonne</div><div style={{ color: "#60a5fa", fontSize: 22, fontWeight: 800, fontFamily: mf }}>{fmtC2(totals.cpt)}</div></div>
          <div style={{ width: 1, height: 36, background: "#374151" }} />
          <div style={{ textAlign: "right" }}><div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Total Cost</div><div style={{ color: P.hdrTx, fontSize: 17, fontWeight: 700, fontFamily: mf }}>{fmtCur(totals.c)}</div></div>
        </div>)}
      </div>

      {/* NAV */}
      <div style={{ display: "flex", padding: "0 32px", background: P.card, borderBottom: `1px solid ${P.bd}`, overflowX: "auto" }}>
        {navs.map(n => (<button key={n.id} onClick={() => setPage(n.id)} style={{ padding: "13px 18px", background: "transparent", border: "none", borderBottom: page === n.id ? `3px solid ${P.pri}` : "3px solid transparent", color: page === n.id ? P.pri : P.txD, fontFamily: ff, fontSize: 13, fontWeight: page === n.id ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>
          <span style={{ marginRight: 6 }}>{n.icon}</span>{n.label}
        </button>))}
      </div>

      <div style={{ padding: "20px 32px 60px", maxWidth: 1600, margin: "0 auto" }}>

        {/* ══ SCHEDULE ══ */}
        {page === "schedule" && (<div>
          <ST icon="📤">Upload Production Schedule</ST>
          <div style={{ ...cardS, padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleUpload} style={{ color: P.tx, fontSize: 12 }} />
              <select value={schedPeriod} onChange={e => setSchedPeriod(e.target.value)} style={selS}><option value="Yearly">Yearly</option><option value="Quarterly">Quarterly</option><option value="Monthly">Monthly</option></select>
              <select value={unitMul} onChange={e => setUnitMul(Number(e.target.value))} style={selS}><option value={1}>Tonnes</option><option value={1000}>kt (×1000)</option><option value={1000000}>Mt (×1M)</option></select>
              {csvData && <Btn color={P.rd} small onClick={() => { setCsvData(null); setCsvRawLabels([]); if (fileRef.current) fileRef.current.value = ""; }}>Clear Upload</Btn>}
            </div>
            {uploadError && <p style={{ color: P.rd, fontSize: 12, marginTop: 8 }}>{uploadError}</p>}
            {csvData && <p style={{ color: P.gn, fontSize: 12, marginTop: 8, fontWeight: 600 }}>✓ {csvData.numPeriods} periods loaded · {csvData.allLabels.length} rows detected. Go to <b>Field Mapping</b> to configure which rows drive each fleet.</p>}
          </div>

          {!csvData && (<div>
            <ST icon="✏️">Manual Schedule Entry</ST>
            <div style={{ ...cardS, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontFamily: ff, fontSize: 12, width: "100%" }}>
                <thead><tr style={{ background: P.secBg, borderBottom: `2px solid ${P.bdS}` }}>
                  {["#", "Period", "Days", "Hrs", "Ore Mined", "Waste Mined", "Total Mined", "Loaded TT", "Unloaded TT", "TKPH Delay", "Net Power"].map((h, i) => (<th key={i} style={{ ...thS, textAlign: i > 3 ? "right" : "left" }}>{h}</th>))}
                  <th />
                </tr></thead>
                <tbody>{manual.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${P.bd}`, background: idx % 2 ? P.input + "55" : "transparent" }}>
                    <td style={{ padding: "7px 10px", color: P.txD }}>{p.period}</td>
                    {[["periodLabel", "t"], ["days", "n"], ["hours", "n"], ["oreMined", "n"], ["wasteMined", "n"], ["totalMined", "n"], ["avgLoadedTravelTime", "n"], ["avgUnloadedTravelTime", "n"], ["avgTkphDelay", "n"], ["avgNetPower", "n"]].map(([k, t]) => (
                      <td key={k} style={{ padding: "5px 6px" }}>
                        <input type={t === "t" ? "text" : "number"} value={p[k]} onChange={e => updPM(idx, k, t === "t" ? e.target.value : parseFloat(e.target.value) || 0)}
                          style={{ width: t === "t" ? 75 : 85, padding: "5px 8px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 5, color: k === "totalMined" ? P.pri : P.tx, fontFamily: mf, fontSize: 12, textAlign: t === "t" ? "left" : "right", fontWeight: k === "totalMined" ? 700 : 400 }} />
                      </td>
                    ))}
                    <td>{manual.length > 1 && <button onClick={() => setManual(p => p.filter((_, i) => i !== idx))} style={{ background: P.rdBg, border: `1px solid ${P.rd}22`, borderRadius: 5, color: P.rd, cursor: "pointer", padding: "2px 8px" }}>×</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}><Btn onClick={addP} solid>+ Add Period</Btn></div>
          </div>)}
        </div>)}

        {/* ══ FIELD MAPPING ══ */}
        {page === "mapping" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <ST icon="🔗">Field Mapping — Physical Sets</ST>
            <Btn onClick={() => setFieldMappings(p => [...p, { id: uid(), name: `Set ${p.length + 1}`, fields: { ...PHYS_FIELDS.reduce((a, f) => ({ ...a, [f.key]: "" }), {}) } }])} solid>+ Add Physical Set</Btn>
          </div>
          <p style={{ color: P.txM, fontSize: 13, marginBottom: 16 }}>
            Map CSV row labels to calculation inputs for each physical set. Each fleet combo uses one physical set. {csvData ? `${csvRawLabels.length} CSV rows available.` : "Upload a CSV first to see available row labels."}
          </p>

          <div style={{ ...cardS, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontFamily: ff, fontSize: 12, width: "100%" }}>
              <thead><tr style={{ background: P.secBg, borderBottom: `2px solid ${P.bdS}` }}>
                <th style={{ ...thS, minWidth: 180 }}>Calculation Input</th>
                <th style={{ ...thS, minWidth: 50 }}>Unit</th>
                {fieldMappings.map((m, mi) => (
                  <th key={m.id} style={{ ...thS, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                      <input type="text" value={m.name} onChange={e => setFieldMappings(p => { const n = [...p]; n[mi] = { ...n[mi], name: e.target.value }; return n; })}
                        style={{ padding: "4px 8px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 5, color: mClr[mi % mClr.length], fontFamily: ff, fontSize: 12, fontWeight: 700, width: 120 }} />
                      {fieldMappings.length > 1 && <button onClick={() => setFieldMappings(p => p.filter((_, i) => i !== mi))} style={{ background: P.rdBg, border: `1px solid ${P.rd}22`, borderRadius: 4, color: P.rd, cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>×</button>}
                    </div>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {PHYS_FIELDS.map(pf => (
                  <tr key={pf.key} style={{ borderBottom: `1px solid ${P.bd}` }}>
                    <td style={{ padding: "8px 14px", color: P.txM, fontWeight: 500 }}>{pf.label}</td>
                    <td style={{ padding: "8px 8px", color: P.txD, fontSize: 11, fontFamily: mf }}>{pf.unit}</td>
                    {fieldMappings.map((m, mi) => (
                      <td key={m.id} style={{ padding: "4px 6px" }}>
                        {csvData ? (
                          <select value={m.fields[pf.key] || ""} onChange={e => updMapping(mi, pf.key, e.target.value)}
                            style={{ ...selS, width: "100%", minWidth: 160, color: m.fields[pf.key] ? P.tx : P.txD }}>
                            <option value="">— Select CSV row —</option>
                            {csvRawLabels.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={m.fields[pf.key] || ""} onChange={e => updMapping(mi, pf.key, e.target.value)} placeholder="CSV row label..."
                            style={{ width: "100%", minWidth: 160, padding: "6px 10px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 6, color: P.tx, fontFamily: ff, fontSize: 12 }} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>)}

        {/* ══ FLEET COMBOS ══ */}
        {page === "fleets" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <ST icon="🏗️">Fleet Combinations</ST>
            <Btn onClick={() => setFleets(p => [...p, { id: uid(), name: `Fleet ${p.length + 1}`, truckIdx: 0, diggerIdx: 0, physicalSetIdx: 0 }])} solid>+ Add Fleet</Btn>
          </div>
          <p style={{ color: P.txM, fontSize: 13, marginBottom: 16 }}>
            Define each fleet combo: which digger, which truck, and which physical set drives its tonnage and productivity metrics. Fleets using the same digger+truck are combined in reporting.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {fleets.map((fl, fi) => {
              const trk = trucks[Math.min(fl.truckIdx, trucks.length - 1)];
              const dig = diggers[Math.min(fl.diggerIdx, diggers.length - 1)];
              const physSet = fieldMappings[Math.min(fl.physicalSetIdx, fieldMappings.length - 1)];
              return (
                <div key={fl.id} style={{ ...cardS, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <input type="text" value={fl.name} onChange={e => updFleet(fi, "name", e.target.value)}
                      style={{ padding: "6px 10px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 6, color: mClr[fi % mClr.length], fontFamily: ff, fontSize: 15, fontWeight: 700, width: 180 }} />
                    {fleets.length > 1 && <button onClick={() => setFleets(p => p.filter((_, i) => i !== fi))} style={{ background: P.rdBg, border: `1px solid ${P.rd}22`, borderRadius: 5, color: P.rd, cursor: "pointer", padding: "4px 10px", fontSize: 12 }}>Remove</button>}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: P.txD, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Truck Model</label>
                    <select value={fl.truckIdx} onChange={e => updFleet(fi, "truckIdx", parseInt(e.target.value))} style={{ ...selS, width: "100%" }}>
                      {trucks.map((t, ti) => <option key={ti} value={ti}>{t.truckName}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: P.txD, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Digger Model</label>
                    <select value={fl.diggerIdx} onChange={e => updFleet(fi, "diggerIdx", parseInt(e.target.value))} style={{ ...selS, width: "100%" }}>
                      {diggers.map((d, di) => <option key={di} value={di}>{d.diggerName}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: P.txD, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Physical Set (tonnage & productivity driver)</label>
                    <select value={fl.physicalSetIdx} onChange={e => updFleet(fi, "physicalSetIdx", parseInt(e.target.value))} style={{ ...selS, width: "100%" }}>
                      {fieldMappings.map((m, mi) => <option key={mi} value={mi}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ padding: "10px 12px", background: P.secBg, borderRadius: 6, fontSize: 11, color: P.txM }}>
                    <b>{trk?.truckName}</b> + <b>{dig?.diggerName}</b><br />Using: <span style={{ color: mClr[fl.physicalSetIdx % mClr.length], fontWeight: 600 }}>{physSet?.name}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show grouping preview */}
          {equipGroups.length > 0 && (<div style={{ marginTop: 24 }}>
            <ST icon="📋">Reporting Groups Preview</ST>
            {equipGroups.map(g => (
              <div key={g.key} style={{ ...cardS, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><b style={{ color: P.pri }}>{g.truckName}</b> + <b style={{ color: P.gn }}>{g.diggerName}</b></div>
                <div style={{ color: P.txD, fontSize: 12 }}>Combines: {g.fleetNames.join(" + ")}</div>
              </div>
            ))}
          </div>)}
        </div>)}

        {/* ══ RESULTS ══ */}
        {page === "results" && (<div>
          <ST icon="📊">Calculation Results</ST>
          {equipGroups.length === 0 ? <p style={{ color: P.txD }}>No data.</p> : equipGroups.map(grp => (
            <div key={grp.key} style={{ marginBottom: 32 }}>
              <div style={{ padding: "10px 16px", background: P.priBg, borderRadius: "8px 8px 0 0", border: `1px solid ${P.pri}22`, borderBottom: "none" }}>
                <span style={{ color: P.pri, fontWeight: 700, fontSize: 14 }}>{grp.truckName} + {grp.diggerName}</span>
                <span style={{ color: P.txD, fontSize: 12, marginLeft: 12 }}>({grp.fleetNames.join(" + ")})</span>
              </div>
              <div style={{ ...cardS, borderTopLeftRadius: 0, borderTopRightRadius: 0, overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontFamily: ff, fontSize: 12, width: "100%", minWidth: 600 }}>
                  <thead><tr style={{ background: P.secBg, borderBottom: `2px solid ${P.bdS}` }}>
                    <th style={{ ...thS, minWidth: 230, position: "sticky", left: 0, background: P.secBg, zIndex: 2 }}>Variable</th>
                    <th style={{ ...thS, fontSize: 10 }}>Unit</th>
                    {grp.results.map((r, i) => <th key={i} style={{ ...thS, textAlign: "right", color: P.pri, fontWeight: 700, minWidth: 100 }}>{r.periodLabel}<div style={{ fontSize: 9, color: P.txD, fontWeight: 400 }}>{r.fleetName}</div></th>)}
                  </tr></thead>
                  <tbody>
                    {formulas.reduce((acc, f) => {
                      if (f.section) acc.push(<tr key={`sec-${f.key}`}><td colSpan={2 + grp.results.length} style={{ padding: "14px 10px 6px", color: P.pri, fontWeight: 700, fontSize: 13, borderBottom: `2px solid ${P.pri}20`, background: P.secBg }}>{f.section}</td></tr>);
                      acc.push(<tr key={f.key} style={{ background: f.hl ? P.hlBg : "transparent", borderBottom: `1px solid ${P.bd}` }}>
                        <td style={{ padding: "5px 10px", color: f.hl ? P.hlTx : P.txM, fontSize: 12, fontWeight: f.hl ? 600 : 400, position: "sticky", left: 0, background: f.hl ? P.hlBg : P.card, zIndex: 1 }}>{f.label}</td>
                        <td style={{ padding: "5px 6px", color: P.txD, fontSize: 10, fontFamily: mf }}>{f.unit}</td>
                        {grp.results.map((r, pi) => { const v = r.res?.[f.key]; const d = f.cur ? fmtC2(v) : fmt(v, f.dec || 2); return <td key={pi} style={{ padding: "5px 8px", textAlign: "right", color: f.hl ? P.hlTx : P.tx, fontWeight: f.hl ? 700 : 400, fontSize: 12, fontFamily: mf }}>{d}</td>; })}
                      </tr>); return acc;
                    }, [])}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>)}

        {/* ══ FORMULA EDITOR ══ */}
        {page === "formulas" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <ST icon="🧮">Formula Editor</ST>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" placeholder="Search..." value={formulaSearch} onChange={e => setFormulaSearch(e.target.value)} style={{ ...selS, width: 180 }} />
              <Btn onClick={addFormula} color={P.gn} solid>+ Add</Btn>
              <Btn onClick={() => { setFormulas(defaultFormulas()); setEditingFormula(null); }} color={P.rd} small>Reset</Btn>
            </div>
          </div>
          <div style={{ ...cardS, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", background: P.gnBg, borderColor: `${P.gn}33` }}>
            <span style={{ color: P.gn, fontWeight: 700, fontSize: 12 }}>🧪 Test:</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: P.txM, fontSize: 11, fontWeight: 600 }}>Period:</span><select value={testPeriodIdx} onChange={e => setTestPeriodIdx(parseInt(e.target.value))} style={{ ...selS, fontSize: 11 }}>{Array.from({ length: numPeriods }, (_, i) => <option key={i} value={i}>P{i + 1}</option>)}</select></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: P.txM, fontSize: 11, fontWeight: 600 }}>Fleet:</span><select value={testFleetIdx} onChange={e => setTestFleetIdx(parseInt(e.target.value))} style={{ ...selS, fontSize: 11 }}>{fleets.map((f, i) => <option key={i} value={i}>{f.name}</option>)}</select></div>
          </div>
          <div style={{ ...cardS, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontFamily: ff, fontSize: 12, width: "100%" }}>
              <thead><tr style={{ background: P.secBg, borderBottom: `2px solid ${P.bdS}` }}>
                {[["#", 30], ["Key", 110], ["Label", 190], ["Unit", 42], ["Formula", null], ["🧪 Test", 115], ["", 55]].map(([h, w], i) => (<th key={i} style={{ ...thS, width: w || "auto", textAlign: i === 5 ? "right" : "left", color: i === 5 ? P.gn : P.txM }}>{h}</th>))}
              </tr></thead>
              <tbody>
                {(() => { let lS = null, lG = null, rn = 0;
                  return formulas.filter(f => { if (!formulaSearch) return true; const s = formulaSearch.toLowerCase(); return [f.key, f.label, f.formula, f.section || "", f.group || ""].some(x => x.toLowerCase().includes(s)); }).flatMap((f, i) => {
                    const rows = [];
                    if (f.section && f.section !== lS) { lS = f.section; lG = null; rows.push(<tr key={`s${i}`}><td colSpan={7} style={{ padding: "16px 10px 6px", color: P.pri, fontWeight: 700, fontSize: 14, borderBottom: `2px solid ${P.pri}`, background: P.secBg }}>{f.section}</td></tr>); }
                    if (f.group && f.group !== lG) { lG = f.group; rows.push(<tr key={`g${i}`}><td colSpan={7} style={{ padding: "8px 10px 4px 22px", color: P.txD, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${P.bd}`, background: "#f8fafc" }}>▸ {f.group}</td></tr>); }
                    rn++; const isE = editingFormula === f.key; const tv = testResult ? testResult[f.key] : ""; const td = f.cur ? fmtC2(tv) : fmt(tv, f.dec || 2);
                    rows.push(<tr key={f.key} style={{ borderBottom: `1px solid ${P.bd}`, background: isE ? P.blBg : f.hl ? P.hlBg : "transparent" }}>
                      <td style={{ padding: "5px 8px", color: P.txD, fontSize: 10, fontFamily: mf }}>{rn}</td>
                      <td style={{ padding: "5px 8px" }}>{isE ? <input type="text" value={f.key} onChange={e => setFormulas(pr => pr.map(ff => ff.key === f.key ? { ...ff, key: e.target.value } : ff))} style={{ width: 100, padding: "3px 6px", background: P.input, border: `1px solid ${P.bl}`, borderRadius: 4, color: P.pri, fontFamily: mf, fontSize: 11 }} /> : <code style={{ color: P.pri, fontSize: 11, fontFamily: mf, fontWeight: 600 }}>{f.key}</code>}</td>
                      <td style={{ padding: "5px 8px" }}>{isE ? <input type="text" value={f.label} onChange={e => setFormulas(pr => pr.map(ff => ff.key === f.key ? { ...ff, label: e.target.value } : ff))} style={{ width: 180, padding: "3px 6px", background: P.input, border: `1px solid ${P.bl}`, borderRadius: 4, color: P.tx, fontFamily: ff, fontSize: 12 }} /> : <span style={{ color: f.hl ? P.hlTx : P.txM, fontWeight: f.hl ? 600 : 400 }}>{f.label}</span>}</td>
                      <td style={{ padding: "5px 6px", color: P.txD, fontSize: 11 }}>{f.unit}</td>
                      <td style={{ padding: "5px 8px" }}>{isE ? (<div style={{ display: "flex", gap: 6 }}><input type="text" value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") updateFormula(f.key, editText); if (e.key === "Escape") setEditingFormula(null); }} style={{ flex: 1, padding: "5px 10px", background: P.input, border: `1.5px solid ${P.bl}`, borderRadius: 6, color: P.tx, fontFamily: mf, fontSize: 12 }} autoFocus /><Btn onClick={() => updateFormula(f.key, editText)} color={P.gn} small solid>✓</Btn><Btn onClick={() => setEditingFormula(null)} color={P.txD} small>✕</Btn></div>) : (<code onClick={() => { setEditingFormula(f.key); setEditText(f.formula); }} style={{ color: "#475569", fontSize: 11, fontFamily: mf, cursor: "pointer", display: "block", padding: "4px 10px", borderRadius: 5, background: P.input }}>{f.formula}</code>)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: f.hl ? 700 : 500, color: tv === "" ? P.txD : f.hl ? P.gn : P.tx, fontSize: 12, fontFamily: mf, background: P.gnBg + "55" }}>{td}</td>
                      <td style={{ padding: "5px 6px", textAlign: "center" }}>{!isE && (<div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                        <button onClick={() => { setEditingFormula(f.key); setEditText(f.formula); }} style={{ background: P.blBg, border: `1px solid ${P.bl}22`, borderRadius: 5, color: P.bl, cursor: "pointer", fontSize: 11, padding: "3px 7px" }}>✏️</button>
                        <button onClick={() => setFormulas(pr => pr.filter(ff => ff.key !== f.key))} style={{ background: P.rdBg, border: `1px solid ${P.rd}22`, borderRadius: 5, color: P.rd, cursor: "pointer", fontSize: 11, padding: "3px 7px" }}>🗑️</button>
                      </div>)}</td>
                    </tr>); return rows;
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>)}

        {/* ══ TRUCKS ══ */}
        {page === "truck" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <ST icon="🚛">Truck Model Comparison</ST>
            <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => setTrucks(p => [...p, mkTruck({ truckName: `Truck ${p.length + 1}` })])} solid>+ New</Btn><Btn onClick={() => setTrucks(p => [...p, mkTruckL()])} color={P.bl}>+ Liebherr</Btn><Btn onClick={() => setTrucks(p => [...p, mkTruck()])} color={P.gn}>+ XCMG</Btn></div>
          </div>
          <div style={{ ...cardS, overflowX: "auto" }}><table style={{ borderCollapse: "collapse", fontFamily: ff, fontSize: 12, width: "100%" }}>
            <thead><tr style={{ background: P.secBg, borderBottom: `2px solid ${P.bdS}` }}>
              <th style={{ ...thS, minWidth: 190, position: "sticky", left: 0, background: P.secBg, zIndex: 2 }}>Parameter</th>
              <th style={{ ...thS, minWidth: 45, fontSize: 10 }}>Unit</th>
              {trucks.map((t, i) => (<th key={t.id} style={{ ...thS, minWidth: 145 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: mClr[i % mClr.length], fontWeight: 700, fontSize: 13 }}>Model {i + 1}</span>{trucks.length > 1 && <button onClick={() => setTrucks(p => p.filter((_, j) => j !== i))} style={{ background: P.rdBg, border: `1px solid ${P.rd}22`, borderRadius: 5, color: P.rd, cursor: "pointer", padding: "2px 7px" }}>×</button>}</div></th>))}
            </tr></thead>
            <tbody>{truckRows.map((r, i) => <CompRow key={i} {...r} models={trucks} onChange={updT} />)}</tbody>
          </table></div>
        </div>)}

        {/* ══ DIGGERS ══ */}
        {page === "digger" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <ST icon="⛏️">Digger Model Comparison</ST>
            <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => setDiggers(p => [...p, mkDigger({ diggerName: `Digger ${p.length + 1}` })])} solid>+ New</Btn><Btn onClick={() => setDiggers(p => [...p, mkDigger()])} color={P.bl}>+ 300t</Btn><Btn onClick={() => setDiggers(p => [...p, mkDigger4()])} color={P.gn}>+ 400t</Btn></div>
          </div>
          <div style={{ ...cardS, overflowX: "auto" }}><table style={{ borderCollapse: "collapse", fontFamily: ff, fontSize: 12, width: "100%" }}>
            <thead><tr style={{ background: P.secBg, borderBottom: `2px solid ${P.bdS}` }}>
              <th style={{ ...thS, minWidth: 190, position: "sticky", left: 0, background: P.secBg, zIndex: 2 }}>Parameter</th>
              <th style={{ ...thS, minWidth: 45, fontSize: 10 }}>Unit</th>
              {diggers.map((d, i) => (<th key={d.id} style={{ ...thS, minWidth: 145 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: mClr[i % mClr.length], fontWeight: 700, fontSize: 13 }}>Model {i + 1}</span>{diggers.length > 1 && <button onClick={() => setDiggers(p => p.filter((_, j) => j !== i))} style={{ background: P.rdBg, border: `1px solid ${P.rd}22`, borderRadius: 5, color: P.rd, cursor: "pointer", padding: "2px 7px" }}>×</button>}</div></th>))}
            </tr></thead>
            <tbody>{diggerRows.map((r, i) => <CompRow key={i} {...r} models={diggers} onChange={updD} />)}</tbody>
          </table></div>
        </div>)}

        {/* ══ SETTINGS ══ */}
        {page === "other" && (<div style={{ maxWidth: 620 }}>
          <ST icon="⚙️">General Assumptions</ST>
          <div style={{ ...cardS, padding: 24 }}>
            {[["moistureContent", "Moisture Content", "%", 0.001], ["exchangeRate", "Exchange Rate (AUD:USD)", "ratio", 0.01], ["discountRate", "Discount Rate", "%", 0.005], ["electricityCost", "Electricity Cost", "$/kWh", 0.001], ["dieselCost", "Diesel Cost", "$/L", 0.01], ["allInFitterPerYear", "All-in Fitter Rate", "$/hr"], ["mannedOperator", "Manned Operator Rate", "$/SMU"], ["calendarTime", "Calendar Time", "hrs/yr"], ["diggerFleetRoundingThreshold", "Digger Fleet Rounding", "frac", 0.05]].map(([k, l, u, s]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1, color: P.txM, fontSize: 14, fontWeight: 500 }}>{l}</div>
                <input type="number" value={otherA[k]} onChange={e => uO(k, parseFloat(e.target.value) || 0)} step={s || 0.01} style={{ width: 145, padding: "7px 12px", background: P.input, border: `1px solid ${P.bd}`, borderRadius: 7, color: P.tx, fontFamily: mf, fontSize: 14, textAlign: "right" }} />
                <span style={{ color: P.txD, fontSize: 12, fontWeight: 500, minWidth: 55 }}>{u}</span>
              </div>))}
          </div>
        </div>)}
      </div>
    </div>
  );
}
