
(() => {
"use strict";
const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");
const W = 980, H = 610;
const m = {top:30,right:30,bottom:70,left:82};
const plot = svg.append("g");
const color = d3.scaleOrdinal()
  .domain(["Africa","Americas","Asia","Europe","Oceania"])
  .range(["#D55E00","#0072B2","#009E73","#CC79A7","#E69F00"]);

let all = [], selectedCountry = null;

const x = d3.scaleLog().range([m.left, W-m.right]);
const y = d3.scaleLinear().range([H-m.bottom, m.top]);

d3.csv("data/gapminder_life_gdp.csv", d => ({
  country:d.country, continent:d.continent, year:+d.year,
  life_expectancy:+d.life_expectancy,
  population:+d.population,
  gdp_per_capita:+d.gdp_per_capita
})).then(data => {
  all = data.filter(d => d.gdp_per_capita > 0 && d.life_expectancy > 0);
  const years = Array.from(new Set(all.map(d=>d.year))).sort((a,b)=>a-b);
  d3.select("#year-slider")
    .attr("min", d3.min(years))
    .attr("max", d3.max(years))
    .attr("step", 5)
    .property("value", d3.max(years));
  d3.select("#year-label").text(d3.max(years));

  const continents = Array.from(new Set(all.map(d=>d.continent))).sort();
  d3.select("#continent-filter").selectAll("option.extra")
    .data(continents).join("option")
    .attr("class","extra").attr("value",d=>d).text(d=>d);

  const countries = Array.from(new Set(all.map(d=>d.country))).sort();
  d3.select("#country-list").selectAll("option").data(countries).join("option").attr("value",d=>d);

  color.domain(continents);
  drawLegend(continents);

  x.domain(d3.extent(all, d=>d.gdp_per_capita)).nice();
  y.domain([20, 90]);

  svg.append("g").attr("class","x-axis")
    .attr("transform",`translate(0,${H-m.bottom})`)
    .call(d3.axisBottom(x)
      .tickValues([300,500,1000,2000,5000,10000,20000,50000,100000].filter(v=>v>=x.domain()[0] && v<=x.domain()[1]))
      .tickFormat(d => "$" + (d>=1000 ? (d/1000)+"k" : d)));

  svg.append("g").attr("class","y-axis")
    .attr("transform",`translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(8));

  svg.append("text").attr("x",(m.left+W-m.right)/2).attr("y",H-18).attr("text-anchor","middle")
    .attr("font-weight",700).text("GDP per capita (logarithmic scale)");
  svg.append("text").attr("transform","rotate(-90)").attr("x",-H/2).attr("y",20)
    .attr("text-anchor","middle").attr("font-weight",700).text("Life expectancy at birth (years)");

  svg.append("g").attr("class","grid y-grid").attr("transform",`translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(W-m.left-m.right)).tickFormat(""))
    .selectAll("line").attr("stroke","#e9edf1");
  svg.select(".y-grid .domain").remove();

  d3.select("#year-slider").on("input", function(){
    d3.select("#year-label").text(this.value);
    update();
  });
  d3.select("#continent-filter").on("change", update);
  d3.select("#country-search").on("change", function(){
    const q = this.value.trim().toLowerCase();
    const found = all.find(d => d.country.toLowerCase()===q);
    if(found){
      selectedCountry = found.country;
      updateDetails(getRowForCurrentYear(selectedCountry));
      update();
    }
  });
  d3.select("#clear-selection").on("click", () => {
    selectedCountry = null;
    d3.select("#country-search").property("value","");
    d3.select("#details").html("<h3>Selected country</h3><p>Search for or click a country to keep its values visible here.</p>");
    update();
  });

  update();
}).catch(err=>{
  console.error(err);
  document.body.insertAdjacentHTML("afterbegin",`<div style="background:#ffdede;padding:12px;font-family:monospace">DATA LOAD ERROR: ${err}</div>`);
});

function currentYear(){
  return +d3.select("#year-slider").property("value");
}

function nearestAvailableYear(country, year){
  const rows = all.filter(d=>d.country===country).sort((a,b)=>Math.abs(a.year-year)-Math.abs(b.year-year));
  return rows[0] || null;
}

function getRowForCurrentYear(country){
  return nearestAvailableYear(country, currentYear());
}

function update(){
  const year = currentYear();
  const continent = d3.select("#continent-filter").property("value");
  const data = all.filter(d=>d.year===year);

  const circles = plot.selectAll("circle.country").data(data, d=>d.country);
  circles.join(
    enter => enter.append("circle")
      .attr("class","country")
      .attr("cx",d=>x(d.gdp_per_capita))
      .attr("cy",d=>y(d.life_expectancy))
      .attr("r",0)
      .attr("fill",d=>color(d.continent))
      .attr("stroke","#fff")
      .attr("stroke-width",1)
      .call(e=>e.transition().duration(300).attr("r",5)),
    update => update,
    exit => exit.call(e=>e.transition().duration(250).attr("r",0).remove())
  )
  .transition().duration(350)
  .attr("cx",d=>x(d.gdp_per_capita))
  .attr("cy",d=>y(d.life_expectancy))
  .attr("fill",d=>color(d.continent))
  .attr("r",d=>d.country===selectedCountry ? 8 : 5)
  .attr("stroke",d=>d.country===selectedCountry ? "#111" : "#fff")
  .attr("stroke-width",d=>d.country===selectedCountry ? 2.5 : 1)
  .attr("opacity",d => continent==="ALL" || d.continent===continent ? .88 : .08);

  plot.selectAll("circle.country")
    .on("mouseover",(event,d)=>{
      tooltip.style("opacity",1).html(
        `<strong>${esc(d.country)}</strong><br>
        Year: ${d.year}<br>
        GDP per capita: ${fmtMoney(d.gdp_per_capita)}<br>
        Life expectancy: ${d.life_expectancy.toFixed(1)} years<br>
        Population: ${d3.format(",")(d.population)}<br>
        Continent: ${esc(d.continent)}`
      );
    })
    .on("mousemove",event=>{
      tooltip.style("left",(event.pageX+12)+"px").style("top",(event.pageY+12)+"px");
    })
    .on("mouseout",()=>tooltip.style("opacity",0))
    .on("click",(event,d)=>{
      selectedCountry=d.country;
      d3.select("#country-search").property("value",d.country);
      updateDetails(d);
      update();
    });

  if(selectedCountry){
    const row = data.find(d=>d.country===selectedCountry);
    if(row) updateDetails(row);
  }
}

function updateDetails(d){
  if(!d) return;
  d3.select("#details").html(`
    <h3>${esc(d.country)}</h3>
    <p><strong>Year:</strong> ${d.year}<br>
    <strong>GDP per capita:</strong> ${fmtMoney(d.gdp_per_capita)}<br>
    <strong>Life expectancy:</strong> ${d.life_expectancy.toFixed(1)} years<br>
    <strong>Population:</strong> ${d3.format(",")(d.population)}<br>
    <strong>Continent:</strong> ${esc(d.continent)}</p>
    <p class="note">The point remains highlighted so you can compare it with nearby countries while keeping exact values visible.</p>
  `);
}

function drawLegend(continents){
  const item = d3.select("#continent-legend").selectAll(".legend-item")
    .data(continents).join("div").attr("class","legend-item");
  item.html("");
  item.append("span").attr("class","legend-dot").style("background",d=>color(d));
  item.append("span").text(d=>d);
}

function fmtMoney(v){
  return "$" + d3.format(",.0f")(v);
}
function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
})();
