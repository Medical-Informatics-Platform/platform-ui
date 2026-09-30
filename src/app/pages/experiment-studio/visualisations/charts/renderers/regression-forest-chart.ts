import {
  ALPHA, B, FONT, ForestRow, GR, INK, MUT, MipChart, ORD, ax, esc, fmtN, forest, forestCaption, forestRows, num, pText, pct,
} from '../chart-theme';

/** "Dataset[edsd]" → "Dataset · edsd", so dummy-coded levels read as labels. */
export function termLabel(label: string): string {
  const m = String(label).trim().match(/^(.+?)\[(.+)\]$/);
  return m ? `${m[1].trim()} · ${m[2].trim()}` : String(label).trim();
}

const terms = (r: any): string[] => (Array.isArray(r?.indep_vars) ? r.indep_vars.map((v: unknown) => termLabel(String(v))) : []);
const outcomeOf = (r: any): string => String(r?.dependent_var ?? 'the outcome');

/** linear_regression: β forest. */
export function buildLinearRegressionForest(r: any, alpha = ALPHA): MipChart[] {
  const rows = forestRows(terms(r), r?.coefficients ?? [], r?.lower_ci ?? [], r?.upper_ci ?? [], r?.pvalues ?? []);
  if (!rows.length) return [];
  const outcome = outcomeOf(r);
  const r2 = num(r?.r_squared);
  const r2a = num(r?.r_squared_adjusted);
  const meta = [`Dependent: ${outcome}`, `n = ${r?.n_obs ?? '—'}`, Number.isFinite(r2) ? `R² ${r2.toFixed(3)}${Number.isFinite(r2a) ? ` (adj. ${r2a.toFixed(3)})` : ''}` : ''].filter(Boolean).join(' · ');
  const caption = forestCaption(rows, alpha, outcome) + (Number.isFinite(r2) ? ` The model explains ${pct(r2)} of the variance.` : '');
  return [{
    ...forest({ rows, alpha, xName: '← lower  ·  Coefficient β (95% CI)  ·  higher →' }),
    mipTitle: 'Coefficient forest plot',
    mipMeta: meta,
    mipCaption: caption,
  }];
}

function oddsRatioCaption(rows: ForestRow[], alpha: number, word: 'odds' | 'hazard'): string {
  const sig = rows.filter((x) => x.p < alpha).sort((a, b) => Math.abs(Math.log(b.est)) - Math.abs(Math.log(a.est)));
  const ns = rows.filter((x) => !(x.p < alpha));
  const head = word === 'odds' ? 'OR' : 'HR';
  const parts: string[] = [];
  if (sig.length) {
    const t = sig[0];
    // "Factor · level" rows are dummy-coded levels, read against the reference level, not per unit.
    const lead = t.label.includes(' · ')
      ? `${t.label} has ${fmtN(t.est)} times the ${word} of the reference level`
      : `Each unit of ${t.label} multiplies the ${word} by ${fmtN(t.est)}`;
    parts.push(`${lead} (95% CI ${fmtN(t.lo)}–${fmtN(t.hi)}, ${pText(t.p)}).`);
    if (sig.length > 1) parts.push(`${sig.slice(1).map((x) => `${x.label} (${head} ${fmtN(x.est)})`).join(', ')} ${sig.length > 2 ? 'are' : 'is'} also associated.`);
  } else {
    parts.push(`No predictor clearly changes the ${word} at p < ${alpha}.`);
  }
  if (ns.length && sig.length) parts.push(`${ns.length === 1 ? `The ${ns[0].label} interval includes` : `${ns.length} intervals include`} 1, so there's no clear association.`);
  return parts.slice(0, 3).join(' ');
}

/** logistic_regression and glmm_binary: odds-ratio forest on a log axis. */
export function buildOddsRatioForest(r: any, alpha = ALPHA): MipChart[] {
  const s = r?.summary ?? r;
  const rows = forestRows(terms(r), s?.coefficients ?? [], s?.lower_ci ?? [], s?.upper_ci ?? [], s?.pvalues ?? [], Math.exp, true);
  if (!rows.length) return [];
  const mcf = num(s?.r_squared_mcf);
  const meta = [`Outcome: ${outcomeOf(r)}`, `n = ${s?.n_obs ?? r?.n_obs ?? '—'}`, Number.isFinite(mcf) ? `McFadden R² ${mcf.toFixed(3)}` : '', r?.n_groups ? `${r.n_groups} groups` : ''].filter(Boolean).join(' · ');
  return [{
    ...forest({ rows, alpha, log: true, estHead: 'OR', xName: '← lower odds  ·  Odds ratio (log scale)  ·  higher odds →' }),
    mipTitle: 'Odds ratios',
    mipMeta: meta,
    mipCaption: oddsRatioCaption(rows, alpha, 'odds'),
  }];
}

/** cox_regression_*: hazard-ratio forest on a log axis. */
export function buildHazardRatioForest(r: any, alpha = ALPHA): MipChart[] {
  const s = r?.summary ?? {};
  const rows = forestRows(terms(r), s.hazard_ratios ?? [], s.hr_lower_ci ?? [], s.hr_upper_ci ?? [], s.pvalues ?? [], (v) => v, true);
  if (!rows.length) return [];
  const meta = [
    r?.event_var ? `Event: ${r.event_var}` : '',
    s.n_obs != null ? `${s.n_obs} participants` : '',
    s.n_events != null ? `${s.n_events} events` : '',
    s.converged === false ? 'did not converge' : s.converged ? 'converged' : '',
  ].filter(Boolean).join(' · ');
  return [{
    ...forest({ rows, alpha, log: true, estHead: 'HR', leftW: 190, xName: '← lower hazard  ·  Hazard ratio (log scale)  ·  higher hazard →' }),
    mipTitle: 'Hazard ratios',
    mipMeta: meta,
    mipCaption: oddsRatioCaption(rows, alpha, 'hazard'),
  }];
}

/**
 * lmm and glmm_ordinal: fixed-effect forest plus a 100% bar splitting the variance into
 * between-group (the ICC) and residual. The ordinal model's residual is on the latent
 * logistic scale, π²/3.
 */
export function buildMixedEffectsForest(r: any, alpha = ALPHA): MipChart[] {
  const rows = forestRows(terms(r), r?.coefficients ?? [], r?.lower_ci ?? [], r?.upper_ci ?? [], r?.pvalues ?? []);
  if (!rows.length) return [];
  const outcome = outcomeOf(r);
  const su = num(r?.sigma_u2);
  const s2 = Number.isFinite(num(r?.sigma2)) ? num(r.sigma2) : Math.PI ** 2 / 3;
  const icc = su / (su + s2);
  const hasSplit = Number.isFinite(icc);
  const group = Array.isArray(r?.grouping_var) ? r.grouping_var.join(', ') : 'group';

  // glmm_ordinal: thresholds between adjacent categories on the latent scale.
  const cuts: number[] = Array.isArray(r?.cutpoints) ? r.cutpoints.map(num).filter(Number.isFinite) : [];
  const cats: string[] = Array.isArray(r?.category_order) ? r.category_order.map(String) : [];
  const hasCuts = cuts.length > 0;

  const o: any = forest({ rows, alpha, xName: `← lower  ·  Fixed effect β (95% CI)  ·  higher →`, bottomExtra: (hasSplit ? 64 : 0) + (hasCuts ? 44 : 0) });
  // Strips stack upwards from the bottom: cutpoints, then variance, then the significance key.
  const strip = (bottom: number, height: number, label: string, xAxis: Record<string, unknown>) => {
    o.grid.push({ left: 200, right: 230, bottom, height });
    const gridIndex = o.grid.length - 1;
    o.xAxis.push({ gridIndex, type: 'value', ...xAxis });
    o.yAxis.push({ gridIndex, type: 'category', data: [label], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 12, fontFamily: FONT } });
    return { xAxisIndex: o.xAxis.length - 1, yAxisIndex: o.yAxis.length - 1 };
  };
  if (hasCuts) {
    const span = Math.max(...cuts) - Math.min(...cuts) || 1;
    const ix = strip(30, 14, 'Cutpoints', ax({ min: Math.min(...cuts) - span * 0.15, max: Math.max(...cuts) + span * 0.15, splitLine: { show: false }, axisLabel: { color: MUT, fontSize: 10, formatter: (v: number) => fmtN(v, 1), showMinLabel: false, showMaxLabel: false } }));
    const name = (i: number) => (cats[i] !== undefined && cats[i + 1] !== undefined ? `${cats[i]} | ${cats[i + 1]}` : `cut ${i + 1}`);
    o.series.push({
      type: 'scatter', ...ix, symbol: 'rect', symbolSize: [3, 16], itemStyle: { color: ORD },
      data: cuts.map((c, i) => ({ value: [c, 'Cutpoints'], name: name(i) })),
      tooltip: { formatter: (q: any) => `${esc(q.name)}<br/>latent cutpoint ${fmtN(q.value[0])}` },
      label: { show: true, position: 'top', distance: 2, color: MUT, fontSize: 10, fontFamily: FONT, formatter: (q: any) => q.name },
      labelLayout: { hideOverlap: true },
    });
  }
  if (hasSplit) {
    const ix = strip(hasCuts ? 70 : 26, 18, 'Variance', { min: 0, max: 1, show: false });
    const bar = (v: number, color: string, txt: string, text: string) => ({
      type: 'bar', stack: 'v', ...ix, barWidth: 18, data: [v], itemStyle: { color }, silent: true,
      label: { show: !!text, position: 'insideLeft', color: txt, fontSize: 11, fontFamily: FONT, formatter: text },
    });
    const between = `Between ${group} ${pct(icc)}`;
    const within = `Within (residual) ${pct(1 - icc)}`;
    // A thin blue segment cannot hold its label; both labels then share the residual segment.
    const roomy = icc >= 0.3;
    o.series.push(bar(icc, B, '#fff', roomy ? between : ''), bar(1 - icc, GR, INK, roomy ? within : `${between}  ·  ${within}`));
  }
  if (hasSplit || hasCuts) o.graphic[3] = { ...o.graphic[3], bottom: 14 + (hasSplit ? 44 : 0) + (hasCuts ? 44 : 0) };

  const meta = [`Outcome: ${outcome}`, `n = ${r?.n_obs ?? '—'}`, r?.n_groups ? `${r.n_groups} groups` : '', r?.converged === false ? 'did not converge' : ''].filter(Boolean).join(' · ');
  const caption = forestCaption(rows, alpha, outcome) + (hasSplit
    ? ` Differences between ${group} account for ${pct(icc)} of the unexplained variance${icc >= 0.1 ? ', so ignoring them would overstate precision' : ''}.`
    : '');
  return [{ ...o, mipTitle: 'Fixed effects', mipMeta: meta, mipCaption: caption }];
}
