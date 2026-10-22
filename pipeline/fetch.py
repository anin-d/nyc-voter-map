import json, urllib.request, sys
B='https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/ArcGIS/rest/services'
for svc in ['NYC_Election_Districts','NYC_City_Council_Districts','NYC_State_Assembly_Districts','NYC_State_Senate_Districts','NYC_Congressional_Districts']:
    feats, off = [], 0
    while True:
        u=f'{B}/{svc}/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset={off}&resultRecordCount=1000'
        d=json.load(urllib.request.urlopen(u, timeout=120))
        feats += d['features']
        if len(d['features'])<1000 and not d.get('properties',{}).get('exceededTransferLimit'): break
        off += 1000
    json.dump({'type':'FeatureCollection','features':feats}, open(f'raw/{svc}.geojson','w'))
    print(svc, len(feats))
