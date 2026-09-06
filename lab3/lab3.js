const columns = [
    {
        key: "record_id",
        label: "ID",
        numeric: true
    },
    {
        key: "title",
        label: "Title",
        numeric: false
    },
    {
        key: "price_gbp",
        label: "Price (GBP)",
        numeric: true
    },
    {
        key: "star_rating",
        label: "Star Rating",
        numeric: true
    },
    {
        key: "availability",
        label: "Availability",
        numeric: false
    },
    {
        key: "page",
        label: "Source Page",
        numeric: true
    }
];


d3.csv(
    "../data/lab3_books.csv",
    d => ({
        record_id: +d.record_id,
        title: d.title,
        price_gbp: +d.price_gbp,
        star_rating: +d.star_rating,
        availability: d.availability,
        page: +d.page
    })
)
.then(data => {

    const table =
        d3.select("#data-table");

    const thead =
        table.append("thead");

    const tbody =
        table.append("tbody");

    let sortKey = null;
    let ascending = true;


    const headerCells = thead
        .append("tr")
        .selectAll("th")
        .data(columns)
        .join("th")
        .text(d => d.label)
        .on("click", function(event, column) {

            if (sortKey === column.key) {
                ascending = !ascending;
            } else {
                sortKey = column.key;
                ascending = true;
            }

            data.sort((a, b) => {

                let comparison;

                if (column.numeric) {

                    comparison =
                        d3.ascending(
                            a[column.key],
                            b[column.key]
                        );

                } else {

                    comparison =
                        d3.ascending(
                            String(
                                a[column.key]
                            ).toLowerCase(),
                            String(
                                b[column.key]
                            ).toLowerCase()
                        );
                }

                return ascending
                    ? comparison
                    : -comparison;
            });


            updateHeaders();
            updateRows();

            d3.select("#table-status")
                .text(
                    `${data.length.toLocaleString()} records · ` +
                    `sorted by ${column.label} ` +
                    `${ascending ? "ascending" : "descending"}`
                );
        });


    function updateHeaders() {

        headerCells
            .text(column => {

                if (
                    column.key !== sortKey
                ) {
                    return column.label;
                }

                return (
                    column.label
                    + (
                        ascending
                            ? " ▲"
                            : " ▼"
                    )
                );
            });
    }


    function formatValue(column, value) {

        if (column.key === "price_gbp") {
            return `£${value.toFixed(2)}`;
        }

        return value;
    }


    function updateRows() {

        const rows = tbody
            .selectAll("tr")
            .data(
                data,
                d => d.record_id
            )
            .join("tr");


        rows
            .selectAll("td")
            .data(row =>
                columns.map(column => ({
                    column: column,
                    value: row[column.key]
                }))
            )
            .join("td")
            .text(d =>
                formatValue(
                    d.column,
                    d.value
                )
            );
    }


    updateRows();

    d3.select("#table-status")
        .text(
            `${data.length.toLocaleString()} records`
        );

})
.catch(error => {

    console.error(
        "Error loading Lab 3 dataset:",
        error
    );

    d3.select("#table-status")
        .text(
            "Error loading dataset."
        );
});
