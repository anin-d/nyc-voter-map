import geopandas as gpd, pandas as pd
ed = gpd.read_file('raw/ED_user.geojson').to_crs(2263)[['ElectDist','geometry']]
ed['geometry'] = ed.geometry.make_valid(); ed['ed_area'] = ed.area
layers = {'cc':('NYC_City_Council_Districts','CounDist'),'ad':('NYC_State_Assembly_Districts','AssemDist'),
          'sd':('NYC_State_Senate_Districts','StSenDist'),'cd':('NYC_Congressional_Districts','CongDist')}
xw = ed[['ElectDist']].copy()
for k,(f,col) in layers.items():
    d = gpd.read_file(f'raw/{f}.geojson').to_crs(2263)[[col,'geometry']]; d['geometry']=d.geometry.make_valid()
    ov = gpd.overlay(ed, d, how='intersection', keep_geom_type=True)
    ov['share'] = ov.area/ov.ed_area
    ov = ov.sort_values('share', ascending=False)
    top = ov.drop_duplicates('ElectDist').set_index('ElectDist')
    xw[k] = xw.ElectDist.map(top[col]); xw[k+'_share'] = xw.ElectDist.map(top['share']).round(4)
    # list any secondary district holding >2% of ED area
    sec = ov[ov.share>0.02].groupby('ElectDist')[col].apply(lambda s: ';'.join(str(int(v)) for v in s) if len(s)>1 else '')
    xw[k+'_split'] = xw.ElectDist.map(sec).fillna('')
    print(k, 'unassigned', xw[k].isna().sum(), 'EDs <95% in one district', (xw[k+'_share']<0.95).sum(), ' >2% split', (xw[k+'_split']!='').sum())
xw['ad_from_code'] = xw.ElectDist//1000
print('AD spatial vs code mismatch', (xw.ad != xw.ad_from_code).sum())
print(xw[xw.ad != xw.ad_from_code].head(10).to_string())
xw.to_csv('data/ed_crosswalk_raw.csv', index=False)
