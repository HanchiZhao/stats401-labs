const color = d3.scaleOrdinal()
  .domain(["Increase", "Unchanged", "Decrease"])
  .range(["#4daf4a", "#999999", "#e41a1c"]);

const tooltip = d3.select("#tooltip");

d3.json("../data/lab6_assignment_gdp.json")
  .then(data => {

    drawTreemap(
      data,
      "#treemap1",
      d3.treemapSquarify
    );

    drawTreemap(
      data,
      "#treemap2",
      d3.treemapSliceDice
    );

  });

function drawTreemap(data, selector, tileMethod) {

  const width = 1000;
  const height = 560;

  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(tileMethod)
    .size([width, height])
    .paddingInner(2)
    .paddingOuter(4)(root);

  const svg = d3.select(selector);

  const cells = svg
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr(
      "transform",
      d => `translate(${d.x0},${d.y0})`
    );

  cells.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => color(d.data.status))
    .attr("stroke", "white")
    .attr("stroke-width", 1);

  cells.append("text")
    .attr("x", 5)
    .attr("y", 16)
    .attr("font-size", 10)
    .attr("fill", "white")
    .text(d => d.data.name)
    .style(
      "display",
      d =>
        (d.x1 - d.x0) > 45 &&
        (d.y1 - d.y0) > 20
          ? null
          : "none"
    );

  cells
    .on("mouseover", function(event, d) {

      const area =
        d.parent?.data?.name || "N/A";

      const continent =
        d.parent?.parent?.data?.name || "N/A";

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.data.name}</strong><br>
          Continent: ${continent}<br>
          Area: ${area}<br>
          GDP: ${d.data.gdp.toLocaleString()} billion USD<br>
          Status: ${d.data.status}
        `);
    })

    .on("mousemove", function(event) {

      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })

    .on("mouseout", function() {

      tooltip.style("opacity", 0);
    });
}
