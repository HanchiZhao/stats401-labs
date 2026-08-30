// size

const width = 900;
const height = 560;

const margin = {
    top: 45,
    right: 190,
    bottom: 75,
    left: 120
};


// tooltip

const tooltip = d3.select("#tooltip");


// data

d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
}))
.then(data => {

    // svg

    const svg = d3.select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width)
        .attr("height", height);


    // scales

    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.temp_c))
        .nice()
        .range([
            margin.left,
            width - margin.right
        ]);

    const yScale = d3.scalePoint()
        .domain([
            "High",
            "Medium",
            "Low"
        ])
        .range([
            margin.top + 30,
            height - margin.bottom
        ])
        .padding(0.5);

    const populationScale = d3.scaleSqrt()
        .domain(d3.extent(data, d => d.population))
        .range([
            7,
            24
        ]);

    const regions = [
        "North",
        "South",
        "East",
        "West"
    ];

    const colorScale = d3.scaleOrdinal()
        .domain(regions)
        .range(d3.schemeTableau10);


    // axes

    svg.append("g")
        .attr("class", "axis")
        .attr(
            "transform",
            `translate(0, ${height - margin.bottom})`
        )
        .call(d3.axisBottom(xScale));

    svg.append("g")
        .attr("class", "axis")
        .attr(
            "transform",
            `translate(${margin.left}, 0)`
        )
        .call(d3.axisLeft(yScale));


    // axis labels

    svg.append("text")
        .attr("class", "axis-label")
        .attr(
            "x",
            (margin.left + width - margin.right) / 2
        )
        .attr(
            "y",
            height - 20
        )
        .attr("text-anchor", "middle")
        .text("Average Temperature (°C)");

    svg.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 28)
        .attr("text-anchor", "middle")
        .text("Development Level");


    // guides

    svg.selectAll(".guide")
        .data([
            "High",
            "Medium",
            "Low"
        ])
        .join("line")
        .attr("class", "guide")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", d => yScale(d))
        .attr("y2", d => yScale(d))
        .attr("stroke", "#ddd")
        .attr("stroke-dasharray", "4 4");


    // points

    svg.selectAll(".city-point")
        .data(data)
        .join("circle")
        .attr("class", "city-point")
        .attr(
            "cx",
            d => xScale(d.temp_c)
        )
        .attr(
            "cy",
            d => yScale(d.development_level)
        )
        .attr(
            "r",
            d => populationScale(d.population)
        )
        .attr(
            "fill",
            d => colorScale(d.region)
        )


        // tooltip

        .on("mouseover", function(event, d) {

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.city}</strong><br>
                    Population: ${d.population}M<br>
                    Temperature: ${d.temp_c}°C<br>
                    Development: ${d.development_level}<br>
                    Region: ${d.region}
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

            tooltip
                .style("opacity", 0);

        });


    // region legend

    const regionLegend = svg.append("g")
        .attr(
            "transform",
            `translate(${width - margin.right + 35}, 70)`
        );

    regionLegend.append("text")
        .attr("font-weight", "bold")
        .text("Region");

    const regionItems = regionLegend
        .selectAll(".region-item")
        .data(regions)
        .join("g")
        .attr("class", "region-item")
        .attr(
            "transform",
            (d, i) => `translate(0, ${30 + i * 28})`
        );

    regionItems.append("circle")
        .attr("r", 6)
        .attr("fill", d => colorScale(d));

    regionItems.append("text")
        .attr("x", 14)
        .attr("y", 4)
        .text(d => d);


    // population legend

    const populationLegend = svg.append("g")
        .attr(
            "transform",
            `translate(${width - margin.right + 35}, 240)`
        );

    populationLegend.append("text")
        .attr("font-weight", "bold")
        .text("Population");

    const populationValues = [
        0.5,
        1.5,
        3.0
    ];

    const populationItems = populationLegend
        .selectAll(".population-item")
        .data(populationValues)
        .join("g")
        .attr("class", "population-item")
        .attr(
            "transform",
            (d, i) => `translate(0, ${45 + i * 65})`
        );

    populationItems.append("circle")
        .attr("cx", 18)
        .attr("r", d => populationScale(d))
        .attr("fill", "none")
        .attr("stroke", "#777");

    populationItems.append("text")
        .attr("x", 55)
        .attr("y", 4)
        .text(d => `${d}M`);

})
.catch(error => {
    console.error(error);
});