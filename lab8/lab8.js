(() => {
"use strict";

const FILES = {
  map: "../data/lab8_embedding_map.csv",
  matrix: "../data/lab8_topic_section_matrix.csv",
  section: "../data/lab8_section_summary.csv",
  stats: "../data/lab8_corpus_stats.json",
  findings: "../data/lab8_findings.json"
};

const tooltip = d3.select("#tooltip");
const statusBanner = d3.select("#status-banner");

let mapData = [];
let matrixData = [];
let sectionData = [];
let statsData = {};
let findingsData = {};
let pointSelection = null;
let zoomBehavior = null;
let selectedPassageId = null;
let neighborIds = new Set();
let matrixSelection = null;

const topicColor = d3.scaleOrdinal(d3.schemeTableau10);

const mapSvg = d3.select("#semantic-map");
const mapWidth = 900;
const mapHeight = 620;
const mapMargin = { top: 28, right: 28, bottom: 28, left: 28 };
const zoomLayer = mapSvg.append("g").attr("class", "zoom-layer");

function showFatalError(error) {
  console.error(error);
  statusBanner
    .style("display", "block")
    .text(
      "LAB 8 FRONT-END ERROR\n" +
      String(error && error.stack ? error.stack : error) +
      "\n\nOpen Chrome DevTools (Command + Option + J) for details."
    );
}

function ensureD3() {
  if (typeof d3 === "undefined") {
    throw new Error("D3 did not load. Check internet access to the D3 CDN.");
  }
}

function parseMapRow(d) {
  return {
    ...d,
    page: Number(d.page),
    word_count: Number(d.word_count),
    cluster: Number(d.cluster),
    x: Number(d.x),
    y: Number(d.y)
  };
}

function parseMatrixRow(d) {
  return { ...d, count: Number(d.count) };
}

function parseSectionRow(d) {
  return {
    ...d,
    passage_count: Number(d.passage_count),
    average_word_count: Number(d.average_word_count),
    topic_count: Number(d.topic_count)
  };
}

function validateData() {
  const mapRequired = ["passage_id","chapter","section","subsection","page","text","word_count","cluster","cluster_name","x","y"];
  const matrixRequired = ["section","cluster_name","count"];
  const sectionRequired = ["section","passage_count","average_word_count","topic_count"];

  if (!mapData.length) throw new Error("lab8_embedding_map.csv has no rows.");
  if (!matrixData.length) throw new Error("lab8_topic_section_matrix.csv has no rows.");
  if (!sectionData.length) throw new Error("lab8_section_summary.csv has no rows.");

  for (const key of mapRequired) {
    if (!(key in mapData[0])) throw new Error("Missing map column: " + key);
  }
  for (const key of matrixRequired) {
    if (!(key in matrixData[0])) throw new Error("Missing matrix column: " + key);
  }
  for (const key of sectionRequired) {
    if (!(key in sectionData[0])) throw new Error("Missing section-summary column: " + key);
  }
}

async function loadAll() {
  ensureD3();

  const result = await Promise.all([
    d3.csv(FILES.map, parseMapRow),
    d3.csv(FILES.matrix, parseMatrixRow),
    d3.csv(FILES.section, parseSectionRow),
    d3.json(FILES.stats),
    d3.json(FILES.findings)
  ]);

  mapData = result[0];
  matrixData = result[1];
  sectionData = result[2];
  statsData = result[3];
  findingsData = result[4];

  validateData();

  const topics = Array.from(new Set(mapData.map(d => d.cluster_name))).filter(Boolean).sort(d3.ascending);
  topicColor.domain(topics);

  drawMetadata();
  drawSummaryCharts();
  setupControls();
  drawLegend(topics);
  drawSemanticMap();
  drawMatrix();
  drawFindings();

  console.log("LAB8_COMPLETE_VERIFIED loaded", {
    passages: mapData.length,
    sections: new Set(mapData.map(d => d.section)).size,
    topics: topics.length
  });
}

function drawMetadata() {
  d3.select("#source-info").html(
    "<p><strong>" + safe(statsData.bulletin_title || "DKU Undergraduate Instruction Bulletin") + "</strong><br>" +
    "Academic year: " + safe(statsData.academic_year || "Not recorded") + "<br>" +
    "Source: " + safe(statsData.source || "Not recorded") + "<br>" +
    "Date accessed: " + safe(statsData.date_accessed || "Not recorded") + "</p>"
  );

  d3.select("#raw-count").text(valueOrDash(statsData.raw_passages));
  d3.select("#clean-count").text(valueOrDash(statsData.clean_passages));
  d3.select("#avg-length").text(valueOrDash(statsData.average_passage_words));
  d3.select("#section-count").text(valueOrDash(statsData.formal_sections));
}

function valueOrDash(v) {
  return v === undefined || v === null || v === "" ? "–" : v;
}

function safe(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function drawSummaryCharts() {
  let usable = sectionData
    .filter(d => d.section && d.section !== "Unclassified")
    .sort((a, b) => b.passage_count - a.passage_count)
    .slice(0, 12);

  if (!usable.length) usable = sectionData.slice(0, 12);

  drawHorizontalBars(
    "#section-count-chart",
    usable,
    d => d.passage_count,
    d => "Passages: " + d.passage_count
  );

  const byLength = [...usable].sort((a, b) => b.average_word_count - a.average_word_count);
  drawHorizontalBars(
    "#section-length-chart",
    byLength,
    d => d.average_word_count,
    d => "Average words: " + d.average_word_count.toFixed(1)
  );
}

function drawHorizontalBars(selector, data, valueAccessor, tooltipAccessor) {
  const svg = d3.select(selector);
  svg.selectAll("*").remove();

  const width = 620;
  const height = 420;
  const m = { top: 12, right: 22, bottom: 34, left: 210 };

  const y = d3.scaleBand()
    .domain(data.map(d => d.section))
    .range([m.top, height - m.bottom])
    .padding(0.18);

  const maxVal = d3.max(data, valueAccessor) || 1;
  const x = d3.scaleLinear()
    .domain([0, maxVal])
    .nice()
    .range([m.left, width - m.right]);

  svg.append("g")
    .attr("transform", "translate(0," + (height - m.bottom) + ")")
    .call(d3.axisBottom(x).ticks(5));

  svg.append("g")
    .attr("transform", "translate(" + m.left + ",0)")
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("font-size", 10);

  svg.selectAll("rect.bar")
    .data(data)
    .join("rect")
    .attr("class", "bar")
    .attr("x", m.left)
    .attr("y", d => y(d.section))
    .attr("height", y.bandwidth())
    .attr("width", d => Math.max(0, x(valueAccessor(d)) - m.left))
    .attr("fill", "#607d8b")
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1)
        .html("<strong>" + safe(d.section) + "</strong><br>" + safe(tooltipAccessor(d)));
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);
}

function setupControls() {
  const sections = Array.from(new Set(mapData.map(d => d.section))).filter(Boolean).sort(d3.ascending);
  const topics = Array.from(new Set(mapData.map(d => d.cluster_name))).filter(Boolean).sort(d3.ascending);

  d3.select("#section-filter")
    .selectAll("option.extra")
    .data(sections)
    .join("option")
    .attr("class", "extra")
    .attr("value", d => d)
    .text(d => d);

  d3.select("#topic-filter")
    .selectAll("option.extra")
    .data(topics)
    .join("option")
    .attr("class", "extra")
    .attr("value", d => d)
    .text(d => d);

  d3.select("#search").on("input", updateHighlighting);
  d3.select("#section-filter").on("change", updateHighlighting);
  d3.select("#topic-filter").on("change", updateHighlighting);

  d3.select("#reset-map").on("click", () => {
    if (zoomBehavior) {
      mapSvg.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity);
    }
  });

  d3.select("#clear-selection").on("click", () => {
    selectedPassageId = null;
    neighborIds = new Set();
    matrixSelection = null;
    d3.select("#matrix").selectAll(".matrix-cell").classed("selected-cell", false);
    d3.select("#detail-panel").html(
      "<h3>Passage Details</h3><p>Click a passage to see its metadata, original text, and five nearest semantic neighbors.</p>"
    );
    updateHighlighting();
  });
}

function drawLegend(topics) {
  const legend = d3.select("#topic-legend");
  legend.selectAll("*").remove();

  const items = legend.selectAll(".legend-item")
    .data(topics)
    .join("div")
    .attr("class", "legend-item");

  items.append("span")
    .attr("class", "legend-dot")
    .style("background", d => topicColor(d));

  items.append("span").text(d => d);
}

function drawSemanticMap() {
  zoomLayer.selectAll("*").remove();

  const xExtent = d3.extent(mapData, d => d.x);
  const yExtent = d3.extent(mapData, d => d.y);

  if (!Number.isFinite(xExtent[0]) || !Number.isFinite(xExtent[1])) {
    throw new Error("Map x coordinates contain invalid values.");
  }
  if (!Number.isFinite(yExtent[0]) || !Number.isFinite(yExtent[1])) {
    throw new Error("Map y coordinates contain invalid values.");
  }

  const x = d3.scaleLinear()
    .domain(xExtent[0] === xExtent[1] ? [xExtent[0] - 1, xExtent[1] + 1] : xExtent)
    .nice()
    .range([mapMargin.left, mapWidth - mapMargin.right]);

  const y = d3.scaleLinear()
    .domain(yExtent[0] === yExtent[1] ? [yExtent[0] - 1, yExtent[1] + 1] : yExtent)
    .nice()
    .range([mapHeight - mapMargin.bottom, mapMargin.top]);

  const wcExtent = d3.extent(mapData, d => d.word_count);
  const radiusDomain = wcExtent[0] === wcExtent[1] ? [0, wcExtent[1] || 1] : wcExtent;

  const r = d3.scaleSqrt()
    .domain(radiusDomain)
    .range([3.2, 9]);

  pointSelection = zoomLayer.selectAll("circle.passage")
    .data(mapData, d => d.passage_id)
    .join("circle")
    .attr("class", "passage")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", d => r(d.word_count))
    .attr("fill", d => topicColor(d.cluster_name))
    .attr("fill-opacity", 0.82)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.8)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1).html(
        "<strong>" + safe(d.cluster_name) + "</strong><br>" +
        "Section: " + safe(d.section) + "<br>" +
        "Page: " + safe(d.page) + "<br>" +
        "Words: " + safe(d.word_count)
      );
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      event.stopPropagation();
      selectPassage(d);
    });

  zoomBehavior = d3.zoom()
    .scaleExtent([0.75, 12])
    .on("zoom", event => zoomLayer.attr("transform", event.transform));

  mapSvg.call(zoomBehavior);

  updateHighlighting();
}

function selectPassage(d) {
  selectedPassageId = d.passage_id;
  const ids = String(d.neighbor_ids || "").split(";").filter(Boolean);
  const scores = String(d.neighbor_scores || "").split(";");
  neighborIds = new Set(ids);

  const neighborHtml = ids.map((id, i) => {
    const n = mapData.find(row => row.passage_id === id);
    if (!n) return "";
    const similarity = scores[i] ? Number(scores[i]).toFixed(3) : "";
    return (
      '<div class="neighbor">' +
      "<strong>" + (i + 1) + ". " + safe(n.section) + "</strong><br>" +
      (similarity ? "Similarity: " + similarity + "<br>" : "") +
      safe(n.text.slice(0, 260)) + (n.text.length > 260 ? "..." : "") +
      "</div>"
    );
  }).join("");

  d3.select("#detail-panel").html(
    "<h3>" + safe(d.section) + "</h3>" +
    "<p>" +
    "<strong>Chapter:</strong> " + safe(d.chapter) + "<br>" +
    "<strong>Section:</strong> " + safe(d.section) + "<br>" +
    "<strong>Subsection:</strong> " + safe(d.subsection) + "<br>" +
    "<strong>Page:</strong> " + safe(d.page) + "<br>" +
    "<strong>Semantic topic:</strong> " + safe(d.cluster_name) + "<br>" +
    "<strong>Word count:</strong> " + safe(d.word_count) +
    "</p>" +
    "<h4>Original Passage</h4>" +
    "<p>" + safe(d.text) + "</p>" +
    "<h4>Five Nearest Semantic Neighbors</h4>" +
    (neighborHtml || "<p>No neighbor fields were available in the CSV.</p>")
  );

  updateHighlighting();
}

function pointMatches(d) {
  const query = String(d3.select("#search").property("value") || "").toLowerCase().trim();
  const section = d3.select("#section-filter").property("value");
  const topic = d3.select("#topic-filter").property("value");

  const searchOK = !query || String(d.text || "").toLowerCase().includes(query);
  const sectionOK = section === "ALL" || d.section === section;
  const topicOK = topic === "ALL" || d.cluster_name === topic;
  const matrixOK = !matrixSelection ||
    (d.section === matrixSelection.section && d.cluster_name === matrixSelection.topic);

  return searchOK && sectionOK && topicOK && matrixOK;
}

function updateHighlighting() {
  if (!pointSelection) return;

  pointSelection
    .attr("opacity", d => pointMatches(d) ? 0.98 : 0.055)
    .attr("stroke", d => {
      if (d.passage_id === selectedPassageId) return "#111";
      if (neighborIds.has(d.passage_id)) return "#333";
      return "#fff";
    })
    .attr("stroke-width", d => {
      if (d.passage_id === selectedPassageId) return 3;
      if (neighborIds.has(d.passage_id)) return 2;
      return 0.8;
    });
}

function drawMatrix() {
  const sections = Array.from(new Set(matrixData.map(d => d.section))).filter(Boolean).sort(d3.ascending);
  const topics = Array.from(new Set(matrixData.map(d => d.cluster_name))).filter(Boolean).sort(d3.ascending);

  const cell = 26;
  const m = { top: 190, right: 34, bottom: 28, left: 300 };
  const width = m.left + topics.length * cell + m.right;
  const height = m.top + sections.length * cell + m.bottom;

  const svg = d3.select("#matrix")
    .attr("width", width)
    .attr("height", height);

  svg.selectAll("*").remove();

  const x = d3.scaleBand().domain(topics).range([m.left, width - m.right]);
  const y = d3.scaleBand().domain(sections).range([m.top, height - m.bottom]);
  const maxCount = d3.max(matrixData, d => d.count) || 1;
  const intensity = d3.scaleSequential(d3.interpolateBlues).domain([0, maxCount]);

  svg.append("g")
    .attr("transform", "translate(0," + m.top + ")")
    .call(d3.axisTop(x))
    .selectAll("text")
    .attr("transform", "rotate(-55)")
    .style("text-anchor", "start")
    .attr("dx", 7)
    .attr("dy", -4);

  svg.append("g")
    .attr("transform", "translate(" + m.left + ",0)")
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("font-size", 10);

  svg.selectAll("rect.matrix-cell")
    .data(matrixData)
    .join("rect")
    .attr("class", "matrix-cell")
    .attr("x", d => x(d.cluster_name))
    .attr("y", d => y(d.section))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", d => intensity(d.count))
    .attr("stroke", "#fff")
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1).html(
        "<strong>" + safe(d.section) + "</strong><br>" +
        "Topic: " + safe(d.cluster_name) + "<br>" +
        "Passage count: " + safe(d.count)
      );
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", function(event, d) {
      matrixSelection = { section: d.section, topic: d.cluster_name };
      d3.select("#matrix").selectAll(".matrix-cell").classed("selected-cell", false);
      d3.select(this).classed("selected-cell", true);
      updateHighlighting();
      document.getElementById("semantic-map").scrollIntoView({ behavior: "smooth", block: "center" });
    });
}

function drawFindings() {
  const f = findingsData || {};
  const majors = Array.isArray(f.major_topics)
    ? f.major_topics.map(d => safe(d.topic) + " (" + safe(d.count) + " passages)").join(", ")
    : "Not available";

  let cross = "Not available.";
  if (f.cross_section_pair) {
    const p = f.cross_section_pair;
    const sim = Number(p.similarity);
    cross =
      "A high-similarity pair from different formal sections was found between <strong>" +
      safe(p.a_section) + "</strong> and <strong>" + safe(p.b_section) + "</strong>" +
      (Number.isFinite(sim) ? " (cosine similarity ≈ " + sim.toFixed(3) + ")." : ".");
  }

  d3.select("#findings").html(
    '<div class="finding"><strong>1. Major semantic topics</strong><br>' + majors + "</div>" +
    '<div class="finding"><strong>2. Topic spanning formal sections</strong><br><strong>' +
      safe(f.broad_topic && f.broad_topic.topic ? f.broad_topic.topic : "N/A") +
      "</strong> appears across " +
      safe(f.broad_topic && f.broad_topic.section_count != null ? f.broad_topic.section_count : "N/A") +
      " formal sections.</div>" +
    '<div class="finding"><strong>3. Most semantically diverse section</strong><br><strong>' +
      safe(f.diverse_section && f.diverse_section.section ? f.diverse_section.section : "N/A") +
      "</strong> contains passages assigned to " +
      safe(f.diverse_section && f.diverse_section.topic_count != null ? f.diverse_section.topic_count : "N/A") +
      " semantic topics.</div>" +
    '<div class="finding"><strong>4. Similar passages across formal boundaries</strong><br>' + cross + "</div>"
  );
}

function moveTooltip(event) {
  tooltip
    .style("left", (event.pageX + 14) + "px")
    .style("top", (event.pageY + 14) + "px");
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

loadAll().catch(showFatalError);
})();
