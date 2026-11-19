"""Per-city heat data for the personalized story (writes data/cities.json).

Same method as DSC106_FinalProject.ipynb: an "extreme heat day" is a day whose daily high is above that place's own
95th percentile for 1985-2014. The difference is that this script keeps the days of the year, so the story can say
WHEN in the year the hot days fall and how that stretches, and it uses several CMIP6 models, because a single model
can be misleading for one grid cell (for Lagos, MPI-ESM1-2-LR alone shows hot days almost vanishing for decades).
Each model is processed on its own, and the story uses the median across models plus the min-max range.

Run from the project folder:
    python export_cities.py --dry     # only pick and print the grid cell each model uses for each city (fast)
    python export_cities.py           # full export (about 5-8 min per model; each model's result is cached in cache/)
"""
import json, os, sys, time
import numpy as np
import pandas as pd
import xarray as xr

MODELS = ["MPI-ESM1-2-LR", "CanESM5", "MIROC6", "IPSL-CM6A-LR", "MRI-ESM2-0"]
MIN_MODELS = 3       # refuse to write the file if fewer models than this worked
BASE = (1985, 2014)
SCEN = ["ssp245", "ssp585"]
PCT = 0.95
# Life windows for someone who is 20 in 2026 (born 2006): 20 years centred on the year they turn 20, 40, 60, 80.
BORN = 2006
WINDOWS = [{"id": f"age{a}", "age": a, "years": [BORN + a - 10, BORN + a + 9]} for a in (20, 40, 60, 80)]
LAND_MIN = 30        # percent land needed for a grid cell to count as "land"
MAX_KM = 350         # how far from the city we are willing to look for a land cell
OUT, CACHE = "data/cities.json", "cache"
os.makedirs(CACHE, exist_ok=True)

t0 = time.time()
def log(msg): print(f"[{(time.time() - t0) / 60:5.1f} min] {msg}", flush=True)

cat = pd.read_csv("https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv")
cities = json.load(open("data/warming.json"))["places"]       # the 8 cities used in section 1

def store(model, var, exp, table):
    rows = cat.query("source_id == @model and experiment_id == @exp and variable_id == @var "
                     "and table_id == @table and member_id == 'r1i1p1f1'")
    if len(rows) == 0:
        raise ValueError(f"{model}: no {var} for {exp}")
    return rows.zstore.values[-1]

def open_store(path):
    kw = dict(consolidated=True, storage_options={"token": "anon"})
    try:
        return xr.open_zarr(path, decode_times=xr.coders.CFDatetimeCoder(use_cftime=True), **kw)
    except TypeError:
        return xr.open_zarr(path, use_cftime=True, **kw)

def land_fraction(model):
    for exp in ("historical", "ssp585", "ssp245", "piControl"):
        try:
            return open_store(store(model, "sftlf", exp, "fx"))["sftlf"].load()
        except Exception:
            continue
    raise ValueError(f"{model}: no land fraction")

def pick_cells(model):
    # one land grid cell per city: the nearest cell that is at least LAND_MIN percent land
    sft = land_fraction(model)
    glat, glon = sft.lat.values, sft.lon.values % 360
    LAT, LON = np.meshgrid(glat, glon, indexing="ij")
    def km(lat, lon):
        la, lo, la0, lo0 = np.radians(lat), np.radians(lon), np.radians(LAT), np.radians(LON)
        a = np.sin((la0 - la) / 2) ** 2 + np.cos(la) * np.cos(la0) * np.sin((lo0 - lo) / 2) ** 2
        return 6371 * 2 * np.arcsin(np.sqrt(a))
    picks = []
    for c in cities:
        d = km(c["lat"], c["lon"] % 360)
        land = np.where(sft.values >= LAND_MIN, d, np.inf)
        i, j = np.unravel_index(np.argmin(land), land.shape)
        if land[i, j] > MAX_KM:
            i, j = np.unravel_index(np.argmin(d), d.shape)
        lon = float(glon[j]); lon = lon - 360 if lon > 180 else lon
        picks.append({"i": int(i), "j": int(j), "lat": float(glat[i]), "lon": lon, "km": float(d[i, j]),
                      "land": float(sft.values[i, j])})
        print(f"  {model:14s} {c['name']:10s} -> ({glat[i]:6.1f},{lon:7.1f}) land {sft.values[i, j]:5.1f}% {d[i, j]:4.0f} km", flush=True)
    return picks

def longest_run(b):
    # longest stretch of consecutive True values in a 1-D boolean array
    d = np.diff(np.concatenate([[0], b.astype(int), [0]]))
    s, e = np.where(d == 1)[0], np.where(d == -1)[0]
    return int((e - s).max()) if len(s) else 0

def process_model(model):
    path = f"{CACHE}/{model}.json"
    if os.path.exists(path):
        log(f"{model}: loaded from {path}")
        return json.load(open(path))
    picks = pick_cells(model)
    ii = xr.DataArray([p["i"] for p in picks], dims="city")
    jj = xr.DataArray([p["j"] for p in picks], dims="city")

    def points(exp, years):
        da = open_store(store(model, "tasmax", exp, "day"))["tasmax"]
        out = []
        for a in range(years[0], years[1] + 1, 10):           # a decade at a time keeps memory small
            out.append(da.sel(time=slice(f"{a}-01-01", f"{min(a + 9, years[1])}-12-31")).isel(lat=ii, lon=jj).load())
        t = xr.concat(out, "time")
        log(f"{model}: {exp} tasmax {years[0]}-{years[1]}")
        return t.values.astype("float32") - 273.15, t.time.dt.year.values, t.time.dt.month.values

    hist, hy, hm = points("historical", BASE)
    thr = np.quantile(hist, PCT, axis=0)                       # each city's own 95th percentile, degC
    nb = BASE[1] - BASE[0] + 1
    res = {"thr_c": [float(t) for t in thr], "cell": picks, "monthly": {"baseline": []}, "run": {"baseline": []},
           "yearly": {sc: [] for sc in SCEN}, "years": list(range(BASE[0], 2101)),
           "win_total": {sc: {} for sc in SCEN}, "monthly_sc": {sc: {w["id"]: [] for w in WINDOWS} for sc in SCEN},
           "run_sc": {sc: {w["id"]: [] for w in WINDOWS} for sc in SCEN}}
    hist_yearly = []
    for k in range(len(cities)):
        hits = hist[:, k] > thr[k]
        res["monthly"]["baseline"].append([float(hits[hm == m].sum()) / nb for m in range(1, 13)])
        res["run"]["baseline"].append(float(np.mean([longest_run(hits[hy == y]) for y in range(BASE[0], BASE[1] + 1)])))
        hist_yearly.append([int(hits[hy == y].sum()) for y in range(BASE[0], BASE[1] + 1)])
    for sc in SCEN:
        fut, fy, fm = points(sc, (2015, 2100))
        for k in range(len(cities)):
            hits = fut[:, k] > thr[k]
            res["yearly"][sc].append(hist_yearly[k] + [int(hits[fy == y].sum()) for y in range(2015, 2101)])
            runs = {y: longest_run(hits[fy == y]) for y in range(2015, 2101)}
            for w in WINDOWS:
                a, b = w["years"]; n = b - a + 1
                inwin = (fy >= a) & (fy <= b)
                res["monthly_sc"][sc][w["id"]].append([float((hits & inwin & (fm == m)).sum()) / n for m in range(1, 13)])
                res["run_sc"][sc][w["id"]].append(float(np.mean([runs[y] for y in range(a, b + 1)])))
    json.dump(res, open(path, "w"))
    log(f"{model}: done")
    return res

if "--dry" in sys.argv:
    for m in MODELS:
        pick_cells(m)
    sys.exit()

results = {}
for m in MODELS:
    try:
        results[m] = process_model(m)
    except Exception as e:
        log(f"SKIPPED {m}: {type(e).__name__}: {e}")
if len(results) < MIN_MODELS:
    sys.exit(f"only {len(results)} models worked; not writing {OUT}")
names = list(results)
med = lambda arrs: np.median(np.array(arrs), axis=0)
r1 = lambda v: np.round(v, 1).tolist()

out_cities = []
for k, c in enumerate(cities):
    o = {"name": c["name"], "lat": c["lat"], "lon": c["lon"],
         "thr_c": round(float(np.median([results[m]["thr_c"][k] for m in names])), 1),
         "years": results[names[0]]["years"], "yearly": {}, "monthly": {}, "run": {}, "total": {}}
    o["monthly"]["baseline"] = r1(med([results[m]["monthly"]["baseline"][k] for m in names]))
    o["run"]["baseline"] = round(float(np.median([results[m]["run"]["baseline"][k] for m in names])), 1)
    for sc in SCEN:
        o["yearly"][sc] = r1(med([results[m]["yearly"][sc][k] for m in names]))
        o["monthly"][sc], o["run"][sc], o["total"][sc] = {}, {}, {}
        for w in WINDOWS:
            mon = [results[m]["monthly_sc"][sc][w["id"]][k] for m in names]
            tot = [sum(x) for x in mon]                        # hot days per year in this window, per model
            o["monthly"][sc][w["id"]] = r1(med(mon))
            o["run"][sc][w["id"]] = round(float(np.median([results[m]["run_sc"][sc][w["id"]][k] for m in names])), 1)
            o["total"][sc][w["id"]] = {"med": round(float(np.median(tot)), 1), "lo": round(float(min(tot)), 1),
                                       "hi": round(float(max(tot)), 1), "per_model": [round(float(t), 1) for t in tot]}
    out_cities.append(o)

json.dump({"models": names, "baseline": list(BASE), "born": BORN, "windows": WINDOWS, "scenarios": SCEN,
           "cities": out_cities}, open(OUT, "w"), separators=(",", ":"))
log(f"saved {OUT} from {len(names)} models: {', '.join(names)}")
