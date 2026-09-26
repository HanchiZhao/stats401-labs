const width = 1000;
const height = 650;

const svg = d3.select("#network");
const tooltip = d3.select("#tooltip");

let companies;
let transactions;

let currentDay = 1;
let timer = null;

const sectorColor =
  d3.scaleOrdinal(d3.schemeTableau10);

const typeColor =
  d3.scaleOrdinal(d3.schemeSet2);

Promise.all([

  d3.csv(
    "../data/lab7_assignment_companies.csv"
  ),

  d3.csv(
    "../data/lab7_assignment_transactions_60days.csv",
    d => ({
      date: d.date,
      day: +d.day,
      source: d.source,
      target: d.target,
      amount_usd: +d.amount_usd,
      transaction_type: d.transaction_type,
      transaction_count: +d.transaction_count
    })
  )

])
.then(([companyData, transactionData]) => {

  companies = companyData.map(d => ({...d}));

  transactions = transactionData;

  setupSimulation();

  showDay(1);
});


let simulation;

const linkGroup = svg.append("g");
const nodeGroup = svg.append("g");


function setupSimulation() {

  simulation = d3.forceSimulation(companies)

    .force(
      "link",
      d3.forceLink()
        .id(d => d.id)
        .distance(130)
    )

    .force(
      "charge",
      d3.forceManyBody()
        .strength(-350)
    )

    .force(
      "center",
      d3.forceCenter(
        width / 2,
        height / 2
      )
    )

    .force(
      "collision",
      d3.forceCollide(35)
    )

    .on("tick", ticked);
}


function calculateVolume(companyId, links) {

  return d3.sum(
    links.filter(d => {

      const s =
        typeof d.source === "object"
          ? d.source.id
          : d.source;

      const t =
        typeof d.target === "object"
          ? d.target.id
          : d.target;

      return s === companyId ||
             t === companyId;
    }),
    d => d.amount_usd
  );
}


function showDay(day) {

  currentDay = day;

  const rawLinks =
    transactions.filter(
      d => d.day === day
    );

  const currentLinks =
    rawLinks.map(d => ({...d}));


  const maxAmount =
    d3.max(
      currentLinks,
      d => d.amount_usd
    ) || 1;


  const linkWidth =
    d3.scaleSqrt()
      .domain([0, maxAmount])
      .range([1, 8]);


  const volumes =
    companies.map(
      d => calculateVolume(
        d.id,
        currentLinks
      )
    );


  const maxVolume =
    d3.max(volumes) || 1;


  const sizeScale =
    d3.scaleSqrt()
      .domain([0, maxVolume])
      .range([10, 28]);


  const link = linkGroup
    .selectAll("line")
    .data(
      currentLinks,
      d => `${d.source}-${d.target}`
    )
    .join(
      enter =>
        enter
          .append("line")
          .attr("opacity", 0)
          .attr(
            "stroke",
            d => typeColor(
              d.transaction_type
            )
          )
          .attr(
            "stroke-width",
            d => linkWidth(
              d.amount_usd
            )
          )
          .call(
            enter =>
              enter.transition()
                .duration(350)
                .attr("opacity", .7)
          ),

      update =>
        update
          .attr(
            "stroke",
            d => typeColor(
              d.transaction_type
            )
          )
          .attr(
            "stroke-width",
            d => linkWidth(
              d.amount_usd
            )
          ),

      exit =>
        exit.transition()
          .duration(350)
          .attr("opacity", 0)
          .remove()
    );


  const node = nodeGroup
    .selectAll("g.node")
    .data(
      companies,
      d => d.id
    )
    .join(
      enter => {

        const g =
          enter.append("g")
            .attr(
              "class",
              "node"
            );

        g.append("circle");

        g.append("text")
          .attr(
            "text-anchor",
            "middle"
          )
          .attr("dy", 4)
          .attr("font-size", 9)
          .attr(
            "pointer-events",
            "none"
          )
          .text(
            d => d.company_name
          );

        return g;
      }
    );


  node.select("circle")

    .attr(
      "r",
      d => sizeScale(
        calculateVolume(
          d.id,
          currentLinks
        )
      )
    )

    .attr(
      "fill",
      d => sectorColor(
        d.sector
      )
    )

    .attr(
      "stroke",
      "#222"
    )

    .attr(
      "stroke-width",
      2
    );


  node
    .on("mouseover", function(event, d) {

      const volume =
        calculateVolume(
          d.id,
          currentLinks
        );

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.company_name}</strong><br>
          Sector: ${d.sector}<br>
          Region: ${d.region}<br>
          Current transaction volume:
          $${volume.toLocaleString()}
        `);
    })

    .on("mousemove", function(event) {

      tooltip
        .style(
          "left",
          `${event.pageX + 12}px`
        )
        .style(
          "top",
          `${event.pageY + 12}px`
        );
    })

    .on("mouseout", function() {

      tooltip.style(
        "opacity",
        0
      );
    });


  simulation
    .force("link")
    .links(currentLinks);

  simulation
    .alpha(.3)
    .restart();


  const date =
    rawLinks.length
      ? rawLinks[0].date
      : `Day ${day}`;


  d3.select("#date-label")
    .text(
      `Day ${day} — ${date}`
    );


  d3.select("#time-slider")
    .property(
      "value",
      day
    );


  const activeCompanies =
    new Set(
      rawLinks.flatMap(
        d => [
          d.source,
          d.target
        ]
      )
    ).size;


  const totalValue =
    d3.sum(
      rawLinks,
      d => d.amount_usd
    );


  d3.select("#summary")
    .html(`
      <strong>Active companies:</strong>
      ${activeCompanies}
      &nbsp;&nbsp;

      <strong>Active links:</strong>
      ${rawLinks.length}
      &nbsp;&nbsp;

      <strong>Total value:</strong>
      $${totalValue.toLocaleString()}
    `);
}


function ticked() {

  linkGroup
    .selectAll("line")
    .attr(
      "x1",
      d => d.source.x
    )
    .attr(
      "y1",
      d => d.source.y
    )
    .attr(
      "x2",
      d => d.target.x
    )
    .attr(
      "y2",
      d => d.target.y
    );


  nodeGroup
    .selectAll("g.node")
    .attr(
      "transform",
      d =>
        `translate(${d.x},${d.y})`
    );
}


function play() {

  if (timer) return;

  timer = d3.interval(
    () => {

      currentDay += 1;

      if (currentDay > 60) {
        pause();
        return;
      }

      showDay(currentDay);

    },
    700
  );
}


function pause() {

  if (timer) {

    timer.stop();
    timer = null;

  }
}


function reset() {

  pause();

  currentDay = 1;

  showDay(1);
}


d3.select("#play")
  .on("click", play);

d3.select("#pause")
  .on("click", pause);

d3.select("#reset")
  .on("click", reset);

d3.select("#time-slider")
  .on("input", function() {

    pause();

    currentDay =
      +this.value;

    showDay(currentDay);
  });
