// size

const width = 850;
const height = 470;

const margin = {
    top: 30,
    right: 30,
    bottom: 90,
    left: 30
};


// data

d3.csv("../data/students.csv", d => ({
    name: d.name,
    score: +d.score
}))
.then(data => {

    // svg

    const svg = d3.select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width)
        .attr("height", height);


    // scales

    const xScale = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([
            margin.left,
            width - margin.right
        ])
        .padding(0.25);

    const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([
            height - margin.bottom,
            margin.top
        ]);


    // bars

    svg.selectAll(".bar")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.name))
        .attr("y", d => yScale(d.score))
        .attr("width", xScale.bandwidth())
        .attr(
            "height",
            d => height - margin.bottom - yScale(d.score)
        );


    // scores

    svg.selectAll(".bar-score")
        .data(data)
        .join("text")
        .attr("class", "bar-score")
        .attr(
            "x",
            d => xScale(d.name) + xScale.bandwidth() / 2
        )
        .attr(
            "y",
            height - margin.bottom + 22
        )
        .text(d => d.score);


    // names

    svg.selectAll(".bar-name")
        .data(data)
        .join("text")
        .attr("class", "bar-name")
        .attr(
            "x",
            d => xScale(d.name) + xScale.bandwidth() / 2
        )
        .attr(
            "y",
            height - margin.bottom + 46
        )
        .text(d => d.name);

})
.catch(error => {
    console.error(error);
});