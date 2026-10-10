(() => {
"use strict";

const DATA_URL = "../data/lab9_gdp_2025_top50.csv";
const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const NAME_ALIASES = new Map([
  ["United States", "United States of America"],
  ["United States of America", "United States of America"],
  ["Russian Federation", "Russia"],
  ["Türkiye", "Turkey"],
  ["Turkiye", "Turkey"],
  ["Korea, Rep.", "South Korea"],
  ["Republic of Korea", "South Korea"],
  ["Korea, South", "South Korea"],
  ["Iran, Islamic Rep.", "Iran"],
  ["Viet Nam", "Vietnam"],
  ["Czechia", "Czech Rep."],
  ["Czech Republic", "Czech Rep."],
  ["Hong Kong SAR", "Hong Kong"],
  ["Hong Kong SAR, China", "Hong Kong"],
  ["Egypt, Arab Rep.", "Egypt"],
  ["Slovak Republic", "Slovakia"]
]);

function normalizeName(name){
  const n = (name || "").trim();
  return NAME_ALIASES.get(n) || n;
}

function moneyBillions(v){
  if (v == null || !Number.isFinite(v)) return "No data";
  if (v >= 1000) return "$" + d3.format(",.2f")(v / 1000) + " trillion";
  return "$" + d3.format(",.0f")(v) + " billion";
}

function parseGDPRow(d){
  const candidateKeys = [
    "gdp_2025_billion_usd",
    "gdp_2025_billion",
    "gdp_billion_usd",
    "gdp"
  ];
  let value = NaN;
  for (const k of candidateKeys){
    if (k in d && d[k] !== ""){
      value = +String(d[k]).replace(/,/g,"");
      if (Number.isFinite(value)) break;
    }
  }
  return {
    ...d,
    iso3: (d.iso3 || d.ISO3 || "").trim(),
    country: normalizeName(d.country || d.Country || d.name || ""),
    gdp: value,
    rank: +(d.rank || d.Rank || NaN)
  };
}

function makeNameLookup(features){
  const m = new Map();
  features.forEach(f => {
    const n = normalizeName(f.properties.name);
    m.set(n.toLowerCase(), f);
  });
  return m;
}


const tooltip = d3.select("#tooltip");
const chorSvg = d3.select("#choropleth");
const cartSvg = d3.select("#cartogram");
const W = 1000, H = 560;

let selectedCountry = null;
let countryPaths = null;
let cartNodesSel = null;
let simulation = null;

Promise.all([
  d3.csv(DATA_URL, parseGDPRow),
  d3.json(WORLD_URL)
]).then(([gdpData, world]) => {
  const features = topojson.feature(world, world.objects.countries).features;
  const featureByName = makeNameLookup(features);

  const cleanGDP = gdpData.filter(d => d.country && Number.isFinite(d.gdp) && d.gdp > 0);
  if (!cleanGDP.length) throw new Error("No valid GDP rows were found in the course CSV.");

  const gdpByName = new Map(cleanGDP.map(d => [d.country.toLowerCase(), d]));

  features.forEach(f => {
    const row = gdpByName.get(normalizeName(f.properties.name).toLowerCase());
    f.properties.row = row || null;
    f.properties.gdp = row ? row.gdp : null;
    f.properties.rank = row ? row.rank : null;
  });

  const unmatched = cleanGDP.filter(d => !featureByName.has(d.country.toLowerCase()));
  if (unmatched.length){
    console.warn("GDP rows not matched to map features:", unmatched.map(d => d.country));
  }

  drawChoropleth(features, cleanGDP);
  drawCartogram(features, cleanGDP);
}).catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="padding:12px;background:#ffdede;font-family:monospace">Lab 9 error: ${err}</div>`
  );
});

function drawChoropleth(features, gdpData){
  const projection = d3.geoNaturalEarth1().fitExtent([[20,20],[W-20,H-20]], {
    type:"FeatureCollection",
    features
  });
  const path = d3.geoPath(projection);

  const extent = d3.extent(gdpData, d => d.gdp);
  const color = d3.scaleSequentialLog(d3.interpolateBlues).domain(extent);

  const defs = chorSvg.append("defs");
  const grad = defs.append("linearGradient").attr("id","gdp-gradient");
  d3.range(0,1.0001,0.1).forEach(t => {
    grad.append("stop")
      .attr("offset", `${t*100}%`)
      .attr("stop-color", color(Math.exp(Math.log(extent[0])*(1-t)+Math.log(extent[1])*t)));
  });
  d3.select("#legend-bar").style("background","linear-gradient(90deg,#eff6ff,#08306b)");
  d3.select("#legend-min").text(moneyBillions(extent[0]));
  d3.select("#legend-max").text(moneyBillions(extent[1]));

  const g = chorSvg.append("g").attr("class","map-layer");

  countryPaths = g.selectAll("path")
    .data(features)
    .join("path")
    .attr("class","country")
    .attr("d",path)
    .attr("fill",d => d.properties.gdp == null ? "#e5e7eb" : color(d.properties.gdp))
    .attr("stroke","#fff")
    .attr("stroke-width",0.55)
    .on("mouseover",(event,d) => {
      showTooltip(event,d);
      hoverCountry(normalizeName(d.properties.name), true);
    })
    .on("mousemove",moveTooltip)
    .on("mouseout",(event,d) => {
      tooltip.style("opacity",0);
      hoverCountry(normalizeName(d.properties.name), false);
    })
    .on("click",(event,d) => {
      const name = normalizeName(d.properties.name);
      selectedCountry = selectedCountry === name ? null : name;
      updateHighlights();
    });

  const zoom = d3.zoom()
    .scaleExtent([1,8])
    .on("zoom",event => g.attr("transform",event.transform));
  chorSvg.call(zoom);

  d3.select("#reset-map").on("click",() => {
    chorSvg.transition().duration(300).call(zoom.transform,d3.zoomIdentity);
  });
  d3.select("#clear-selection").on("click",() => {
    selectedCountry = null;
    updateHighlights();
  });
}

function drawCartogram(features, gdpData){
  const projection = d3.geoNaturalEarth1().fitExtent([[35,30],[W-35,H-30]], {
    type:"FeatureCollection",
    features
  });
  const path = d3.geoPath(projection);

  const gdpByName = new Map(gdpData.map(d => [d.country.toLowerCase(), d]));
  const nodes = [];

  features.forEach(f => {
    const name = normalizeName(f.properties.name);
    const row = gdpByName.get(name.toLowerCase());
    if (!row) return;

    const c = path.centroid(f);
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;

    nodes.push({
      country:name,
      gdp:row.gdp,
      rank:row.rank,
      tx:c[0],
      ty:c[1],
      x:c[0],
      y:c[1]
    });
  });

  const maxGDP = d3.max(nodes,d=>d.gdp);
  // radius uses sqrt scaling, so circle AREA is proportional to GDP
  const radius = d3.scaleSqrt().domain([0,maxGDP]).range([3,47]);
  nodes.forEach(d => d.r = radius(d.gdp));

  // faint graticule / world outline for geographic context
  const projection2 = projection;
  const geoPath2 = d3.geoPath(projection2);
  cartSvg.append("path")
    .datum(topojson.mesh(
      {type:"Topology",objects:{countries:{type:"GeometryCollection",geometries:[]}},arcs:[]},
      {type:"GeometryCollection",geometries:[]}
    ))
    .attr("fill","none");

  cartSvg.append("text")
    .attr("x",20).attr("y",28)
    .attr("font-size",13).attr("fill","#667085")
    .text("Circle area ∝ 2025 nominal GDP; position remains near geographic centroid");

  cartNodesSel = cartSvg.append("g")
    .selectAll("circle")
    .data(nodes,d=>d.country)
    .join("circle")
    .attr("class","cartogram-node")
    .attr("r",d=>d.r)
    .attr("cx",d=>d.x)
    .attr("cy",d=>d.y)
    .attr("fill","#4f8edc")
    .attr("fill-opacity",0.72)
    .attr("stroke","#fff")
    .attr("stroke-width",1.2)
    .on("mouseover",(event,d) => {
      tooltip.style("opacity",1).html(
        `<strong>${d.country}</strong><br>GDP: ${moneyBillions(d.gdp)}<br>Rank: ${Number.isFinite(d.rank) ? d.rank : "n/a"}`
      );
      moveTooltip(event);
      hoverCountry(d.country,true);
    })
    .on("mousemove",moveTooltip)
    .on("mouseout",(event,d) => {
      tooltip.style("opacity",0);
      hoverCountry(d.country,false);
    })
    .on("click",(event,d) => {
      selectedCountry = selectedCountry === d.country ? null : d.country;
      updateHighlights();
    });

  cartSvg.append("g")
    .selectAll("text")
    .data(nodes.filter(d => d.r >= 18))
    .join("text")
    .attr("text-anchor","middle")
    .attr("dominant-baseline","middle")
    .attr("font-size",d=>Math.min(11,Math.max(8,d.r/3.8)))
    .attr("pointer-events","none")
    .attr("fill","#10243f")
    .text(d => d.country.length > 12 ? d.country.slice(0,10)+"…" : d.country)
    .each(function(d){ d.labelNode = this; });

  simulation = d3.forceSimulation(nodes)
    .force("x",d3.forceX(d=>d.tx).strength(0.22))
    .force("y",d3.forceY(d=>d.ty).strength(0.22))
    .force("collide",d3.forceCollide(d=>d.r+1.8).iterations(3))
    .alpha(1)
    .alphaDecay(0.035)
    .on("tick",() => {
      nodes.forEach(d => {
        d.x = Math.max(d.r+5,Math.min(W-d.r-5,d.x));
        d.y = Math.max(d.r+5,Math.min(H-d.r-5,d.y));
      });
      cartNodesSel.attr("cx",d=>d.x).attr("cy",d=>d.y);
      cartSvg.selectAll("text")
        .filter(d=>d && d.country)
        .attr("x",d=>d.x)
        .attr("y",d=>d.y);
    });

  updateHighlights();
}

function showTooltip(event,d){
  const name = normalizeName(d.properties.name);
  const row = d.properties.row;
  tooltip.style("opacity",1).html(
    `<strong>${name}</strong><br>` +
    (row
      ? `GDP: ${moneyBillions(row.gdp)}<br>Rank: ${Number.isFinite(row.rank) ? row.rank : "n/a"}`
      : `GDP: No data in provided top-50 CSV`)
  );
  moveTooltip(event);
}

function moveTooltip(event){
  tooltip.style("left",(event.pageX+14)+"px").style("top",(event.pageY+14)+"px");
}

function hoverCountry(name,on){
  if (countryPaths){
    countryPaths
      .attr("stroke-width",d => normalizeName(d.properties.name)===name && on ? 2.5 : (selectedCountry===normalizeName(d.properties.name) ? 2.8 : 0.55))
      .attr("stroke",d => {
        const n = normalizeName(d.properties.name);
        if ((n===name && on) || n===selectedCountry) return "#111827";
        return "#fff";
      });
  }
  if (cartNodesSel){
    cartNodesSel
      .attr("stroke-width",d => d.country===name && on ? 3 : (d.country===selectedCountry ? 3.2 : 1.2))
      .attr("stroke",d => ((d.country===name && on)||d.country===selectedCountry) ? "#111827" : "#fff");
  }
}

function updateHighlights(){
  if (countryPaths){
    countryPaths
      .attr("stroke",d => normalizeName(d.properties.name)===selectedCountry ? "#111827" : "#fff")
      .attr("stroke-width",d => normalizeName(d.properties.name)===selectedCountry ? 2.8 : 0.55)
      .attr("opacity",d => !selectedCountry || normalizeName(d.properties.name)===selectedCountry ? 1 : 0.55);
  }
  if (cartNodesSel){
    cartNodesSel
      .attr("stroke",d => d.country===selectedCountry ? "#111827" : "#fff")
      .attr("stroke-width",d => d.country===selectedCountry ? 3.2 : 1.2)
      .attr("opacity",d => !selectedCountry || d.country===selectedCountry ? 0.95 : 0.28);
  }
}
})();
