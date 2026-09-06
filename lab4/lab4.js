d3.csv(
    "../data/lab4_topic_sentiment.csv",
    d => ({
        topic: d.topic,
        n: +d.n,
        average_sentiment_score:
            +d.average_sentiment_score,
        negative_share:
            +d.negative_share,
        neutral_share:
            +d.neutral_share,
        positive_share:
            +d.positive_share
    })
)
.then(data => {

    data.sort(
        (a, b) =>
            d3.ascending(
                a.average_sentiment_score,
                b.average_sentiment_score
            )
    );


    const totalTweets =
        d3.sum(
            data,
            d => d.n
        );


    d3.select("#record-count")
        .text(
            totalTweets.toLocaleString()
        );


    const margin = {
        top: 20,
        right: 40,
        bottom: 60,
        left: 210
    };

    const width = 1000;

    const rowHeight = 32;

    const height =
        margin.top
        + margin.bottom
        + (
            data.length
            * rowHeight
        );

    const innerWidth =
        width
        - margin.left
        - margin.right;

    const innerHeight =
        height
        - margin.top
        - margin.bottom;


    const maxAbs = Math.max(
        0.05,
        d3.max(
            data,
            d =>
                Math.abs(
                    d.average_sentiment_score
                )
        )
    );


    const x = d3
        .scaleLinear()
        .domain([
            -maxAbs * 1.1,
            maxAbs * 1.1
        ])
        .range([
            0,
            innerWidth
        ]);


    const y = d3
        .scaleBand()
        .domain(
            data.map(
                d => d.topic
            )
        )
        .range([
            0,
            innerHeight
        ])
        .padding(0.22);


    const svg = d3
        .select("#chart")
        .append("svg")
        .attr(
            "viewBox",
            `0 0 ${width} ${height}`
        );


    const g = svg
        .append("g")
        .attr(
            "transform",
            `translate(
                ${margin.left},
                ${margin.top}
            )`
        );


    g.append("g")
        .attr(
            "class",
            "axis"
        )
        .attr(
            "transform",
            `translate(
                0,
                ${innerHeight}
            )`
        )
        .call(
            d3.axisBottom(x)
                .ticks(7)
                .tickFormat(
                    d3.format(".2f")
                )
        );


    g.append("g")
        .attr(
            "class",
            "axis"
        )
        .call(
            d3.axisLeft(y)
        );


    // Zero reference line
    g.append("line")
        .attr(
            "class",
            "zero-line"
        )
        .attr(
            "x1",
            x(0)
        )
        .attr(
            "x2",
            x(0)
        )
        .attr(
            "y1",
            0
        )
        .attr(
            "y2",
            innerHeight
        );


    const tooltip =
        d3.select("#tooltip");


    g.selectAll(
        ".sentiment-bar"
    )
        .data(data)
        .join("rect")
        .attr(
            "class",
            "sentiment-bar"
        )
        .attr(
            "x",
            d =>
                Math.min(
                    x(0),
                    x(
                        d.average_sentiment_score
                    )
                )
        )
        .attr(
            "y",
            d => y(d.topic)
        )
        .attr(
            "width",
            d =>
                Math.abs(
                    x(
                        d.average_sentiment_score
                    )
                    - x(0)
                )
        )
        .attr(
            "height",
            y.bandwidth()
        )
        .classed(
            "positive",
            d =>
                d.average_sentiment_score
                >= 0
        )
        .classed(
            "negative",
            d =>
                d.average_sentiment_score
                < 0
        )
        .on(
            "mousemove",
            function(event, d) {

                tooltip
                    .style(
                        "opacity",
                        1
                    )
                    .style(
                        "left",
                        (
                            event.pageX + 14
                        ) + "px"
                    )
                    .style(
                        "top",
                        (
                            event.pageY + 14
                        ) + "px"
                    )
                    .html(
                        `
                        <strong>
                        ${d.topic}
                        </strong>
                        <br>
                        Tweets:
                        ${d.n.toLocaleString()}
                        <br>
                        Mean sentiment:
                        ${
                            d.average_sentiment_score
                            .toFixed(3)
                        }
                        <br>
                        Negative:
                        ${
                            (
                                d.negative_share
                                * 100
                            ).toFixed(1)
                        }%
                        <br>
                        Neutral:
                        ${
                            (
                                d.neutral_share
                                * 100
                            ).toFixed(1)
                        }%
                        <br>
                        Positive:
                        ${
                            (
                                d.positive_share
                                * 100
                            ).toFixed(1)
                        }%
                        `
                    );
            }
        )
        .on(
            "mouseleave",
            function() {

                tooltip
                    .style(
                        "opacity",
                        0
                    );
            }
        );


    g.append("text")
        .attr(
            "class",
            "axis-label"
        )
        .attr(
            "x",
            innerWidth / 2
        )
        .attr(
            "y",
            innerHeight + 48
        )
        .attr(
            "text-anchor",
            "middle"
        )
        .text(
            "Average Sentiment Score"
        );

})
.catch(error => {

    console.error(
        "Error loading Lab 4 data:",
        error
    );
});
