import { useState, useMemo, useCallback } from "react";
import { Search, Filter, Pill, DollarSign, BarChart3, ChevronDown, ChevronUp, Star, Check, X, AlertCircle, Heart, Shield, Info, Phone, Mail, Globe, MapPin, Clock, FileText, Lock, Truck, Building2, Users, Calendar, CreditCard, AlertTriangle, CircleDollarSign, Stethoscope } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// MEDICARE PART D PLAN COST SIMULATION ENGINE — 2026 Benefit Year
// ═══════════════════════════════════════════════════════════════════════════
//
// 2026 Parameters (CMS Final Rule / IRA):
//   Deductible max: $615 | OOP Cap: $2,100 | Catastrophic: $0
//   Initial Coverage: 25% coinsurance (standard) | Insulin: $35/mo cap
//   National Base Premium: $38.99/mo | CA = PDP Region 32

const B26 = { MAX_DEDUCTIBLE: 615, OOP_CAP: 2100, STD_COINS: 0.25, INSULIN_CAP: 35, BASE_PREM: 38.99 };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PHASE_CLR = { Deductible: "#f59e0b", "Initial Coverage": "#3b82f6", Catastrophic: "#10b981" };
const fmt = n => "$" + Math.round(n).toLocaleString();
const fmt2 = n => "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ─── ZIP → Region mapping (California subset) ──────────────────────────────
const ZIP_DB = {
  "95003": { county: "Santa Cruz", st: "CA", rgn: 32 },
  "95060": { county: "Santa Cruz", st: "CA", rgn: 32 },
  "95062": { county: "Santa Cruz", st: "CA", rgn: 32 },
  "94301": { county: "Santa Clara", st: "CA", rgn: 32 },
  "94040": { county: "Santa Clara", st: "CA", rgn: 32 },
  "95014": { county: "Santa Clara", st: "CA", rgn: 32 },
  "94102": { county: "San Francisco", st: "CA", rgn: 32 },
  "90001": { county: "Los Angeles", st: "CA", rgn: 32 },
  "92101": { county: "San Diego", st: "CA", rgn: 32 },
  "95814": { county: "Sacramento", st: "CA", rgn: 32 },
};

// ─── 2026 PDP Plans for Region 32 (California) ─────────────────────────────
// Modeled from CMS Plan Information / Beneficiary Cost files
const PLANS = [
  {
    id: "S5820-003", name: "SilverScript Choice", org: "Aetna / CVS Health", type: "PDP",
    prem: 7.00, ded: 0, stars: 3.5, enhanced: false,
    tiers: {
      1: { lbl: "Pref Generic", copay: 0, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 5, coins: null, dedApply: false },
      3: { lbl: "Pref Brand", copay: 47, coins: null, dedApply: true },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.40, dedApply: true },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: true },
    },
    note: "Large national pharmacy network; $0 Tier 1 generics",
  },
  {
    id: "S5921-062", name: "Wellcare Value Script", org: "Centene / Wellcare", type: "PDP",
    prem: 0, ded: 615, stars: 3.0, enhanced: false,
    tiers: {
      1: { lbl: "Pref Generic", copay: 1, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 7, coins: null, dedApply: true },
      3: { lbl: "Pref Brand", copay: null, coins: 0.30, dedApply: true },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.50, dedApply: true },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: true },
    },
    note: "$0 premium; full $615 deductible; lowest-cost for minimal Rx use",
  },
  {
    id: "S5601-051", name: "Humana Walmart Value Rx", org: "Humana", type: "PDP",
    prem: 14.50, ded: 250, stars: 3.5, enhanced: false,
    tiers: {
      1: { lbl: "Pref Generic", copay: 0, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 4, coins: null, dedApply: false },
      3: { lbl: "Pref Brand", copay: 42, coins: null, dedApply: true },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.45, dedApply: true },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: true },
    },
    note: "Preferred pricing at Walmart/Sam's Club pharmacies",
  },
  {
    id: "S5810-032", name: "AARP MedicareRx Preferred", org: "UnitedHealthcare", type: "PDP",
    prem: 89.90, ded: 0, stars: 4.0, enhanced: true,
    tiers: {
      1: { lbl: "Pref Generic", copay: 1, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 6, coins: null, dedApply: false },
      3: { lbl: "Pref Brand", copay: 42, coins: null, dedApply: false },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.40, dedApply: false },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: false },
    },
    note: "No deductible on any tier; enhanced plan with broad formulary; 4-star rated",
  },
  {
    id: "S5810-035", name: "AARP MedicareRx Walgreens", org: "UnitedHealthcare", type: "PDP",
    prem: 16.40, ded: 615, stars: 4.0, enhanced: false,
    tiers: {
      1: { lbl: "Pref Generic", copay: 0, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 10, coins: null, dedApply: true },
      3: { lbl: "Pref Brand", copay: 47, coins: null, dedApply: true },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.50, dedApply: true },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: true },
    },
    note: "Preferred pricing at Walgreens; $0 Tier 1; popular budget option",
  },
  {
    id: "S6813-008", name: "Cigna Extra Rx", org: "Cigna Healthcare", type: "PDP",
    prem: 66.00, ded: 0, stars: 3.5, enhanced: true,
    tiers: {
      1: { lbl: "Pref Generic", copay: 0, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 5, coins: null, dedApply: false },
      3: { lbl: "Pref Brand", copay: 38, coins: null, dedApply: false },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.35, dedApply: false },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: false },
    },
    note: "Enhanced; $0 deductible; competitive Tier 4 coinsurance at 35%",
  },
  {
    id: "S7694-004", name: "Elixir RxSecure", org: "Elixir Insurance", type: "PDP",
    prem: 28.90, ded: 300, stars: 3.0, enhanced: false,
    tiers: {
      1: { lbl: "Pref Generic", copay: 0, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 8, coins: null, dedApply: false },
      3: { lbl: "Pref Brand", copay: 45, coins: null, dedApply: true },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.45, dedApply: true },
      5: { lbl: "Specialty", copay: null, coins: 0.25, dedApply: true },
    },
    note: "Mid-range premium; $300 partial deductible; balanced cost structure",
  },
  {
    id: "H0562-017", name: "Kaiser Senior Advantage Rx", org: "Kaiser Foundation", type: "MAPD",
    prem: 42.00, ded: 0, stars: 4.5, enhanced: true,
    tiers: {
      1: { lbl: "Pref Generic", copay: 5, coins: null, dedApply: false },
      2: { lbl: "Generic", copay: 10, coins: null, dedApply: false },
      3: { lbl: "Pref Brand", copay: 35, coins: null, dedApply: false },
      4: { lbl: "Non-Pref Drug", copay: null, coins: 0.30, dedApply: false },
      5: { lbl: "Specialty", copay: null, coins: 0.20, dedApply: false },
    },
    note: "MAPD — requires Kaiser membership; $0 deductible; highest star rating at 4.5",
  },
];

// ─── Drug → Tier mapping (simulated CMS Basic Drugs Formulary lookup) ─────
const TIER_MAP = {
  "ATORVASTATIN": { tier: 1, generic: true, insulin: false, spec: false },
  "DUPIXENT":     { tier: 5, generic: false, insulin: false, spec: true },
  "LISINOPRIL":   { tier: 1, generic: true, insulin: false, spec: false },
  "OMEPRAZOLE":   { tier: 1, generic: true, insulin: false, spec: false },
  "ELIQUIS":      { tier: 3, generic: false, insulin: false, spec: false },
  "METFORMIN":    { tier: 1, generic: true, insulin: false, spec: false },
  "JARDIANCE":    { tier: 3, generic: false, insulin: false, spec: false },
  "HUMIRA":       { tier: 5, generic: false, insulin: false, spec: true },
  "INSULIN":      { tier: 3, generic: false, insulin: true, spec: false },
  "OZEMPIC":      { tier: 5, generic: false, insulin: false, spec: true },
};

function tierFor(name) {
  const u = (name || "").toUpperCase();
  for (const [k, v] of Object.entries(TIER_MAP)) if (u.includes(k)) return v;
  return { tier: 2, generic: false, insulin: false, spec: false };
}

// ─── Coverage Phase Simulation Engine ───────────────────────────────────────
function simulate(plan, drugs) {
  // Build fill schedule
  const fills = [];
  for (const d of drugs) {
    if (!d.is_active) continue;
    const ti = tierFor(d.drug_name);
    const fpy = d.fills_per_year || Math.round(365 / (d.days_supply || 30));
    const cpf = d.avg_cost_per_fill || (d.projected_annual_cost || 0) / fpy || 0;
    const interval = 12 / fpy;
    for (let f = 0; f < fpy; f++) {
      fills.push({ name: d.drug_name, tier: ti.tier, cost: cpf, month: Math.min(Math.floor(f * interval), 11), insulin: ti.insulin, spec: ti.spec });
    }
  }
  fills.sort((a, b) => a.month - b.month);

  let dedRem = plan.ded, troop = 0, isCat = false;
  const drugT = {}, mo = Array.from({ length: 12 }, () => ({ drugCost: 0, patCost: 0, phase: "Deductible", troop: 0 }));
  let annDrug = 0, annPat = 0, catMonth = 0, dedMonth = 0;

  for (const f of fills) {
    const tc = plan.tiers[f.tier];
    if (!tc) continue;
    let pc = 0;

    if (isCat) {
      pc = 0;
    } else if (dedRem > 0 && tc.dedApply) {
      if (f.cost <= dedRem) {
        pc = f.cost; dedRem -= f.cost;
      } else {
        const dp = dedRem; dedRem = 0;
        pc = dp + tierCost(tc, f.cost - dp);
      }
      if (dedRem === 0 && !dedMonth) dedMonth = f.month + 1;
    } else {
      pc = tierCost(tc, f.cost);
    }

    if (f.insulin && pc > B26.INSULIN_CAP) pc = B26.INSULIN_CAP;

    troop += pc;
    if (troop >= B26.OOP_CAP && !isCat) {
      pc = Math.max(0, pc - (troop - B26.OOP_CAP));
      troop = B26.OOP_CAP; isCat = true; catMonth = f.month + 1;
    }

    if (!drugT[f.name]) drugT[f.name] = { name: f.name, tier: f.tier, totalCost: 0, patCost: 0, fills: 0 };
    drugT[f.name].totalCost += f.cost;
    drugT[f.name].patCost += pc;
    drugT[f.name].fills++;

    mo[f.month].drugCost += f.cost;
    mo[f.month].patCost += pc;
    annDrug += f.cost; annPat += pc;
  }

  // Assign phases to months
  let cumT = 0;
  for (let i = 0; i < 12; i++) {
    cumT += mo[i].patCost;
    mo[i].troop = Math.min(cumT, B26.OOP_CAP);
    mo[i].phase = cumT >= B26.OOP_CAP ? "Catastrophic" : (i < (dedMonth || 99) && plan.ded > 0 ? "Deductible" : "Initial Coverage");
  }

  return {
    plan, annPrem: plan.prem * 12, annDrug, annPat,
    annTotal: plan.prem * 12 + annPat,
    catMonth, dedMonth, monCat: isCat ? 12 - (catMonth || 12) : 0,
    drugs: Object.values(drugT), monthly: mo,
  };
}

function tierCost(tc, cost) {
  if (tc.copay != null) return Math.min(tc.copay, cost);
  if (tc.coins != null) return cost * tc.coins;
  return cost * B26.STD_COINS;
}

// ─── Approved drug list from previous module ────────────────────────────────
const DRUGS = [
  { id: "rx-001", drug_name: "ATORVASTATIN CALCIUM", strength: "40 MG", dosage_form: "TABLET", quantity_per_fill: 90, days_supply: 90, fills_per_year: 4, avg_cost_per_fill: 28.5, projected_annual_cost: 114, is_active: true },
  { id: "rx-002", drug_name: "DUPIXENT", strength: "300MG/2ML", dosage_form: "PEN INJECTOR", quantity_per_fill: 2, days_supply: 28, fills_per_year: 13, avg_cost_per_fill: 3842, projected_annual_cost: 49946, is_active: true },
  { id: "rx-003", drug_name: "LISINOPRIL", strength: "20 MG", dosage_form: "TABLET", quantity_per_fill: 30, days_supply: 30, fills_per_year: 12, avg_cost_per_fill: 8.5, projected_annual_cost: 102, is_active: true },
  { id: "rx-004", drug_name: "OMEPRAZOLE DR", strength: "20 MG", dosage_form: "CAPSULE", quantity_per_fill: 30, days_supply: 30, fills_per_year: 12, avg_cost_per_fill: 12.75, projected_annual_cost: 153, is_active: true },
  { id: "rx-005", drug_name: "ELIQUIS", strength: "5 MG", dosage_form: "TABLET", quantity_per_fill: 60, days_supply: 30, fills_per_year: 12, avg_cost_per_fill: 596, projected_annual_cost: 7152, is_active: true },
];



// ─── Sample Data (Enhanced) ─────────────────────────────────────────────────
const SAMPLE_PLANS = PLANS.map((p, idx) => ({
  id: p.id,
  name: p.name,
  carrier: p.org.split(" / ")[0],
  contractId: p.id,
  premium: p.prem,
  deductible: p.ded,
  starRating: p.stars,
  type: p.type,
  region: "California Region 32",
  serviceArea: "CA",
  formulary: DRUGS.reduce((acc, obj) => {
    const drug = obj.drug_name;
    const ti = tierFor(drug);
    const tc = p.tiers[ti.tier] || null;
    let copay = null;
    let covered = tc != null;
    let priorAuth = ti.spec; 
    let stepTherapy = false;
    if (covered && tc.copay != null) {
      copay = tc.copay;
      if (ti.insulin && copay > B26.INSULIN_CAP) copay = B26.INSULIN_CAP;
    }
    acc[drug] = {
      tier: ti.tier,
      copay: copay,
      covered: covered,
      priorAuth: priorAuth,
      stepTherapy: stepTherapy,
      quantityLimit: obj.quantity_per_fill + " / " + obj.days_supply + " days"
    };
    return acc;
  }, {}),
  tierCopays: Object.keys(p.tiers).reduce((acc, t) => {
    const tc = p.tiers[t];
    acc[t] = {
      preferred: tc.copay != null ? tc.copay : (tc.coins * 100) + "%",
      standard: tc.copay != null ? tc.copay + 5 : (tc.coins * 100) + "%",
      mailOrder: tc.copay != null ? tc.copay * 2 : (tc.coins * 100) + "%",
      label: tc.lbl
    };
    return acc;
  }, {}),
  gapCoverage: ["Tier 1"], 
  pharmacy: {
    preferred: "CVS/Walgreens/Walmart",
    standardNetwork: ["CVS", "Walgreens", "Rite Aid", "Costco", "Kroger", "Safeway"],
    mailOrder: true,
    mailOrderProvider: "Home Delivery Priority",
    mailOrderSavings: "Up to 20% savings on 90-day supply",
    specialtyPharmacy: "Accredo Specialty",
    pharmacyCount: "60,000+",
  },
  benefits: {
    initialCoverageLimit: B26.OOP_CAP, 
    catastrophicThreshold: B26.OOP_CAP,
    lisEligible: true,
    medicationTherapyMgmt: true,
    vaccinesCovered: ["Flu", "COVID-19", "Shingles", "Pneumonia", "Hepatitis B"],
    insulinSavings: true,
    insulinCap: 35,
  },
  contact: {
    phone: "1-800-MEDICARE",
    tty: "711",
    hours: "8 AM – 8 PM, 7 days/week",
    website: "www.medicare.gov",
    email: "support@medicare.gov",
  },
  enrollment: {
    aep: "Oct 15 – Dec 7",
    oep: "Jan 1 – Mar 31",
    effectiveDate: "Jan 1, 2026",
    lateEnrollmentPenalty: "None calculated",
  },
  documents: [
    { name: "Summary of Benefits", type: "PDF" },
    { name: "Formulary (Drug List)", type: "PDF" },
    { name: "Evidence of Coverage", type: "PDF" },
  ],
}));

const ALL_DRUGS = DRUGS.map(d => d.drug_name);

const DRUG_OPTIONS = {
  "ATORVASTATIN CALCIUM": {
    genericName: "Atorvastatin Calcium",
    drugClass: "Statin (Cholesterol)",
    dosages: ["10 mg", "20 mg", "40 mg", "80 mg"],
    defaultDosage: "40 mg",
    quantities: [30, 90],
    defaultQuantity: 90,
    frequencies: ["Once daily"],
    defaultFrequency: "Once daily",
    forms: ["Tablet"],
    defaultForm: "Tablet",
  },
  "DUPIXENT": {
    genericName: "Dupilumab",
    drugClass: "Monoclonal Antibody",
    dosages: ["200mg/1.14mL", "300mg/2mL"],
    defaultDosage: "300mg/2mL",
    quantities: [2],
    defaultQuantity: 2,
    frequencies: ["Every 2 weeks"],
    defaultFrequency: "Every 2 weeks",
    forms: ["Pen Injector"],
    defaultForm: "Pen Injector",
  },
  "LISINOPRIL": {
    genericName: "Lisinopril",
    drugClass: "ACE Inhibitor",
    dosages: ["10 mg", "20 mg", "40 mg"],
    defaultDosage: "20 mg",
    quantities: [30, 90],
    defaultQuantity: 30,
    frequencies: ["Once daily"],
    defaultFrequency: "Once daily",
    forms: ["Tablet"],
    defaultForm: "Tablet",
  },
  "OMEPRAZOLE DR": {
    genericName: "Omeprazole",
    drugClass: "Proton Pump Inhibitor",
    dosages: ["10 mg", "20 mg", "40 mg"],
    defaultDosage: "20 mg",
    quantities: [30, 90],
    defaultQuantity: 30,
    frequencies: ["Once daily"],
    defaultFrequency: "Once daily",
    forms: ["Capsule"],
    defaultForm: "Capsule",
  },
  "ELIQUIS": {
    genericName: "Apixaban",
    drugClass: "Anticoagulant",
    dosages: ["2.5 mg", "5 mg"],
    defaultDosage: "5 mg",
    quantities: [60],
    defaultQuantity: 60,
    frequencies: ["Twice daily"],
    defaultFrequency: "Twice daily",
    forms: ["Tablet"],
    defaultForm: "Tablet",
  },
};

const TIER_LABELS = { 1: "Preferred Generic", 2: "Generic", 3: "Preferred Brand", 4: "Non-Preferred Brand", 5: "Specialty" };
const TIER_COLORS = { 1: "#059669", 2: "#0891b2", 3: "#d97706", 4: "#dc2626", 5: "#7c3aed" };

// ─── Coverage Phase Data ────────────────────────────────────────────────────
const COVERAGE_PHASES = [
  { name: "Deductible Phase", range: "$0 – $590", description: "You pay 100% of your drug costs until you reach the deductible amount. Some plans have $0 deductible.", youPay: "100%", planPays: "0%", color: "#ef4444", icon: "💰" },
  { name: "Initial Coverage", range: "$590 – $5,030", description: "After meeting your deductible, you pay copays or coinsurance. Your plan pays the rest.", youPay: "25%", planPays: "75%", color: "#f59e0b", icon: "📋" },
  { name: "Coverage Gap (Donut Hole)", range: "$5,030 – $8,000", description: "In 2025, you pay no more than 25% for brand-name drugs and generics in the gap thanks to the Inflation Reduction Act.", youPay: "25%", planPays: "75%", color: "#8b5cf6", icon: "🍩" },
  { name: "Catastrophic Coverage", range: "Above $8,000", description: "After $2,000 in true out-of-pocket costs, you pay $0 for covered drugs for the rest of the year.", youPay: "$0", planPays: "100%", color: "#10b981", icon: "🛡️" },
];

// ─── Utility Components ─────────────────────────────────────────────────────
function StarRating({ rating }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={14} fill={i < full ? "#f59e0b" : i === full && half ? "url(#halfStar)" : "none"} stroke={i < full || (i === full && half) ? "#f59e0b" : "#d1d5db"} strokeWidth={1.5} />
      ))}
      <span style={{ marginLeft: 4, fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{rating}</span>
      <svg width={0} height={0}><defs><linearGradient id="halfStar"><stop offset="50%" stopColor="#f59e0b" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs></svg>
    </div>
  );
}

function Badge({ children, color = "#2563eb", bg }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color, background: bg || `${color}15`, border: `1px solid ${color}30` }}>
      {children}
    </span>
  );
}

function TabButton({ active, onClick, children, icon }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", border: "none", borderBottom: active ? "3px solid #1e40af" : "3px solid transparent", background: active ? "#eff6ff" : "transparent", color: active ? "#1e40af" : "#6b7280", fontWeight: active ? 700 : 500, fontSize: 14, cursor: "pointer", transition: "all 0.2s", borderRadius: "8px 8px 0 0" }}>
      {icon}{children}
    </button>
  );
}

function DetailTabBtn({ active, onClick, children, icon }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", borderRadius: 8, background: active ? "#1e40af" : "#f3f4f6", color: active ? "#fff" : "#6b7280", fontWeight: active ? 700 : 500, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
      {icon}{children}
    </button>
  );
}

function InfoRow({ icon, label, value, highlight }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: highlight ? 700 : 500, color: highlight ? "#1e40af" : "#374151", lineHeight: 1.4 }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Plan Card with Detail Dropdown ─────────────────────────────────────────
function PlanCard({ plan, selectedDrugs, expanded, onToggle }) {
  const [detailTab, setDetailTab] = useState("overview");

  const coveredDrugs = selectedDrugs.filter((d) => plan.formulary[d]?.covered);
  const uncoveredDrugs = selectedDrugs.filter((d) => !plan.formulary[d]?.covered);

  const estimatedAnnualCost = useMemo(() => {
    let cost = plan.premium * 12 + plan.deductible;
    selectedDrugs.forEach((drug) => {
      const info = plan.formulary[drug];
      if (info?.covered && info.copay != null) cost += info.copay * 12;
    });
    return cost;
  }, [plan, selectedDrugs]);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: expanded ? "2px solid #3b82f6" : "1px solid #e5e7eb", overflow: "hidden", transition: "box-shadow 0.2s, transform 0.15s", boxShadow: expanded ? "0 8px 30px rgba(37,99,235,0.12)" : "0 1px 3px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div onClick={onToggle} style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", background: expanded ? "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)" : "#fff" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>{plan.name}</h3>
            <Badge color="#6b7280">{plan.type}</Badge>
            {plan.premium === 0 && <Badge color="#059669">$0 Premium</Badge>}
            {plan.deductible === 0 && <Badge color="#2563eb">$0 Deductible</Badge>}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{plan.carrier} · {plan.contractId} · {plan.region}</p>
          <div style={{ marginTop: 8 }}><StarRating rating={plan.starRating} /></div>
        </div>
        <div style={{ textAlign: "right", minWidth: 140 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e40af" }}>${plan.premium.toFixed(2)}<span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>/mo</span></div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Deductible: <strong>${plan.deductible}</strong></div>
          {selectedDrugs.length > 0 && (
            <div style={{ marginTop: 8, padding: "4px 12px", borderRadius: 8, background: "#dbeafe", fontSize: 12, fontWeight: 600, color: "#1e40af" }}>Est. Annual: ${estimatedAnnualCost.toLocaleString()}</div>
          )}
        </div>
        <div style={{ marginLeft: 16, paddingTop: 4 }}>{expanded ? <ChevronUp size={20} color="#3b82f6" /> : <ChevronDown size={20} color="#9ca3af" />}</div>
      </div>

      {/* Drug Coverage Summary Bar */}
      {selectedDrugs.length > 0 && (
        <div style={{ padding: "0 24px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {coveredDrugs.map((d) => <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#166534" }}><Check size={11} /> {d}</span>)}
          {uncoveredDrugs.map((d) => <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#fee2e2", color: "#991b1b" }}><X size={11} /> {d}</span>)}
        </div>
      )}

      {/* ═══ Expanded Detail Dropdown ═══ */}
      {expanded && (
        <div style={{ borderTop: "2px solid #e5e7eb" }}>
          {/* Detail Tab Bar */}
          <div style={{ display: "flex", gap: 6, padding: "16px 24px", background: "#f9fafb", overflowX: "auto", borderBottom: "1px solid #e5e7eb" }}>
            <DetailTabBtn active={detailTab === "overview"} onClick={() => setDetailTab("overview")} icon={<Info size={13} />}>Overview</DetailTabBtn>
            <DetailTabBtn active={detailTab === "costs"} onClick={() => setDetailTab("costs")} icon={<CircleDollarSign size={13} />}>Cost Structure</DetailTabBtn>
            <DetailTabBtn active={detailTab === "formulary"} onClick={() => setDetailTab("formulary")} icon={<Pill size={13} />}>Formulary</DetailTabBtn>
            <DetailTabBtn active={detailTab === "pharmacy"} onClick={() => setDetailTab("pharmacy")} icon={<Building2 size={13} />}>Pharmacy Network</DetailTabBtn>
            <DetailTabBtn active={detailTab === "benefits"} onClick={() => setDetailTab("benefits")} icon={<Heart size={13} />}>Benefits</DetailTabBtn>
            <DetailTabBtn active={detailTab === "contact"} onClick={() => setDetailTab("contact")} icon={<Phone size={13} />}>Contact & Enroll</DetailTabBtn>
          </div>

          <div style={{ padding: "20px 24px" }}>

            {/* ── Overview Tab ── */}
            {detailTab === "overview" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Monthly Premium", value: `$${plan.premium.toFixed(2)}`, color: "#1e40af", bg: "#dbeafe" },
                    { label: "Annual Deductible", value: `$${plan.deductible}`, color: "#d97706", bg: "#fef3c7" },
                    { label: "Star Rating", value: `${plan.starRating} out of 5`, color: "#b45309", bg: "#fef9c3" },
                    { label: "Network Pharmacies", value: plan.pharmacy.pharmacyCount, color: "#059669", bg: "#dcfce7" },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: 16, borderRadius: 12, background: item.bg, textAlign: "center" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <InfoRow icon={<Shield size={15} color="#6b7280" />} label="Plan Type" value={`${plan.type} — Prescription Drug Plan`} />
                <InfoRow icon={<FileText size={15} color="#6b7280" />} label="Contract ID" value={plan.contractId} />
                <InfoRow icon={<MapPin size={15} color="#6b7280" />} label="Service Area" value={plan.serviceArea} />
                <InfoRow icon={<Users size={15} color="#6b7280" />} label="Carrier" value={plan.carrier} />
                <InfoRow icon={<Calendar size={15} color="#6b7280" />} label="Effective Date" value={plan.enrollment.effectiveDate} />
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Plan Documents</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {plan.documents.map((doc, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#374151" }}>
                        <FileText size={13} color="#dc2626" />{doc.name}<span style={{ fontSize: 10, color: "#9ca3af" }}>{doc.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Cost Structure Tab ── */}
            {detailTab === "costs" && (
              <div>
                <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Tier-Based Cost Sharing</h4>
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Tier</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Preferred Pharmacy</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Standard Pharmacy</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Mail Order (90-day)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(plan.tierCopays).map(([tier, costs]) => (
                        <tr key={tier} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 4, background: TIER_COLORS[tier], display: "inline-block" }} />
                              <span style={{ fontWeight: 600 }}>Tier {tier}</span>
                              <span style={{ fontSize: 11, color: "#9ca3af" }}>({costs.label})</span>
                            </div>
                          </td>
                          <td style={{ textAlign: "center", padding: "12px 14px", fontWeight: 600 }}>{typeof costs.preferred === "number" ? `$${costs.preferred}` : costs.preferred}</td>
                          <td style={{ textAlign: "center", padding: "12px 14px", fontWeight: 600 }}>{typeof costs.standard === "number" ? `$${costs.standard}` : costs.standard}</td>
                          <td style={{ textAlign: "center", padding: "12px 14px", fontWeight: 600 }}>{typeof costs.mailOrder === "number" ? `$${costs.mailOrder}` : costs.mailOrder}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
                  <div style={{ padding: 16, borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Annual Deductible</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#dc2626" }}>${plan.deductible}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Applies before plan pays its share</div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Catastrophic Threshold</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#059669" }}>${plan.benefits.catastrophicThreshold.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>$0 copay after this OOP amount</div>
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#faf5ff", border: "1px solid #e9d5ff" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b21a8", marginBottom: 4 }}>Coverage Gap (Donut Hole) Coverage</div>
                  <div style={{ fontSize: 13, color: "#7c3aed" }}>This plan covers <strong>{plan.gapCoverage.join(", ")}</strong> drugs during the coverage gap phase.</div>
                </div>

                <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}><AlertTriangle size={13} />Late Enrollment Penalty</div>
                  <div style={{ fontSize: 13, color: "#a16207" }}>{plan.enrollment.lateEnrollmentPenalty}</div>
                </div>
              </div>
            )}

            {/* ── Formulary Tab ── */}
            {detailTab === "formulary" && (
              <div>
                <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Drug Formulary</h4>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9ca3af" }}>Showing all drugs in the sample formulary. Your selected drugs are highlighted.</p>
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Drug</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Tier</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Copay</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Status</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Restrictions</th>
                        <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>Qty Limit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(plan.formulary).map(([drug, info]) => (
                        <tr key={drug} style={{ background: selectedDrugs.includes(drug) ? "#eff6ff" : "transparent", borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "10px 14px", fontWeight: selectedDrugs.includes(drug) ? 700 : 500 }}>
                            {selectedDrugs.includes(drug) && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: "#3b82f6", marginRight: 8 }} />}
                            {drug}
                          </td>
                          <td style={{ textAlign: "center", padding: "10px 14px" }}><Badge color={TIER_COLORS[info.tier]}>{`T${info.tier}`}</Badge></td>
                          <td style={{ textAlign: "center", padding: "10px 14px", fontWeight: 600 }}>{info.covered ? (info.copay != null ? `$${info.copay}` : "N/A") : "—"}</td>
                          <td style={{ textAlign: "center", padding: "10px 14px" }}>
                            {info.covered
                              ? <span style={{ color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><Check size={13} /> Covered</span>
                              : <span style={{ color: "#dc2626", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><X size={13} /> Not Covered</span>}
                          </td>
                          <td style={{ textAlign: "center", padding: "10px 14px" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                              {info.priorAuth && <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>PA</span>}
                              {info.stepTherapy && <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}>ST</span>}
                              {!info.priorAuth && !info.stepTherapy && <span style={{ fontSize: 11, color: "#9ca3af" }}>None</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: "center", padding: "10px 14px", fontSize: 11, color: "#6b7280" }}>{info.quantityLimit || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 11, color: "#9ca3af" }}>
                  <span><strong style={{ color: "#92400e", background: "#fef3c7", padding: "1px 6px", borderRadius: 4 }}>PA</strong> = Prior Authorization</span>
                  <span><strong style={{ color: "#991b1b", background: "#fee2e2", padding: "1px 6px", borderRadius: 4 }}>ST</strong> = Step Therapy</span>
                </div>
              </div>
            )}

            {/* ── Pharmacy Network Tab ── */}
            {detailTab === "pharmacy" && (
              <div>
                <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Pharmacy Network</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  <div style={{ padding: 20, borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}><Building2 size={18} color="#059669" /></div>
                      <div><div style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>Preferred Pharmacy</div><div style={{ fontSize: 11, color: "#6b7280" }}>Lowest copays available</div></div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#059669", marginBottom: 8 }}>{plan.pharmacy.preferred}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Network includes <strong>{plan.pharmacy.pharmacyCount}</strong> pharmacies nationwide</div>
                  </div>
                  <div style={{ padding: 20, borderRadius: 14, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" }}><Truck size={18} color="#1e40af" /></div>
                      <div><div style={{ fontSize: 14, fontWeight: 700, color: "#1e40af" }}>Mail Order</div><div style={{ fontSize: 11, color: "#6b7280" }}>90-day supply delivered</div></div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e40af", marginBottom: 4 }}>{plan.pharmacy.mailOrderProvider}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{plan.pharmacy.mailOrderSavings}</div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>Standard Network Pharmacies</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {plan.pharmacy.standardNetwork.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, background: p === plan.pharmacy.preferred ? "#dcfce7" : "#f9fafb", border: p === plan.pharmacy.preferred ? "2px solid #86efac" : "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, color: "#374151" }}>
                        <Building2 size={14} color={p === plan.pharmacy.preferred ? "#059669" : "#9ca3af"} />
                        {p}
                        {p === plan.pharmacy.preferred && <span style={{ fontSize: 9, fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>Preferred</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#faf5ff", border: "1px solid #e9d5ff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#6b21a8", marginBottom: 4 }}><Stethoscope size={13} />Specialty Pharmacy</div>
                  <div style={{ fontSize: 13, color: "#7c3aed" }}>{plan.pharmacy.specialtyPharmacy}</div>
                </div>
              </div>
            )}

            {/* ── Benefits Tab ── */}
            {detailTab === "benefits" && (
              <div>
                <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Plan Benefits & Features</h4>

                {plan.benefits.insulinSavings && (
                  <div style={{ padding: 16, borderRadius: 12, background: "linear-gradient(135deg, #dbeafe, #e0e7ff)", border: "1px solid #93c5fd", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>💉</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e40af" }}>Insulin Savings Program</div>
                      <div style={{ fontSize: 13, color: "#3b82f6" }}>Pay no more than <strong>${plan.benefits.insulinCap}/month</strong> for covered insulin products</div>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                  <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>Covered Vaccines</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {plan.benefits.vaccinesCovered.map((v, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
                          <Check size={13} color="#059669" />{v}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>Additional Features</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "Low-Income Subsidy (LIS) Eligible", active: plan.benefits.lisEligible },
                        { label: "Medication Therapy Management", active: plan.benefits.medicationTherapyMgmt },
                        { label: "Mail Order Available", active: plan.pharmacy.mailOrder },
                        { label: "Insulin Savings", active: plan.benefits.insulinSavings },
                      ].map((feat, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: feat.active ? "#374151" : "#9ca3af" }}>
                          {feat.active ? <Check size={13} color="#059669" /> : <X size={13} color="#d1d5db" />}{feat.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>Initial Coverage Limit</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", marginTop: 4 }}>${plan.benefits.initialCoverageLimit.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>Catastrophic Threshold</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", marginTop: 4 }}>${plan.benefits.catastrophicThreshold.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Contact & Enrollment Tab ── */}
            {detailTab === "contact" && (
              <div>
                <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Contact Information</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
                  <div style={{ padding: 20, borderRadius: 14, border: "1px solid #e5e7eb" }}>
                    <InfoRow icon={<Phone size={15} color="#1e40af" />} label="Phone" value={plan.contact.phone} highlight />
                    <InfoRow icon={<Phone size={15} color="#6b7280" />} label="TTY" value={plan.contact.tty} />
                    <InfoRow icon={<Clock size={15} color="#6b7280" />} label="Hours" value={plan.contact.hours} />
                    <InfoRow icon={<Globe size={15} color="#6b7280" />} label="Website" value={plan.contact.website} />
                    <InfoRow icon={<Mail size={15} color="#6b7280" />} label="Email" value={plan.contact.email} />
                  </div>
                  <div style={{ padding: 20, borderRadius: 14, border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Enrollment Periods</div>
                    <div style={{ padding: 14, borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 4 }}><Calendar size={13} />Annual Enrollment Period (AEP)</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#1e3a5f" }}>{plan.enrollment.aep}</div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 4 }}><Calendar size={13} />Open Enrollment Period (OEP)</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#166534" }}>{plan.enrollment.oep}</div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Effective Date</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#374151" }}>{plan.enrollment.effectiveDate}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button style={{ flex: 1, minWidth: 200, padding: "14px 24px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #1e40af, #3b82f6)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <CreditCard size={18} />Enroll in This Plan
                  </button>
                  <button style={{ flex: 1, minWidth: 200, padding: "14px 24px", borderRadius: 12, border: "2px solid #1e40af", background: "#fff", color: "#1e40af", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Phone size={18} />Call to Learn More
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coverage Phase Visual ──────────────────────────────────────────────────
function CoveragePhaseSection() {
  const [activePhase, setActivePhase] = useState(null);
  return (
    <div style={{ padding: "32px 0" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Part D Coverage Phases</h2>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24, maxWidth: 600 }}>Medicare Part D coverage works in four phases. Understanding these phases helps you estimate your total drug costs for the year.</p>
      <div style={{ display: "flex", gap: 0, marginBottom: 32, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        {COVERAGE_PHASES.map((phase, i) => (
          <div key={i} onClick={() => setActivePhase(activePhase === i ? null : i)} style={{ flex: i === 1 ? 2 : 1, padding: "20px 16px", background: activePhase === i ? phase.color : `${phase.color}18`, color: activePhase === i ? "#fff" : phase.color, cursor: "pointer", transition: "all 0.3s", textAlign: "center", borderRight: i < 3 ? "2px solid #fff" : "none" }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{phase.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{phase.name}</div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85, fontWeight: 500 }}>{phase.range}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {COVERAGE_PHASES.map((phase, i) => (
          <div key={i} style={{ padding: 20, borderRadius: 14, background: "#fff", border: activePhase === i ? `2px solid ${phase.color}` : "1px solid #e5e7eb", boxShadow: activePhase === i ? `0 4px 16px ${phase.color}25` : "none", transition: "all 0.3s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${phase.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{phase.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{phase.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{phase.range}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "0 0 12px" }}>{phase.description}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#fef2f2", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>You Pay</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#dc2626" }}>{phase.youPay}</div>
              </div>
              <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#f0fdf4", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Plan Pays</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{phase.planPays}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cost Estimator ─────────────────────────────────────────────────────────
// ─── IRMAA Bracket Data (2025 amounts based on 2023 tax returns) ────────────
const IRMAA_BRACKETS = {
  single: [
    { min: 0, max: 106000, surcharge: 0, label: "≤ $106,000", tier: "No surcharge" },
    { min: 106001, max: 133000, surcharge: 12.90, label: "$106,001 – $133,000", tier: "Tier 1" },
    { min: 133001, max: 167000, surcharge: 33.30, label: "$133,001 – $167,000", tier: "Tier 2" },
    { min: 167001, max: 200000, surcharge: 53.80, label: "$167,001 – $200,000", tier: "Tier 3" },
    { min: 200001, max: 500000, surcharge: 74.20, label: "$200,001 – $500,000", tier: "Tier 4" },
    { min: 500001, max: Infinity, surcharge: 81.00, label: "> $500,000", tier: "Tier 5" },
  ],
  married: [
    { min: 0, max: 212000, surcharge: 0, label: "≤ $212,000", tier: "No surcharge" },
    { min: 212001, max: 266000, surcharge: 12.90, label: "$212,001 – $266,000", tier: "Tier 1" },
    { min: 266001, max: 334000, surcharge: 33.30, label: "$266,001 – $334,000", tier: "Tier 2" },
    { min: 334001, max: 400000, surcharge: 53.80, label: "$334,001 – $400,000", tier: "Tier 3" },
    { min: 400001, max: 750000, surcharge: 74.20, label: "$400,001 – $750,000", tier: "Tier 4" },
    { min: 750001, max: Infinity, surcharge: 81.00, label: "> $750,000", tier: "Tier 5" },
  ],
  marriedSeparate: [
    { min: 0, max: 106000, surcharge: 0, label: "≤ $106,000", tier: "No surcharge" },
    { min: 106001, max: 394000, surcharge: 74.20, label: "$106,001 – $394,000", tier: "Tier 4" },
    { min: 394001, max: Infinity, surcharge: 81.00, label: "> $394,000", tier: "Tier 5" },
  ],
};

const FILING_STATUS_LABELS = {
  single: "Single / Head of Household",
  married: "Married Filing Jointly",
  marriedSeparate: "Married Filing Separately",
};

function IrmaaEstimator() {
  const [showIrmaa, setShowIrmaa] = useState(false);
  const [filingStatus, setFilingStatus] = useState("single");
  const [income, setIncome] = useState("");
  const [incomeError, setIncomeError] = useState("");

  const parsedIncome = useMemo(() => {
    const cleaned = income.replace(/[^0-9]/g, "");
    return cleaned ? parseInt(cleaned, 10) : 0;
  }, [income]);

  const activeBracket = useMemo(() => {
    if (!parsedIncome) return null;
    const brackets = IRMAA_BRACKETS[filingStatus];
    return brackets.find((b) => parsedIncome >= b.min && parsedIncome <= b.max) || null;
  }, [parsedIncome, filingStatus]);

  const formatCurrency = (val) => {
    if (!val) return "";
    return "$" + parseInt(val.replace(/[^0-9]/g, ""), 10).toLocaleString();
  };

  const handleIncomeChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    if (raw.length > 10) return;
    setIncome(raw ? "$" + parseInt(raw, 10).toLocaleString() : "");
    setIncomeError("");
  };

  const brackets = IRMAA_BRACKETS[filingStatus];

  return (
    <div style={{ marginTop: 36 }}>
      {/* Toggle Header */}
      <div
        onClick={() => setShowIrmaa(!showIrmaa)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderRadius: showIrmaa ? "14px 14px 0 0" : 14,
          background: showIrmaa ? "linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)" : "#f9fafb",
          border: showIrmaa ? "2px solid #fbbf24" : "1px solid #e5e7eb",
          cursor: "pointer", transition: "all 0.2s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: showIrmaa ? "#fde68a" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
            <CircleDollarSign size={20} color={showIrmaa ? "#92400e" : "#6b7280"} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: showIrmaa ? "#92400e" : "#374151" }}>IRMAA Surcharge Estimator</div>
            <div style={{ fontSize: 12, color: showIrmaa ? "#a16207" : "#9ca3af" }}>Income-Related Monthly Adjustment Amount — optional Part D premium surcharge for higher earners</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: showIrmaa ? "#92400e" : "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{showIrmaa ? "Collapse" : "Expand"}</span>
          {showIrmaa ? <ChevronUp size={18} color="#92400e" /> : <ChevronDown size={18} color="#9ca3af" />}
        </div>
      </div>

      {showIrmaa && (
        <div style={{ border: "2px solid #fbbf24", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
          {/* Info Banner */}
          <div style={{ padding: "14px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Info size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
              IRMAA is an additional amount added to your Part D premium if your modified adjusted gross income (MAGI) exceeds certain thresholds. Medicare uses your tax return from <strong>2 years prior</strong> to determine your surcharge. These brackets are based on 2025 CMS guidelines.
            </div>
          </div>

          <div style={{ padding: "20px 20px 24px" }}>
            {/* Input Controls */}
            <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ minWidth: 220 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Filing Status</label>
                <select
                  value={filingStatus}
                  onChange={(e) => setFilingStatus(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 14, fontWeight: 600, color: "#374151", background: "#fff", cursor: "pointer", outline: "none", boxSizing: "border-box" }}
                >
                  <option value="single">Single / Head of Household</option>
                  <option value="married">Married Filing Jointly</option>
                  <option value="marriedSeparate">Married Filing Separately</option>
                </select>
              </div>
              <div style={{ minWidth: 220 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Modified Adjusted Gross Income (MAGI)</label>
                <input
                  type="text"
                  placeholder="$0"
                  value={income}
                  onChange={handleIncomeChange}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: activeBracket && activeBracket.surcharge > 0 ? "2px solid #f59e0b" : "1.5px solid #d1d5db", fontSize: 16, fontWeight: 700, color: "#374151", background: "#fff", outline: "none", boxSizing: "border-box", letterSpacing: 0.5 }}
                />
              </div>

              {/* Result Badge */}
              {parsedIncome > 0 && activeBracket && (
                <div style={{
                  padding: "10px 20px", borderRadius: 12,
                  background: activeBracket.surcharge > 0 ? "linear-gradient(135deg, #fef2f2, #fffbeb)" : "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
                  border: activeBracket.surcharge > 0 ? "2px solid #f59e0b" : "2px solid #86efac",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  {activeBracket.surcharge > 0 ? <AlertTriangle size={20} color="#d97706" /> : <Check size={20} color="#059669" />}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Your IRMAA Surcharge</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: activeBracket.surcharge > 0 ? "#dc2626" : "#059669" }}>
                      {activeBracket.surcharge > 0 ? `+$${activeBracket.surcharge.toFixed(2)}/mo` : "$0.00/mo"}
                    </div>
                    {activeBracket.surcharge > 0 && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>+${(activeBracket.surcharge * 12).toFixed(2)}/year added to your Part D premium</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bracket Tables — Side by Side */}
            <div style={{ display: "grid", gridTemplateColumns: filingStatus === "marriedSeparate" ? "1fr" : "1fr 1fr", gap: 16 }}>
              {/* Single Filers Table */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Users size={14} color="#6b7280" />
                  {filingStatus === "marriedSeparate" ? "Married Filing Separately" : "Single / Head of Household"}
                </div>
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th style={{ textAlign: "left", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>MAGI Range</th>
                        <th style={{ textAlign: "center", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>Tier</th>
                        <th style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>Monthly Surcharge</th>
                        <th style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>Annual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filingStatus === "marriedSeparate" ? IRMAA_BRACKETS.marriedSeparate : IRMAA_BRACKETS.single).map((bracket, i) => {
                        const isActive = parsedIncome > 0 && activeBracket && (filingStatus === "single" || filingStatus === "marriedSeparate") && parsedIncome >= bracket.min && parsedIncome <= bracket.max;
                        return (
                          <tr key={i} style={{ background: isActive ? "#fef3c7" : "transparent", borderBottom: "1px solid #f3f4f6", transition: "background 0.2s" }}>
                            <td style={{ padding: "10px 12px", fontWeight: isActive ? 700 : 500, color: isActive ? "#92400e" : "#374151" }}>
                              {isActive && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: "#f59e0b", marginRight: 6 }} />}
                              {bracket.label}
                            </td>
                            <td style={{ textAlign: "center", padding: "10px 12px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: bracket.surcharge > 0 ? "#fef3c7" : "#dcfce7", color: bracket.surcharge > 0 ? "#92400e" : "#166534", border: bracket.surcharge > 0 ? "1px solid #fde68a" : "1px solid #86efac" }}>
                                {bracket.tier}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, color: bracket.surcharge > 0 ? "#dc2626" : "#059669" }}>
                              {bracket.surcharge > 0 ? `+$${bracket.surcharge.toFixed(2)}` : "$0.00"}
                            </td>
                            <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#6b7280", fontSize: 11 }}>
                              {bracket.surcharge > 0 ? `+$${(bracket.surcharge * 12).toFixed(2)}` : "$0.00"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Married Filing Jointly Table (shown unless marriedSeparate) */}
              {filingStatus !== "marriedSeparate" && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Heart size={14} color="#6b7280" />
                    Married Filing Jointly
                  </div>
                  <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          <th style={{ textAlign: "left", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>MAGI Range</th>
                          <th style={{ textAlign: "center", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>Tier</th>
                          <th style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>Monthly Surcharge</th>
                          <th style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb" }}>Annual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {IRMAA_BRACKETS.married.map((bracket, i) => {
                          const isActive = parsedIncome > 0 && activeBracket && filingStatus === "married" && parsedIncome >= bracket.min && parsedIncome <= bracket.max;
                          return (
                            <tr key={i} style={{ background: isActive ? "#fef3c7" : "transparent", borderBottom: "1px solid #f3f4f6", transition: "background 0.2s" }}>
                              <td style={{ padding: "10px 12px", fontWeight: isActive ? 700 : 500, color: isActive ? "#92400e" : "#374151" }}>
                                {isActive && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: "#f59e0b", marginRight: 6 }} />}
                                {bracket.label}
                              </td>
                              <td style={{ textAlign: "center", padding: "10px 12px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: bracket.surcharge > 0 ? "#fef3c7" : "#dcfce7", color: bracket.surcharge > 0 ? "#92400e" : "#166534", border: bracket.surcharge > 0 ? "1px solid #fde68a" : "1px solid #86efac" }}>
                                  {bracket.tier}
                                </span>
                              </td>
                              <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, color: bracket.surcharge > 0 ? "#dc2626" : "#059669" }}>
                                {bracket.surcharge > 0 ? `+$${bracket.surcharge.toFixed(2)}` : "$0.00"}
                              </td>
                              <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#6b7280", fontSize: 11 }}>
                                {bracket.surcharge > 0 ? `+$${(bracket.surcharge * 12).toFixed(2)}` : "$0.00"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Impact Summary when income is entered */}
            {parsedIncome > 0 && activeBracket && activeBracket.surcharge > 0 && (
              <div style={{ marginTop: 20, padding: 20, borderRadius: 14, background: "linear-gradient(135deg, #fef2f2, #fffbeb)", border: "2px solid #fbbf24" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={16} />
                  IRMAA Impact on Your Part D Costs
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: "#fff", border: "1px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>Filing Status</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginTop: 4 }}>{FILING_STATUS_LABELS[filingStatus]}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: "#fff", border: "1px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>Your MAGI</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginTop: 4 }}>{income}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: "#fff", border: "1px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>IRMAA Bracket</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#d97706", marginTop: 4 }}>{activeBracket.tier}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: "#fff", border: "1px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>Monthly Surcharge</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#dc2626", marginTop: 4 }}>+${activeBracket.surcharge.toFixed(2)}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: "#fff", border: "1px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 }}>Annual Surcharge</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#dc2626", marginTop: 4 }}>+${(activeBracket.surcharge * 12).toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: "#a16207", lineHeight: 1.5 }}>
                  This surcharge is added <strong>on top of</strong> your regular Part D plan premium. For example, a plan with a $18.40/mo premium would cost you <strong>${(18.40 + activeBracket.surcharge).toFixed(2)}/mo</strong> after IRMAA.
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#f9fafb", fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
              <strong>Disclaimer:</strong> IRMAA brackets are updated annually by CMS. These figures reflect 2025 guidelines. Your actual IRMAA is based on the MAGI from your tax return filed 2 years prior. If your income has decreased significantly due to a life-changing event (retirement, divorce, death of spouse, etc.), you may request a redetermination using SSA Form SSA-44.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CostEstimator({ plans, selectedDrugs }) {
  const estimates = useMemo(() => {
    return plans.map((plan) => {
      const pData = PLANS.find(p => p.id === plan.id);
      const activeDrugsForSim = DRUGS.filter(d => selectedDrugs.includes(d.drug_name)).map(d => ({...d, is_active: true}));
      const simResult = simulate(pData, activeDrugsForSim);
      
      const premiumAnnual = pData.prem * 12;
      const deductible = simResult.dedMonth ? pData.ded : 0;
      let coveredCount = 0;
      selectedDrugs.forEach((d) => { if (plan.formulary[d]?.covered) coveredCount++; });
      return { 
        plan, 
        premiumAnnual, 
        deductible, 
        drugCosts: simResult.annPat, 
        total: simResult.annTotal, 
        coveredCount 
      };
    }).sort((a, b) => a.total - b.total);
  }, [plans, selectedDrugs]);
  const maxCost = Math.max(...estimates.map((e) => e.total), 1);

  return (
    <div style={{ padding: "32px 0" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Annual Cost Estimator</h2>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 8, maxWidth: 600 }}>Estimated annual out-of-pocket costs based on your selected medications.</p>
      {selectedDrugs.length === 0 && (
        <div style={{ padding: 24, background: "#fffbeb", borderRadius: 12, border: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <AlertCircle size={20} color="#d97706" />
          <span style={{ fontSize: 14, color: "#92400e" }}>Add medications in the "Drug Lookup" tab to see personalized cost estimates.</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {estimates.map(({ plan, premiumAnnual, deductible, drugCosts, total, coveredCount }, idx) => (
          <div key={plan.id} style={{ background: idx === 0 ? "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)" : "#fff", borderRadius: 14, border: idx === 0 ? "2px solid #3b82f6" : "1px solid #e5e7eb", padding: 20, position: "relative" }}>
            {idx === 0 && <div style={{ position: "absolute", top: 12, right: 12, background: "#1e40af", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>Best Value</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{plan.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{coveredCount}/{selectedDrugs.length} drugs covered</div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: idx === 0 ? "#1e40af" : "#374151" }}>${total.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>/yr</span></div>
            </div>
            <div style={{ height: 28, borderRadius: 8, background: "#f3f4f6", overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${(premiumAnnual / maxCost) * 100}%`, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", minWidth: premiumAnnual > 0 ? 40 : 0, transition: "width 0.5s" }}>{premiumAnnual > 0 ? `$${premiumAnnual.toFixed(0)}` : ""}</div>
              <div style={{ width: `${(deductible / maxCost) * 100}%`, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", minWidth: deductible > 0 ? 40 : 0, transition: "width 0.5s" }}>{deductible > 0 ? `$${deductible}` : ""}</div>
              <div style={{ width: `${(drugCosts / maxCost) * 100}%`, background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", minWidth: drugCosts > 0 ? 40 : 0, transition: "width 0.5s" }}>{drugCosts > 0 ? `$${drugCosts.toFixed(0)}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#6b7280" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#3b82f6", display: "inline-block" }} />Premiums</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#f59e0b", display: "inline-block" }} />Deductible</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#8b5cf6", display: "inline-block" }} />Drug Copays</span>
            </div>
          </div>
        ))}
      </div>

      {/* IRMAA Estimator */}
      <IrmaaEstimator />
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function MedicarePartDPlanner() {
  const [activeTab, setActiveTab] = useState("plans");
  const [searchQuery, setSearchQuery] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [zipError, setZipError] = useState("");
  const [selectedDrugConfigs, setSelectedDrugConfigs] = useState([]);
  const [drugSearch, setDrugSearch] = useState("");
  const [maxPremium, setMaxPremium] = useState(50);
  const [minStars, setMinStars] = useState(0);
  const [zeroDeductible, setZeroDeductible] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("premium");

  const filteredPlans = useMemo(() => {
    let plans = SAMPLE_PLANS.filter((p) => {
      if (p.premium > maxPremium) return false;
      if (p.starRating < minStars) return false;
      if (zeroDeductible && p.deductible > 0) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.carrier.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    plans.sort((a, b) => {
      if (sortBy === "premium") return a.premium - b.premium;
      if (sortBy === "rating") return b.starRating - a.starRating;
      if (sortBy === "deductible") return a.deductible - b.deductible;
      if (sortBy === "cost" && selectedDrugs.length > 0) {
        const pDataA = PLANS.find(px => px.id === a.id);
        const pDataB = PLANS.find(px => px.id === b.id);
        const activeDrugsForSim = DRUGS.filter(d => selectedDrugs.includes(d.drug_name)).map(d => ({...d, is_active: true}));
        const simA = simulate(pDataA, activeDrugsForSim);
        const simB = simulate(pDataB, activeDrugsForSim);
        return simA.annTotal - simB.annTotal;
      }
      return 0;
    });
    return plans;
  }, [searchQuery, maxPremium, minStars, zeroDeductible, sortBy, selectedDrugs]);

  // Derive simple name list for backward compat with plan cards, cost estimator, etc.
  const selectedDrugs = useMemo(() => selectedDrugConfigs.map((c) => c.name), [selectedDrugConfigs]);

  const filteredDrugOptions = ALL_DRUGS.filter((d) => !selectedDrugs.includes(d) && d.toLowerCase().includes(drugSearch.toLowerCase()));

  const addDrug = (drugName) => {
    if (selectedDrugs.includes(drugName)) return;
    const opts = DRUG_OPTIONS[drugName];
    setSelectedDrugConfigs((prev) => [...prev, {
      name: drugName,
      dosage: opts.defaultDosage,
      quantity: opts.defaultQuantity,
      frequency: opts.defaultFrequency,
      form: opts.defaultForm,
    }]);
  };

  const removeDrug = (drugName) => {
    setSelectedDrugConfigs((prev) => prev.filter((c) => c.name !== drugName));
  };

  const updateDrugConfig = (drugName, field, value) => {
    setSelectedDrugConfigs((prev) => prev.map((c) => c.name === drugName ? { ...c, [field]: field === "quantity" ? Number(value) : value } : c));
  };

  const toggleDrug = (drugName) => {
    if (selectedDrugs.includes(drugName)) removeDrug(drugName);
    else addDrug(drugName);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f0f5ff 0%, #f8fafc 40%)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #3b82f6 100%)", padding: "32px 32px 24px", color: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><Shield size={24} /></div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Medicare Part D Plan Finder</h1>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Compare prescription drug plans, check formularies, and estimate your costs</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", background: "#fff", borderRadius: "12px 12px 0 0", marginTop: -8, padding: "0 8px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <TabButton active={activeTab === "plans"} onClick={() => setActiveTab("plans")} icon={<Search size={16} />}>Plan Search</TabButton>
          <TabButton active={activeTab === "drugs"} onClick={() => setActiveTab("drugs")} icon={<Pill size={16} />}>Drug Lookup</TabButton>
          <TabButton active={activeTab === "phases"} onClick={() => setActiveTab("phases")} icon={<BarChart3 size={16} />}>Coverage Phases</TabButton>
          <TabButton active={activeTab === "costs"} onClick={() => setActiveTab("costs")} icon={<DollarSign size={16} />}>Cost Estimator</TabButton>
        </div>

        {/* Main Content */}
        <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: "24px 28px", minHeight: 500, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

          {/* ── Plans Tab ── */}
          {activeTab === "plans" && (
            <div>
              {/* Zip Code Input */}
              <div style={{ marginBottom: 16, padding: 20, background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)", borderRadius: 14, border: "1px solid #bfdbfe" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <MapPin size={18} color="#1e40af" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e40af" }}>Your Location</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>Enter your residential zip code to find plans in your area</div>
                    </div>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter ZIP code"
                      value={zipCode}
                      maxLength={5}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                        setZipCode(val);
                        if (val.length === 5) {
                          setZipError("");
                        } else if (val.length > 0 && val.length < 5) {
                          setZipError("Enter a 5-digit ZIP code");
                        } else {
                          setZipError("");
                        }
                      }}
                      style={{
                        width: 160,
                        padding: "10px 16px 10px 16px",
                        borderRadius: 10,
                        border: zipError ? "2px solid #f59e0b" : zipCode.length === 5 ? "2px solid #059669" : "2px solid #d1d5db",
                        fontSize: 16,
                        fontWeight: 700,
                        letterSpacing: 2,
                        textAlign: "center",
                        outline: "none",
                        boxSizing: "border-box",
                        background: "#fff",
                        color: "#111827",
                        transition: "border-color 0.2s",
                      }}
                    />
                    {zipCode.length === 5 && (
                      <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                        <Check size={16} color="#059669" />
                      </div>
                    )}
                  </div>
                  {zipCode.length === 5 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac" }}>
                      <Check size={14} color="#059669" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#166534" }}>Showing plans for ZIP {zipCode}</span>
                    </div>
                  )}
                  {zipError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#d97706", fontWeight: 500 }}>
                      <AlertCircle size={13} />{zipError}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 250, position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 14, top: 12, color: "#9ca3af" }} />
                  <input type="text" placeholder="Search plans by name or carrier..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", padding: "10px 16px 10px 40px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                <button onClick={() => setShowFilters(!showFilters)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", border: showFilters ? "1px solid #3b82f6" : "1px solid #d1d5db", borderRadius: 10, background: showFilters ? "#eff6ff" : "#fff", color: showFilters ? "#1e40af" : "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  <Filter size={14} />Filters
                </button>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer", background: "#fff" }}>
                  <option value="premium">Sort: Lowest Premium</option>
                  <option value="rating">Sort: Highest Rating</option>
                  <option value="deductible">Sort: Lowest Deductible</option>
                  {selectedDrugs.length > 0 && <option value="cost">Sort: Lowest Est. Cost</option>}
                </select>
              </div>

              {showFilters && (
                <div style={{ padding: 20, background: "#f9fafb", borderRadius: 12, marginBottom: 20, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end", border: "1px solid #e5e7eb" }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Max Monthly Premium: <strong style={{ color: "#1e40af" }}>${maxPremium}</strong></label>
                    <input type="range" min={0} max={100} value={maxPremium} onChange={(e) => setMaxPremium(Number(e.target.value))} style={{ width: 200, accentColor: "#3b82f6" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Min Star Rating: <strong style={{ color: "#f59e0b" }}>{minStars > 0 ? `${minStars}+` : "Any"}</strong></label>
                    <input type="range" min={0} max={5} step={0.5} value={minStars} onChange={(e) => setMinStars(Number(e.target.value))} style={{ width: 200, accentColor: "#f59e0b" }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
                    <input type="checkbox" checked={zeroDeductible} onChange={(e) => setZeroDeductible(e.target.checked)} style={{ accentColor: "#3b82f6", width: 16, height: 16 }} />$0 Deductible Only
                  </label>
                </div>
              )}

              {selectedDrugs.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Your Drugs:</span>
                  {selectedDrugs.map((d) => <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", fontSize: 12, fontWeight: 600 }}>{d}<X size={12} style={{ cursor: "pointer" }} onClick={() => toggleDrug(d)} /></span>)}
                </div>
              )}

              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Showing <strong>{filteredPlans.length}</strong> of {SAMPLE_PLANS.length} plans</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredPlans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} selectedDrugs={selectedDrugs} expanded={expandedPlan === plan.id} onToggle={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)} />
                ))}
                {filteredPlans.length === 0 && (
                  <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
                    <Search size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <p style={{ fontSize: 16, fontWeight: 600 }}>No plans match your filters</p>
                    <p style={{ fontSize: 13 }}>Try adjusting your search criteria or filters.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Drug Lookup Tab ── */}
          {activeTab === "drugs" && (
            <div style={{ padding: "8px 0" }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Drug Formulary Lookup</h2>
              <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>Search for your medications, configure dosage, quantity, and frequency, then compare coverage across plans.</p>

              {/* Drug Search Input */}
              <div style={{ position: "relative", maxWidth: 520, marginBottom: 24 }}>
                <Pill size={16} style={{ position: "absolute", left: 14, top: 13, color: "#9ca3af" }} />
                <input type="text" placeholder="Search for a medication by name..." value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)} style={{ width: "100%", padding: "12px 16px 12px 40px", borderRadius: 12, border: "2px solid #d1d5db", fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = "#d1d5db")} />
                {drugSearch && filteredDrugOptions.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", marginTop: 4, zIndex: 10, overflow: "hidden" }}>
                    {filteredDrugOptions.map((drug) => {
                      const opts = DRUG_OPTIONS[drug];
                      return (
                        <div key={drug} onClick={() => { addDrug(drug); setDrugSearch(""); }} style={{ padding: "12px 16px", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f3f4f6", transition: "background 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" }}><Pill size={15} color="#1e40af" /></div>
                          <div>
                            <div style={{ fontWeight: 600, color: "#111827" }}>{drug}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{opts?.genericName} · {opts?.drugClass}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Drug Configuration Cards */}
              {selectedDrugConfigs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#374151" }}>Your Medications ({selectedDrugConfigs.length})</h3>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>Configure dosage, quantity, and frequency for each drug</span>
                  </div>

                  {selectedDrugConfigs.map((config) => {
                    const opts = DRUG_OPTIONS[config.name];
                    if (!opts) return null;
                    return (
                      <div key={config.name} style={{ borderRadius: 14, border: "2px solid #bfdbfe", background: "linear-gradient(135deg, #f8faff 0%, #eff6ff 100%)", overflow: "hidden" }}>
                        {/* Card Header */}
                        <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #dbeafe" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" }}><Pill size={18} color="#1e40af" /></div>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a5f" }}>{config.name}</div>
                              <div style={{ fontSize: 12, color: "#6b7280" }}>{opts.genericName} · {opts.drugClass}</div>
                            </div>
                          </div>
                          <button onClick={() => removeDrug(config.name)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}>
                            <X size={13} />Remove
                          </button>
                        </div>

                        {/* Configuration Dropdowns */}
                        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                          {/* Form */}
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 }}>Form</label>
                            <select value={config.form} onChange={(e) => updateDrugConfig(config.name, "form", e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontWeight: 600, color: "#374151", background: "#fff", cursor: "pointer", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}>
                              {opts.forms.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>

                          {/* Dosage */}
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 }}>Dosage</label>
                            <select value={config.dosage} onChange={(e) => updateDrugConfig(config.name, "dosage", e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontWeight: 600, color: "#374151", background: "#fff", cursor: "pointer", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}>
                              {opts.dosages.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 }}>Quantity</label>
                            <select value={config.quantity} onChange={(e) => updateDrugConfig(config.name, "quantity", e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontWeight: 600, color: "#374151", background: "#fff", cursor: "pointer", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}>
                              {opts.quantities.map((q) => <option key={q} value={q}>{q} {config.name === "Ozempic" ? (q === 1 ? "pen" : "pens") : "units"}</option>)}
                            </select>
                          </div>

                          {/* Frequency */}
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 }}>Frequency</label>
                            <select value={config.frequency} onChange={(e) => updateDrugConfig(config.name, "frequency", e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontWeight: 600, color: "#374151", background: "#fff", cursor: "pointer", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}>
                              {opts.frequencies.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Summary Bar */}
                        <div style={{ padding: "10px 20px", background: "#dbeafe", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1e40af" }}>Rx Summary:</span>
                          <span style={{ fontSize: 12, color: "#1e3a5f", fontWeight: 500 }}>
                            {config.name} {config.dosage} {config.form} — Qty {config.quantity} — {config.frequency}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedDrugConfigs.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", background: "#f9fafb", borderRadius: 14, border: "1px dashed #d1d5db", marginBottom: 24 }}>
                  <Pill size={32} color="#d1d5db" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#6b7280", margin: "0 0 4px" }}>No medications added yet</p>
                  <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Search above or select from common medications below to get started.</p>
                </div>
              )}

              {/* Coverage Comparison Table */}
              {selectedDrugConfigs.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#374151", marginBottom: 12 }}>Coverage Comparison</h3>
                  <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, color: "#6b7280", borderBottom: "2px solid #e5e7eb", position: "sticky", left: 0, background: "#f9fafb" }}>Plan</th>
                          {selectedDrugConfigs.map((config) => (
                            <th key={config.name} style={{ textAlign: "center", padding: "12px 16px", fontWeight: 600, color: "#6b7280", borderBottom: "2px solid #e5e7eb", minWidth: 140 }}>
                              <div>{config.name}</div>
                              <div style={{ fontSize: 10, fontWeight: 500, color: "#9ca3af", marginTop: 2 }}>{config.dosage} · {config.frequency}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {SAMPLE_PLANS.map((plan) => (
                          <tr key={plan.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#111827", position: "sticky", left: 0, background: "#fff", borderRight: "1px solid #f3f4f6" }}>
                              {plan.name}<div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>${plan.premium}/mo</div>
                            </td>
                            {selectedDrugConfigs.map((config) => {
                              const info = plan.formulary[config.name];
                              return (
                                <td key={config.name} style={{ textAlign: "center", padding: "12px 16px" }}>
                                  {info?.covered ? (<div><Badge color={TIER_COLORS[info.tier]}>Tier {info.tier}</Badge><div style={{ marginTop: 4, fontWeight: 700, color: "#111827" }}>{info.copay != null ? `$${info.copay}/mo` : "PA Required"}</div></div>) : (<span style={{ color: "#dc2626", fontWeight: 600, fontSize: 12 }}>Not Covered</span>)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Quick Add — Common Medications */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>Common Medications</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                  {ALL_DRUGS.map((drug) => {
                    const opts = DRUG_OPTIONS[drug];
                    const isSelected = selectedDrugs.includes(drug);
                    return (
                      <button key={drug} onClick={() => toggleDrug(drug)} style={{ padding: "12px 16px", borderRadius: 12, border: isSelected ? "2px solid #3b82f6" : "1px solid #d1d5db", background: isSelected ? "#eff6ff" : "#fff", color: isSelected ? "#1e40af" : "#374151", fontWeight: 500, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s", textAlign: "left" }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: isSelected ? "#dbeafe" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {isSelected ? <Check size={14} color="#1e40af" /> : <Pill size={14} color="#9ca3af" />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{drug}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>{opts?.drugClass}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "phases" && <CoveragePhaseSection />}
          {activeTab === "costs" && <CostEstimator plans={SAMPLE_PLANS} selectedDrugs={selectedDrugs} />}
        </div>

        <div style={{ textAlign: "center", padding: "24px 0 40px", fontSize: 12, color: "#9ca3af" }}>
          <p style={{ margin: 0 }}><Info size={12} style={{ verticalAlign: -2, marginRight: 4 }} />This tool uses sample data for demonstration purposes. Always verify with Medicare.gov or your plan provider.</p>
        </div>
      </div>
    </div>
  );
}