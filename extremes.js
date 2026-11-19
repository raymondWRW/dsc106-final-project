// Sections 2-5: extreme heat and heavy-rain days.
// Data comes from data/extremes.json, made by the export cell in the final project notebook.
(() => {
  const COLORS = { historical: "#4a4a4a", ssp245: "#e08a1e", ssp585: "#b2182b" };
  const LABELS = { historical: "Historical", ssp245: "SSP2-4.5", ssp585: "SSP5-8.5" };
  const DESC = { ssp245: "Middle road", ssp585: "High emissions" };
  const SCEN = ["ssp245", "ssp585"];
  const tip = document.getElementById("tooltip");
  const sum = a => a.reduce((x, y) => x + y, 0);
  const signed = v => `${v >= 0 ? "+" : "−"}${Math.abs(v)}`;
  const latName = v => `${Math.abs(v).toFixed(0)}°${v >= 0 ? "N" : "S"}`;
  const lonName = v => `${Math.abs(v).toFixed(0)}°${v >= 0 ? "E" : "W"}`;
  const cToF = c => c * 9 / 5 + 32;
  let X, land;

  function showTip(evt, html) {
    tip.innerHTML = html; tip.hidden = false;
    const flip = evt.clientX > window.innerWidth - 250;
    tip.style.left = `${evt.clientX + (flip ? -220 : 14)}px`;
    tip.style.top = `${evt.clientY + 14}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  const width = id => Math.max(280, document.getElementById(id).parentElement.clientWidth - 28);

  function segmented(sel, items, isOn, onPick, isDisabled = () => false) {
    const b = d3.select(sel).selectAll("button").data(items).join("button")
      .attr("type", "button").style("--c", d => d.color || "#1c1c1a")
      .html(d => `<b>${d.label}</b>${d.desc ? `<span>${d.desc}</span>` : ""}`)
      .on("click", (_, d) => { if (!isDisabled(d)) onPick(d); });
    return () => b.attr("aria-pressed", d => isOn(d)).property("disabled", d => isDisabled(d));
  }

  Promise.all([
    d3.json("data/extremes.json"),
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json"),
  ]).then(([data, world]) => {
    X = data;
    land = topojson.feature(world, world.objects.land);
    document.querySelectorAll('[data-fact="baseline"]').forEach(e => { e.textContent = X.baseline.join("–"); });
    document.querySelectorAll('[data-fact="baseDays"]').forEach(e => { e.textContent = Math.round(X.base_days); });
    document.getElementById("xmethod").textContent =
      `Data: CMIP6 daily maximum temperature (tasmax) and precipitation (pr) from ${X.models.join(", ")}, regridded to ${X.cell}°. ` +
      `Extreme heat = a daily high above that grid cell's own 95th percentile for ${X.baseline.join("–")}. ` +
      `Heavy rain = daily rain above the 95th percentile of that cell's wet days (at least 1 mm) in the same years. ` +
      `Land averages are weighted by area.`;
    heatLine(); changeMap(); regions(); tail();
  }).catch(err => {
    console.error(err);
    ["s-heat", "s-map", "s-regions", "s-tail"].forEach(id => {
      const p = document.createElement("p"); p.className = "notice";
      p.textContent = "Could not load data/extremes.json. Run the export cell in the notebook and put the file in the data folder.";
      document.getElementById(id).appendChild(p);
    });
  });

  // ===== Section 2: land heat days over time =====
  function heatLine() {
    const show = new Set(SCEN);
    const years = X.series.years;
    const rolling = arr => arr.map((_, i) => {
      const w = arr.slice(Math.max(0, i - 5), i + 6);
      return w.length >= 6 ? d3.mean(w) : null;
    });
    const lines = SCEN.map(sc => ({ id: sc, raw: X.series[sc], smooth: rolling(X.series[sc]) }));
    const endMean = sc => d3.mean(years.map((y, i) => (y >= X.future[0] && y <= X.future[1] ? X.series[sc][i] : null)).filter(v => v != null));
    const end = Object.fromEntries(SCEN.map(sc => [sc, endMean(sc)]));
    const refresh = segmented("#heatScen", SCEN.map(id => ({ id, label: LABELS[id], desc: DESC[id], color: COLORS[id] })),
      d => show.has(d.id), d => { show.has(d.id) && show.size > 1 ? show.delete(d.id) : show.add(d.id); draw(); });

    function draw() {
      refresh();
      const shown = SCEN.filter(sc => show.has(sc));
      document.getElementById("heatHeadline").innerHTML = shown.length
        ? `<b>Land goes from about ${Math.round(X.base_days)} extreme heat days a year</b> in ${X.baseline.join("–")} to ` +
          shown.map(sc => `${Math.round(end[sc])} under ${LABELS[sc]}`).join(" and ") + ` by ${X.future.join("–")}.`
        : `<b>Land averages about ${Math.round(X.base_days)} extreme heat days a year</b> in ${X.baseline.join("–")}, by definition.`;
      const w = width("heatLine"), h = 340, m = { t: 14, r: w < 480 ? 64 : 176, b: 28, l: 44 };
      const svg = d3.select("#heatLine").attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
      svg.selectAll("*").remove();
      const x = d3.scaleLinear().domain(d3.extent(years)).range([m.l, w - m.r]);
      const y = d3.scaleLinear().domain([0, d3.max(lines, l => d3.max(l.raw))]).nice().range([h - m.b, m.t]);
      svg.append("rect").attr("x", x(X.baseline[0])).attr("width", x(X.baseline[1]) - x(X.baseline[0]))
        .attr("y", m.t).attr("height", h - m.b - m.t).attr("fill", "#f1f0ec");
      svg.append("text").attr("class", "lab").attr("x", (x(X.baseline[0]) + x(X.baseline[1])) / 2).attr("y", m.t + 12)
        .attr("text-anchor", "middle").style("fill", "#5e5d59").text("baseline");
      svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line")
        .attr("x1", m.l).attr("x2", w - m.r).attr("y1", d => y(d)).attr("y2", d => y(d));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 520 ? 4 : 8).tickFormat(d3.format("d")));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(X.base_days)).attr("y2", y(X.base_days))
        .attr("stroke", "#5e5d59").attr("stroke-dasharray", "2 3");
      const gen = (from, to) => d3.line().defined((d, i) => d != null && years[i] >= from && years[i] <= to)
        .x((_, i) => x(years[i])).y(d => y(d));
      const past = lines[0];
      svg.append("path").datum(past.raw).attr("d", gen(1950, 2014)).attr("fill", "none").attr("stroke", COLORS.historical).attr("stroke-width", 1).attr("opacity", 0.35);
      svg.append("path").datum(past.smooth).attr("d", gen(1950, 2014)).attr("fill", "none").attr("stroke", COLORS.historical).attr("stroke-width", 2.2);
      svg.append("text").attr("class", "lab").attr("x", x(1953)).attr("y", y(X.base_days) + 24).style("font-weight", 700).text("Historical");
      const labels = [];
      lines.filter(l => show.has(l.id)).forEach(l => {
        svg.append("path").datum(l.raw).attr("d", gen(2014, 2100)).attr("fill", "none").attr("stroke", COLORS[l.id]).attr("stroke-width", 1).attr("opacity", 0.35);
        svg.append("path").datum(l.smooth).attr("d", gen(2014, 2100)).attr("fill", "none").attr("stroke", COLORS[l.id]).attr("stroke-width", 2.2);
        const lastI = d3.max(l.smooth.map((v, i) => (v != null ? i : -1)));
        labels.push({ y: y(l.smooth[lastI]), text: w < 480 ? `≈${Math.round(end[l.id])}/yr` : `${LABELS[l.id]}: ≈${Math.round(end[l.id])}/yr (${(end[l.id] / X.base_days).toFixed(1)}×)`, color: COLORS[l.id] });
      });
      labels.sort((a, b) => a.y - b.y).forEach((d, i, arr) => { if (i && d.y - arr[i - 1].y < 16) d.y = arr[i - 1].y + 16; });
      svg.selectAll(".end").data(labels).join("text").attr("class", "lab end").attr("x", w - m.r + 6).attr("y", d => d.y + 4)
        .style("fill", d => d.color).style("font-weight", 700).text(d => d.text);
      svg.append("text").attr("class", "lab").attr("x", m.l + 4).attr("y", y(X.base_days) - 5).style("fill", "#5e5d59")
        .text(`${Math.round(X.base_days)} days/yr = hottest 5% of baseline days`);

      // Hover: a crosshair with every shown value for that year
      const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "#9a9892").attr("visibility", "hidden");
      const dots = svg.append("g");
      svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.r - m.l).attr("height", h - m.b - m.t).attr("fill", "transparent")
        .on("mousemove", evt => {
          const [px] = d3.pointer(evt);
          const yr = Math.round(x.invert(px)); const i = years.indexOf(yr);
          if (i < 0) return;
          cross.attr("x1", x(yr)).attr("x2", x(yr)).attr("visibility", "visible");
          const rows = yr <= 2014 ? [["historical", past]] : lines.filter(l => show.has(l.id)).map(l => [l.id, l]);
          dots.selectAll("circle").data(rows.filter(r => r[1].smooth[i] != null)).join("circle")
            .attr("cx", x(yr)).attr("cy", d => y(d[1].smooth[i])).attr("r", 4).attr("fill", d => COLORS[d[0]]).attr("stroke", "#fff").attr("stroke-width", 2);
          showTip(evt, `<b>${yr}</b><br>` + rows.map(([k, l]) =>
            `${LABELS[k]}: ${l.raw[i].toFixed(0)} days${l.smooth[i] != null ? ` (trend ${l.smooth[i].toFixed(0)})` : ""}`).join("<br>"));
        })
        .on("mouseleave", () => { cross.attr("visibility", "hidden"); dots.selectAll("*").remove(); hideTip(); });
    }
    draw();
    new ResizeObserver(draw).observe(document.getElementById("heatLine").parentElement);

    // Story steps: show no future line, then one scenario, then both.
    const showOnly = ids => () => { show.clear(); ids.forEach(id => show.add(id)); draw(); };
    if (window.Story) {
      Story.register("heat.base", showOnly([]));
      Story.register("heat.mid", showOnly(["ssp245"]));
      Story.register("heat.high", showOnly(SCEN));
    }
  }

  // ===== Section 3: where heat and rain change =====
  function changeMap() {
    const canvas = document.getElementById("xmap"), ctx = canvas.getContext("2d");
    const nLat = X.lat.length, nLon = X.lon.length, half = X.cell / 2;
    const state = { v: "heat", sc: "ssp585" };
    const weights = X.lat.map(la => Math.cos(la * Math.PI / 180));
    const heatColor = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 250]).clamp(true);
    const rainColor = d3.scaleDiverging(t => d3.interpolateBrBG(t)).domain([-100, 0, 100]).clamp(true);
    const MISSING = "#d9d7d2";
    let projection, cells, w = 0, hgt;
    const VARS = [{ id: "heat", label: "Extreme heat" }, { id: "rain", label: "Heavy rain" }];
    const available = (v, sc) => X.maps[v] && X.maps[v][sc];
    const refreshVar = segmented("#mapVar", VARS, d => d.id === state.v, d => {
      state.v = d.id; if (!available(state.v, state.sc)) state.sc = Object.keys(X.maps[state.v])[0]; draw();
    });
    const refreshSc = segmented("#mapScen", SCEN.map(id => ({ id, label: LABELS[id], desc: DESC[id], color: COLORS[id] })),
      d => d.id === state.sc, d => { state.sc = d.id; draw(); }, d => !available(state.v, d.id));

    function layout() {
      const cw = canvas.parentElement.clientWidth;
      if (!cw || cw === w) return false;
      w = cw; hgt = Math.round(w * 0.487);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = hgt * dpr; canvas.style.height = `${hgt}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      projection = d3.geoEqualEarth().fitExtent([[2, 2], [w - 2, hgt - 2]], { type: "Sphere" });
      cells = [];
      X.lat.forEach((la, i) => X.lon.forEach((lo, j) => {
        const path = new Path2D();
        [[lo - half, la - half], [lo - half, la + half], [lo + half, la + half], [lo + half, la - half]]
          .map(p => projection(p)).forEach((p, k) => (k ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
        path.closePath(); cells.push({ k: i * nLon + j, path });
      }));
      return true;
    }
    const values = () => X.maps[state.v][state.sc];
    const colorOf = v => (v == null ? MISSING : state.v === "heat" ? heatColor(v) : rainColor(v));

    function landMean(filter) {
      const vals = values(); let s = 0, ws = 0;
      for (let i = 0; i < nLat; i++) for (let j = 0; j < nLon; j++) {
        const k = i * nLon + j;
        if (!X.land[k] || vals[k] == null || !filter(X.lat[i], vals[k])) continue;
        s += vals[k] * weights[i]; ws += weights[i];
      }
      return { mean: ws ? s / ws : null, weight: ws };
    }

    function legend() {
      const lw = 420, lh = 44, svg = d3.select("#xlegend").html("").append("svg").attr("viewBox", `0 0 ${lw} ${lh}`)
        .attr("width", lw).attr("height", lh).style("width", `${lw}px`).style("max-width", "100%").style("height", "auto");
      const dom = state.v === "heat" ? [0, 250] : [-100, 100];
      const sx = d3.scaleLinear().domain(dom).range([10, 290]);
      const grad = svg.append("defs").append("linearGradient").attr("id", "xgrad");
      d3.range(0, 1.001, 0.05).forEach(t => grad.append("stop").attr("offset", t).attr("stop-color", colorOf(dom[0] + t * (dom[1] - dom[0]))));
      svg.append("rect").attr("x", 10).attr("y", 4).attr("width", 280).attr("height", 11).attr("rx", 2).attr("fill", "url(#xgrad)");
      const ticks = state.v === "heat" ? [0, 50, 100, 150, 200, 250] : [-100, -50, 0, 50, 100];
      svg.append("g").attr("class", "axis").attr("transform", "translate(0,15)")
        .call(d3.axisBottom(sx).tickValues(ticks).tickSize(4).tickFormat(d => state.v === "heat" ? (d === 250 ? "250+" : d) : `${d > 0 ? "+" : ""}${d}%`))
        .call(g => g.select(".domain").remove());
      if (state.v === "rain") {
        svg.append("rect").attr("x", 306).attr("y", 4).attr("width", 18).attr("height", 11).attr("rx", 2).attr("fill", MISSING);
        svg.append("text").attr("class", "lab").attr("x", 330).attr("y", 14).text("Too dry to measure");
      }
    }

    function draw() {
      layout(); refreshVar(); refreshSc();
      const vals = values();
      ctx.clearRect(0, 0, w, hgt); ctx.lineWidth = 0.6;
      for (const c of cells) { const f = colorOf(vals[c.k]); ctx.fillStyle = f; ctx.strokeStyle = f; ctx.fill(c.path); ctx.stroke(c.path); }
      const path = d3.geoPath(projection, ctx);
      ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(20,20,20,.7)"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = "#bdbbb4"; ctx.lineWidth = 1; ctx.stroke();
      legend();
      const span = `${X.future.join("–")} vs ${X.baseline.join("–")}, ${LABELS[state.sc]}`;
      if (state.v === "heat") {
        const t = landMean(la => Math.abs(la) < 23.5).mean, o = landMean(la => Math.abs(la) >= 23.5).mean;
        document.getElementById("mapHeadline").innerHTML =
          `<b>Tropical land gains about ${Math.round(t)} extreme heat days a year</b>, compared with ${Math.round(o)} on land outside the tropics.`;
        document.getElementById("xcaption").textContent = `Change in extreme heat days per year, ${span}. Hover for values.`;
      } else {
        const up = landMean((_, v) => v > 0).weight, all = landMean(() => true).weight;
        document.getElementById("mapHeadline").innerHTML =
          `<b>Heavy-rain days become more common across ${Math.round(100 * up / all)}% of land</b> that has enough heavy rain to measure.`;
        document.getElementById("xcaption").textContent =
          `Percent change in heavy-rain days per year, ${span}. Only SSP5-8.5 is available for rain so far. Hover for values.`;
      }
    }

    canvas.addEventListener("mousemove", evt => {
      const box = canvas.getBoundingClientRect();
      const ll = projection.invert([evt.clientX - box.left, evt.clientY - box.top]);
      if (!ll || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) return hideTip();
      const i = d3.leastIndex(X.lat, (a, b) => Math.abs(a - ll[1]) - Math.abs(b - ll[1]));
      const j = d3.leastIndex(X.lon, (a, b) => Math.abs(a - ll[0]) - Math.abs(b - ll[0]));
      const v = values()[i * nLon + j];
      const text = v == null ? "Too few heavy-rain days to measure"
        : state.v === "heat" ? `${signed(v)} extreme heat days a year` : `${signed(v)}% heavy-rain days`;
      showTip(evt, `<b>${text}</b><br>${latName(X.lat[i])}, ${lonName(X.lon[j])}<br>${LABELS[state.sc]}, ${X.future.join("–")}`);
    });
    canvas.addEventListener("mouseleave", hideTip);
    draw();
    new ResizeObserver(() => { if (layout()) draw(); }).observe(canvas.parentElement);

    // Story steps: heat under high emissions, heat under the middle road, then rain.
    const showMap = (v, sc) => () => { state.v = v; state.sc = sc; draw(); };
    if (window.Story) {
      Story.register("map.heat585", showMap("heat", "ssp585"));
      Story.register("map.heat245", showMap("heat", "ssp245"));
      Story.register("map.rain", showMap("rain", "ssp585"));
    }
  }

  // ===== Section 4: regions by decade =====
  function regions() {
    const rows = X.regions.rows, decades = X.regions.decades;
    rows.sort((a, b) => d3.max(b.ssp585) - d3.max(a.ssp585));
    const state = { name: rows.some(r => r.name === "Southern California") ? "Southern California" : rows[0].name };
    const yMax = d3.max(rows, r => d3.max(SCEN, sc => d3.max(r[sc])));
    const refresh = segmented("#regionPick", rows.map(r => ({ id: r.name, label: r.name })), d => d.id === state.name,
      d => { state.name = d.id; draw(); });

    function draw() {
      refresh(); hideTip();
      const r = rows.find(d => d.name === state.name);
      const a = r.ssp245.at(-1), b = r.ssp585.at(-1);
      document.getElementById("regionTitle").textContent = `${r.name}: extreme heat days per year, decade averages`;
      document.getElementById("regionHeadline").innerHTML =
        `<b>In the 2090s, ${r.name} sees about ${Math.round(a)} extreme heat days a year under SSP2-4.5 and ${Math.round(b)} under SSP5-8.5</b>, ` +
        `${(b / a).toFixed(1)}× as many with high emissions.`;
      const w = width("regionBars"), narrow = w < 480, h = 320, m = { t: narrow ? 46 : 34, r: 16, b: 30, l: 40 };
      const svg = d3.select("#regionBars").attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
      svg.selectAll("*").remove();
      const x0 = d3.scaleBand().domain(decades).range([m.l, w - m.r]).padding(0.25);
      const x1 = d3.scaleBand().domain(SCEN).range([0, x0.bandwidth()]).padding(0.08);
      const y = d3.scaleLinear().domain([0, yMax]).nice().range([h - m.b, m.t]);
      svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line")
        .attr("x1", m.l).attr("x2", w - m.r).attr("y1", d => y(d)).attr("y2", d => y(d));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x0).tickFormat(d => `${d}s`));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
      const bars = decades.flatMap((d, i) => SCEN.map(sc => ({ d, sc, v: r[sc][i] })));
      svg.append("g").selectAll("path").data(bars).join("path")
        .attr("fill", d => COLORS[d.sc])
        .attr("d", d => { // rounded top corners, square at the baseline
          const x = x0(d.d) + x1(d.sc), bw = x1.bandwidth(), top = y(d.v), base = y(0), rr = Math.min(4, bw / 2, base - top);
          return `M${x},${base}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + bw - rr}Q${x + bw},${top} ${x + bw},${top + rr}V${base}Z`;
        })
        .on("mousemove", (evt, d) => showTip(evt, `<b>${d.d}s, ${LABELS[d.sc]}</b><br>${d.v.toFixed(0)} extreme heat days a year`))
        .on("mouseleave", hideTip);
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(r.base)).attr("y2", y(r.base)).attr("stroke", "#5e5d59").attr("stroke-dasharray", "2 3");
      svg.append("text").attr("class", "lab").attr("x", m.l + 4).attr("y", y(r.base) - 5).style("fill", "#5e5d59").text(`${X.baseline.join("–")} level (${Math.round(r.base)} days)`);
      // Callout on the last decade: the gap between the two paths is the part that is up to us
      const last = decades.length - 1, gap = Math.round(r.ssp585[last] - r.ssp245[last]);
      svg.append("text").attr("class", "lab").attr("x", x0(decades[last]) + x0.bandwidth()).attr("y", y(Math.max(r.ssp245[last], r.ssp585[last])) - 8)
        .attr("text-anchor", "end").style("font-weight", 700).style("paint-order", "stroke").style("stroke", "#fff").style("stroke-width", 3)
        .text(`+${gap} days from our choices`);
      const lg = svg.append("g").attr("transform", `translate(${m.l},4)`);
      SCEN.forEach((sc, i) => {
        lg.append("rect").attr("x", narrow ? 0 : i * 200).attr("y", narrow ? i * 18 : 0).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", COLORS[sc]);
        lg.append("text").attr("class", "lab").attr("x", (narrow ? 0 : i * 200) + 17).attr("y", (narrow ? i * 18 : 0) + 10).text(`${LABELS[sc]} (${DESC[sc].toLowerCase()})`);
      });
    }
    draw();
    new ResizeObserver(draw).observe(document.getElementById("regionBars").parentElement);

    // Story steps: each one picks a region (skipped if that region is not in the data).
    const pick = name => () => { if (rows.some(r => r.name === name)) { state.name = name; draw(); } };
    if (window.Story) {
      Story.register("region.socal", pick("Southern California"));
      Story.register("region.amazon", pick("Amazon"));
      Story.register("region.med", pick("Mediterranean"));
    }
  }

  // ===== Section 5: the hot tail in California =====
  function tail() {
    const { start, width: bw, counts, thr } = X.ca;
    const keys = ["historical", ...SCEN].filter(k => counts[k]);
    const nBins = counts[keys[0]].length;
    const centres = d3.range(nBins).map(i => start + (i + 0.5) * bw);
    const totals = Object.fromEntries(keys.map(k => [k, sum(counts[k])]));
    // Smooth each histogram a little (Gaussian, about 1°C wide) so the curves read as distributions
    const kernel = d3.range(-8, 9).map(i => Math.exp(-0.5 * (i * bw / 0.9) ** 2));
    const dens = Object.fromEntries(keys.map(k => [k, counts[k].map((_, i) =>
      sum(kernel.map((kv, o) => kv * (counts[k][i + o - 8] || 0))) / sum(kernel) / totals[k] / bw)]));
    const peak = d3.max(keys, k => d3.max(dens[k]));
    const NAMES = { historical: X.baseline.join("–"), ssp245: `${X.future.join("–")}, SSP2-4.5`, ssp585: `${X.future.join("–")}, SSP5-8.5` };
    const slider = document.getElementById("tailCut");
    slider.min = Math.ceil(start + 4); slider.max = Math.floor(start + nBins * bw - 4); slider.value = thr;
    let cut = thr;
    const share = k => sum(counts[k].map((c, i) => (centres[i] >= cut ? c : 0))) / totals[k];

    function draw() {
      document.getElementById("tailValue").textContent = `${cut.toFixed(1)}°C (${cToF(cut).toFixed(0)}°F)${Math.abs(cut - thr) < 0.13 ? ", the old top 5%" : ""}`;
      const s = Object.fromEntries(keys.map(k => [k, share(k)]));
      document.getElementById("tailHeadline").innerHTML =
        `<b>Days above ${cToF(cut).toFixed(0)}°F go from ${(100 * s.historical).toFixed(0)}% of summer days</b> to ` +
        SCEN.filter(k => s[k] != null).map(k => `${(100 * s[k]).toFixed(0)}% under ${LABELS[k]}`).join(" and ") + ".";
      const w = width("tailChart"), rowH = 92, m = { t: 26, r: 110, b: 34, l: 16 }, h = m.t + rowH * keys.length + m.b;
      const svg = d3.select("#tailChart").attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
      svg.selectAll("*").remove();
      const x = d3.scaleLinear().domain([start + 4, start + nBins * bw - 4]).range([m.l, w - m.r]);
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat(d => `${d}°C`));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`)
        .call(d3.axisTop(d3.scaleLinear().domain(x.domain().map(cToF)).range(x.range())).ticks(8).tickFormat(d => `${d}°F`));
      keys.forEach((k, r) => {
        const base = m.t + rowH * (r + 1) - 8, yy = d => base - (d / peak) * (rowH * 0.98);
        const pts = centres.map((c, i) => [c, dens[k][i]]).filter(p => p[0] >= x.domain()[0] && p[0] <= x.domain()[1]);
        const area = d3.area().x(p => x(p[0])).y0(base).y1(p => yy(p[1])).curve(d3.curveBasis);
        svg.append("path").datum(pts).attr("d", area).attr("fill", COLORS[k]).attr("opacity", 0.22);
        svg.append("path").datum(pts.filter(p => p[0] >= cut - bw / 2)).attr("d", area).attr("fill", COLORS[k]).attr("opacity", 0.9);
        svg.append("path").datum(pts).attr("d", d3.line().x(p => x(p[0])).y(p => yy(p[1])).curve(d3.curveBasis)).attr("fill", "none").attr("stroke", COLORS[k]).attr("stroke-width", 1.5);
        svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", base).attr("y2", base).attr("stroke", "#d6d4ce");
        svg.append("text").attr("class", "lab").attr("x", m.l).attr("y", base - 6).style("fill", COLORS[k]).style("font-weight", 700).text(NAMES[k]);
        svg.append("text").attr("class", "lab").attr("x", w - m.r + 8).attr("y", base - 6).style("fill", COLORS[k]).style("font-weight", 700)
          .text(`${(100 * share(k)).toFixed(0)}% above`);
      });
      // The draggable cutoff line, with a wide invisible hit area
      const g = svg.append("g").style("cursor", "ew-resize");
      g.append("line").attr("x1", x(cut)).attr("x2", x(cut)).attr("y1", m.t - 4).attr("y2", h - m.b).attr("stroke", "#1c1c1a").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 3");
      g.append("rect").attr("x", x(cut) - 12).attr("width", 24).attr("y", m.t - 4).attr("height", h - m.b - m.t + 4).attr("fill", "transparent");
      g.append("circle").attr("cx", x(cut)).attr("cy", h - m.b).attr("r", 7).attr("fill", "#1c1c1a").attr("stroke", "#fff").attr("stroke-width", 2);
      const flip = x(cut) > w - m.r - 140;   // keep the label inside the chart near the right edge
      g.append("text").attr("class", "lab").attr("x", x(cut) + (flip ? -7 : 7)).attr("y", m.t + 12).attr("text-anchor", flip ? "end" : "start")
        .style("font-weight", 700).style("paint-order", "stroke").style("stroke", "#fff").style("stroke-width", 3).style("pointer-events", "none")
        .text(Math.abs(cut - thr) < 0.13 ? "old top 5% cutoff" : `${cToF(cut).toFixed(0)}°F cutoff`);
      g.call(d3.drag().on("drag", evt => setCut(x.invert(evt.x))));
    }
    function setCut(v) {
      const lo = +slider.min, hi = +slider.max;
      cut = Math.round(Math.min(hi, Math.max(lo, v)) / 0.25) * 0.25; slider.value = cut; draw();
    }
    slider.addEventListener("input", () => setCut(+slider.value));
    document.getElementById("tailReset").addEventListener("click", () => { cut = thr; slider.value = thr; draw(); });
    draw();
    new ResizeObserver(draw).observe(document.getElementById("tailChart").parentElement);

    // Story steps: the old top-5% cutoff, then a much hotter one. The last step leaves the line where it is.
    if (window.Story) {
      Story.register("tail.old", () => setCut(thr));
      Story.register("tail.hot", () => setCut(thr + 3));
    }
  }

  // Highlight the current section in the top menu
  const links = [...document.querySelectorAll(".toc a")];
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`));
  }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("main > section[id]").forEach(s => io.observe(s));
})();
