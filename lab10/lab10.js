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


const REGION_BY_COUNTRY = new Map([
["United States of America","Americas"],["China","Asia"],["Germany","Europe"],["Japan","Asia"],
["India","Asia"],["United Kingdom","Europe"],["France","Europe"],["Italy","Europe"],["Canada","Americas"],
["Brazil","Americas"],["Russia","Europe"],["South Korea","Asia"],["Australia","Oceania"],["Spain","Europe"],
["Mexico","Americas"],["Indonesia","Asia"],["Turkey","Asia"],["Netherlands","Europe"],["Saudi Arabia","Asia"],
["Switzerland","Europe"],["Poland","Europe"],["Taiwan","Asia"],["Belgium","Europe"],["Sweden","Europe"],
["Ireland","Europe"],["Argentina","Americas"],["Austria","Europe"],["Thailand","Asia"],["Israel","Asia"],
["United Arab Emirates","Asia"],["Singapore","Asia"],["Vietnam","Asia"],["Malaysia","Asia"],["Philippines","Asia"],
["Bangladesh","Asia"],["Denmark","Europe"],["South Africa","Africa"],["Colombia","Americas"],["Romania","Europe"],
["Pakistan","Asia"],["Chile","Americas"],["Czech Rep.","Europe"],["Finland","Europe"],["Portugal","Europe"],
["Peru","Americas"],["Kazakhstan","Asia"],["Iraq","Asia"],["Algeria","Africa"],["New Zealand","Oceania"],
["Greece","Europe"],["Egypt","Africa"],["Nigeria","Africa"],["Norway","Europe"]
]);

const tooltip = d3.select("#tooltip");
const svg = d3.select("#voice-map");
const W=1000,H=560;

let allFeatures=[];
let paths=null;
let selectedCountry=null;
let activeRegion="ALL";
let recognition=null;
let gdpRows=[];

Promise.all([
  d3.csv(DATA_URL,parseGDPRow),
  d3.json(WORLD_URL)
]).then(([gdpData,world])=>{
  gdpRows = gdpData.filter(d=>d.country && Number.isFinite(d.gdp) && d.gdp>0);
  allFeatures = topojson.feature(world,world.objects.countries).features;

  const gdpByName=new Map(gdpRows.map(d=>[d.country.toLowerCase(),d]));
  allFeatures.forEach(f=>{
    const name=normalizeName(f.properties.name);
    const row=gdpByName.get(name.toLowerCase());
    f.properties.row=row||null;
    f.properties.gdp=row?row.gdp:null;
    f.properties.region=REGION_BY_COUNTRY.get(name)||"Other";
  });

  drawMap();
  setupFallback();
  setupVoice();
}).catch(err=>{
  console.error(err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="padding:12px;background:#ffdede;font-family:monospace">Lab 10 error: ${err}</div>`);
});

function drawMap(){
  const projection=d3.geoNaturalEarth1().fitExtent([[20,20],[W-20,H-20]],{
    type:"FeatureCollection",features:allFeatures
  });
  const path=d3.geoPath(projection);
  const extent=d3.extent(gdpRows,d=>d.gdp);
  const color=d3.scaleSequentialLog(d3.interpolateBlues).domain(extent);

  d3.select("#legend-bar").style("background","linear-gradient(90deg,#eff6ff,#08306b)");
  d3.select("#legend-min").text(moneyBillions(extent[0]));
  d3.select("#legend-max").text(moneyBillions(extent[1]));

  const g=svg.append("g");

  paths=g.selectAll("path")
    .data(allFeatures)
    .join("path")
    .attr("class","country")
    .attr("d",path)
    .attr("fill",d=>d.properties.gdp==null?"#e5e7eb":color(d.properties.gdp))
    .attr("stroke","#fff")
    .attr("stroke-width",0.55)
    .on("mouseover",(event,d)=>{
      const name=normalizeName(d.properties.name);
      tooltip.style("opacity",1).html(
        `<strong>${name}</strong><br>`+
        (d.properties.row?`GDP: ${moneyBillions(d.properties.gdp)}`:"GDP: No top-50 data")
      );
      moveTooltip(event);
      d3.select(event.currentTarget).attr("stroke","#111827").attr("stroke-width",2.4);
    })
    .on("mousemove",moveTooltip)
    .on("mouseout",()=>{
      tooltip.style("opacity",0);
      updateMapState();
    })
    .on("click",(event,d)=>{
      highlightCountry(normalizeName(d.properties.name));
    });

  const zoom=d3.zoom().scaleExtent([1,8]).on("zoom",event=>g.attr("transform",event.transform));
  svg.call(zoom);
  updateMapState();
}

function setupFallback(){
  d3.select("#fallback-region").on("change",function(){
    filterRegion(this.value);
  });
  d3.select("#highlight-button").on("click",()=>{
    const name=d3.select("#fallback-country").property("value").trim();
    if(name) highlightCountry(name);
  });
  d3.select("#reset-button").on("click",resetVisualization);
}

function filterRegion(region){
  activeRegion=region;
  selectedCountry=null;
  updateMapState();
  setAction(region==="ALL"?"Showing all regions":`Showing ${region}`);
  d3.select("#fallback-region").property("value",region);
}

function findCanonicalCountry(input){
  const q=normalizeName(input).toLowerCase().trim();
  if(!q) return null;
  const exact=allFeatures.find(f=>normalizeName(f.properties.name).toLowerCase()===q);
  if(exact) return normalizeName(exact.properties.name);

  const starts=allFeatures.find(f=>normalizeName(f.properties.name).toLowerCase().startsWith(q));
  if(starts) return normalizeName(starts.properties.name);

  const contains=allFeatures.find(f=>normalizeName(f.properties.name).toLowerCase().includes(q));
  return contains?normalizeName(contains.properties.name):null;
}

function highlightCountry(input){
  const canonical=findCanonicalCountry(input);
  if(!canonical){
    setAction(`Country not found: ${input}`);
    return;
  }
  selectedCountry=canonical;
  activeRegion="ALL";
  d3.select("#fallback-region").property("value","ALL");
  d3.select("#fallback-country").property("value",canonical);
  updateMapState();
  setAction(`Highlighting ${canonical}`);
}

function resetVisualization(){
  activeRegion="ALL";
  selectedCountry=null;
  d3.select("#fallback-region").property("value","ALL");
  d3.select("#fallback-country").property("value","");
  updateMapState();
  setAction("Reset visualization");
}

function updateMapState(){
  if(!paths) return;
  paths
    .attr("opacity",d=>{
      const name=normalizeName(d.properties.name);
      if(selectedCountry) return name===selectedCountry?1:0.15;
      if(activeRegion==="ALL") return 1;
      return d.properties.region===activeRegion?1:0.12;
    })
    .attr("stroke",d=>normalizeName(d.properties.name)===selectedCountry?"#111827":"#fff")
    .attr("stroke-width",d=>normalizeName(d.properties.name)===selectedCountry?3:0.55);
}

function setupVoice(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

  if(!SpeechRecognition){
    d3.select("#voice-status").text("Speech recognition is not supported in this browser.");
    d3.select("#voice-button").property("disabled",true);
    setAction("Use the conventional fallback controls.");
    return;
  }

  recognition=new SpeechRecognition();
  recognition.lang="en-US";
  recognition.continuous=false;
  recognition.interimResults=false;

  d3.select("#voice-button").on("click",()=>{
    try{
      recognition.start();
      d3.select("#voice-status").text("Listening...");
    }catch(e){
      d3.select("#voice-status").text("Already listening or microphone unavailable.");
    }
  });

  d3.select("#stop-voice").on("click",()=>{
    try{ recognition.stop(); }catch(e){}
    d3.select("#voice-status").text("Stopped.");
  });

  recognition.onresult=event=>{
    const transcript=event.results[0][0].transcript.toLowerCase().trim();
    d3.select("#voice-status").text(`Heard: "${transcript}"`);
    handleVoiceCommand(transcript);
  };

  recognition.onerror=event=>{
    d3.select("#voice-status").text(`Voice error: ${event.error}`);
    setAction("Use a fallback control or try again.");
  };

  recognition.onend=()=>{
    const current=d3.select("#voice-status").text();
    if(current==="Listening...") d3.select("#voice-status").text("Ready.");
  };
}

function handleVoiceCommand(command){
  if(command.includes("reset")){
    resetVisualization();
    return;
  }

  const regions=[
    ["asia","Asia"],
    ["europe","Europe"],
    ["africa","Africa"],
    ["americas","Americas"],
    ["america","Americas"],
    ["oceania","Oceania"]
  ];

  for(const [spoken,region] of regions){
    if(command.includes(`show ${spoken}`) || command.includes(`filter ${spoken}`)){
      filterRegion(region);
      return;
    }
  }

  if(command.startsWith("highlight ")){
    const name=command.replace(/^highlight\s+/,"").trim();
    highlightCountry(name);
    return;
  }

  if(command.startsWith("select ")){
    const name=command.replace(/^select\s+/,"").trim();
    highlightCountry(name);
    return;
  }

  setAction(`Command not recognized: "${command}". Try "Show Asia", "Highlight Japan", or "Reset".`);
}

function setAction(text){
  d3.select("#voice-action").text(text);
}

function moveTooltip(event){
  tooltip.style("left",(event.pageX+14)+"px").style("top",(event.pageY+14)+"px");
}
})();
