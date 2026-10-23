"""Indicator math shared by the census and CVAP builds. Mirrors site/core.js exactly; tests/consistency.test.js
holds the two to the same numbers."""
import numpy as np, pandas as pd

BR_LO = [0, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 60000, 75000, 100000, 125000, 150000, 200000]

def median_from_brackets(n):
    tot = sum(n)
    if tot < 20: return np.nan
    half, cum = tot / 2, 0
    for i, c in enumerate(n):
        if cum + c >= half:
            if i == 15: return 200000.0
            return BR_LO[i] + (half - cum) / c * (BR_LO[i + 1] - BR_LO[i]) if c else BR_LO[i]
        cum += c
    return np.nan

def reliability(est, moe, split=0.0, reg=False):
    """CV under 15% high, 15-30% medium, over 30% low; a unit mostly built from split areas is at best medium;
    more than 130 active voters per 100 eligible means the split is off for that area."""
    if est is None or moe is None or not np.isfinite(est) or not np.isfinite(moe): return ''
    if est <= 0: return 'low'
    if reg and est > 130: return 'low'
    cv = moe / 1.645 / est * 100
    r = 'high' if cv < 15 else 'medium' if cv < 30 else 'low'
    return 'medium' if r == 'high' and split > 0.5 else r

def unit_counts(xwm, key, area_col, C, M, person_fields, pop_field):
    """Estimates, MOEs and split share for every unit of a level. A unit is a set of shares of small areas
    (tracts or block groups); MOEs add area MOEs times shares as a root-sum-of-squares by area."""
    cols = list(C.columns); isP = np.isin(np.array(cols), person_fields)
    Cn, Mn = C.to_numpy(float), M.to_numpy(float); ix = {a: i for i, a in enumerate(C.index)}
    g = xwm.dropna(subset=[key]).groupby([key, area_col])[['w_pop', 'w_hu']].sum().reset_index()
    g['ai'] = g[area_col].map(ix)
    g = g.dropna(subset=['ai']); g['ai'] = g.ai.astype(int)
    pi = cols.index(pop_field)
    est, moe, split = {}, {}, {}
    for u, grp in g.groupby(key):
        ai = grp.ai.to_numpy(); wp = grp.w_pop.to_numpy(); w = np.where(isP[None, :], wp[:, None], grp.w_hu.to_numpy()[:, None])
        est[u] = (Cn[ai] * w).sum(0); moe[u] = np.sqrt(((Mn[ai] * w) ** 2).sum(0))
        tot = est[u][pi]; split[u] = (Cn[ai, pi] * wp * (wp < 0.95)).sum() / tot if tot > 0 else 0.0
    E = pd.DataFrame(est, index=cols).T; Mo = pd.DataFrame(moe, index=cols).T
    E.attrs['split'] = pd.Series(split)
    return E, Mo

def indicator_table(spec, E, Mo, voters=None, tract_pub=None, min_den=30, split_col='share_of_residents_from_split_tracts'):
    rows = {}
    SPL = E.attrs.get('split', pd.Series(dtype=float))
    for u in E.index:
        c, m = E.loc[u], Mo.loc[u]; v = voters.loc[u] if voters is not None and u in voters.index else None
        out = {}
        for i in spec:
            t = i.get('type'); x = mx = np.nan
            if t == 'num': x, mx = c[i['num']], m[i['num']]
            elif t == 'usd':
                if tract_pub is not None and pd.notna(tract_pub.med_inc_pub.get(u)): x, mx = tract_pub.med_inc_pub[u], tract_pub.med_inc_moe.get(u, np.nan)
                else: x = median_from_brackets([c[f'inc{k:02d}'] for k in range(16)])
            elif t == 'reg':
                if c['cvap'] >= min_den and v is not None: x = v['total_active'] / c['cvap'] * 100; mx = x * m['cvap'] / c['cvap']
            else:
                X, Y, mX, mY = c[i['num']], c[i['den']], m[i['num']], m[i['den']]
                if Y >= min_den:
                    pp = X / Y; rad = mX ** 2 - pp ** 2 * mY ** 2
                    if rad < 0: rad = mX ** 2 + pp ** 2 * mY ** 2
                    x, mx = pp * 100, np.sqrt(rad) / Y * 100
            out[i['col']] = x; out[i['col'] + '_moe'] = mx
            out[i['col'] + '_reliability'] = reliability(x, mx, SPL.get(u, 0.0), t == 'reg') if pd.notna(mx) else ''
        out[split_col] = round(float(SPL.get(u, 0.0)) * 100, 1)
        rows[u] = out
    o = pd.DataFrame.from_dict(rows, orient='index')
    for i in spec:
        nd = 0 if i.get('type') in ('num', 'usd') else 1
        o[i['col']] = o[i['col']].round(nd); o[i['col'] + '_moe'] = o[i['col'] + '_moe'].round(nd)
    if voters is not None:
        vv = voters.reindex(o.index)
        o.insert(0, 'active_voters', vv['total_active'].round(1)); o.insert(0, 'registered_voters', vv['total_total'].round(1))
    return o
