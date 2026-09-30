/**
 * Studentized range distribution, for Tukey HSD simultaneous intervals.
 * Port of R's ptukey (Copenhaver & Holland 1988, AS 190 lineage); qtukey inverts it by bisection.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** erfc with relative error < 1.2e-7 (Numerical Recipes, Chebyshev fit). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
    + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const pnorm = (x: number) => 0.5 * erfc(-x / Math.SQRT2);

/** log Γ(x) for x > 0 (Lanczos, g = 7). */
function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const XLEG = [0.981560634246719250690549090149, 0.904117256370474856678465866119, 0.769902674194304687036893833213,
  0.587317954286617447296702418941, 0.367831498998180193752691536644, 0.125233408511468915472441369464];
const ALEG = [0.047175336386511827194615961485, 0.106939325995318430960254718194, 0.160078328543346226334652529543,
  0.203167426723065921749064455810, 0.233492536538354808760849898925, 0.249147045813402785000562436043];

/** P(range of cc standard normals < w), raised to rr. */
function wprob(w: number, rr: number, cc: number): number {
  const qsqz = w * 0.5;
  if (qsqz >= 8) return 1;
  let prW = 2 * pnorm(qsqz) - 1;
  prW = prW >= 1 ? 1 : Math.pow(prW, cc);
  const wincr = w > 3 ? 2 : 3;
  let blb = qsqz;
  const binc = (8 - qsqz) / wincr;
  let bub = blb + binc;
  let einsum = 0;
  const cc1 = cc - 1;
  for (let wi = 1; wi <= wincr; wi++) {
    let elsum = 0;
    const a = 0.5 * (bub + blb);
    const b = 0.5 * (bub - blb);
    for (let jj = 1; jj <= 12; jj++) {
      let j: number;
      let xx: number;
      if (jj > 6) { j = 12 - jj + 1; xx = XLEG[j - 1]; } else { j = jj; xx = -XLEG[j - 1]; }
      const ac = a + b * xx;
      const qexpo = ac * ac;
      if (qexpo > 60) break;
      let rinsum = pnorm(ac) - pnorm(ac - w);
      if (rinsum >= Math.exp(-30 / cc1)) {
        rinsum = ALEG[j - 1] * Math.exp(-0.5 * qexpo) * Math.pow(rinsum, cc1);
        elsum += rinsum;
      }
    }
    einsum += elsum * (2 * b * cc) / SQRT_2PI;
    blb = bub;
    bub += binc;
  }
  prW += einsum;
  if (prW <= Math.exp(-30 / rr)) return 0;
  prW = Math.pow(prW, rr);
  return prW >= 1 ? 1 : prW;
}

const XLEGQ = [0.989400934991649932596154173450, 0.944575023073232576077988415535, 0.865631202387831743880467897712,
  0.755404408355003033895101194847, 0.617876244402643748446671764049, 0.458016777657227386342419442984,
  0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
const ALEGQ = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1, 0.951585116824927848099251076022e-1,
  0.124628971255533872052476282192, 0.149595988816576732081501730547, 0.169156519395002538189312079030,
  0.182603415044923588866763667969, 0.189450610455068496285396723208];

/** P(Q < q) for the studentized range of `k` means with `df` error degrees of freedom. */
export function ptukey(q: number, k: number, df: number): number {
  if (!(q > 0)) return 0;
  if (df > 25000) return wprob(q, 1, k);
  const f2 = df * 0.5;
  const f21 = f2 - 1;
  const ff4 = df * 0.25;
  const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
  const f2lf = f2 * Math.log(df) - df * Math.LN2 - lgamma(f2) + Math.log(ulen);
  let ans = 0;
  for (let i = 1; i <= 50; i++) {
    let otsum = 0;
    const twa1 = (2 * i - 1) * ulen;
    for (let jj = 1; jj <= 16; jj++) {
      const upper = jj > 8;
      const j = upper ? jj - 9 : jj - 1;
      const u = XLEGQ[j] * ulen;
      const t1 = upper
        ? f2lf + f21 * Math.log(twa1 + u) - (u + twa1) * ff4
        : f2lf + f21 * Math.log(twa1 - u) + (u - twa1) * ff4;
      if (t1 >= -30) {
        const qsqz = q * Math.sqrt((upper ? twa1 + u : twa1 - u) * 0.5);
        otsum += wprob(qsqz, 1, k) * ALEGQ[j] * Math.exp(t1);
      }
    }
    if (i * ulen >= 1 && otsum <= 1e-14) break;
    ans += otsum;
  }
  return Math.min(1, ans);
}

/** Critical value q with P(Q < q) = p. */
export function qtukey(p: number, k: number, df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ptukey(mid, k, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
