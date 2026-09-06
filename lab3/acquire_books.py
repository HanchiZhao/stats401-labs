from pathlib import Path
from urllib.parse import urljoin
import time

import pandas as pd
import requests
from bs4 import BeautifulSoup


BASE_URL = "https://books.toscrape.com/catalogue/page-{}.html"

HEADERS = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}

MAX_PAGES = 50
REQUEST_DELAY = 1.0

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

CSV_FILE = DATA_DIR / "lab3_books.csv"
JSON_FILE = DATA_DIR / "lab3_books.json"


RATING_MAP = {
    "One": 1,
    "Two": 2,
    "Three": 3,
    "Four": 4,
    "Five": 5,
}


def download_page(session, url, page_number):
    """Download one page with basic retry/error handling."""

    for attempt in range(1, 4):

        try:
            response = session.get(
                url,
                timeout=15,
            )

            response.raise_for_status()

            return response.text

        except requests.RequestException as error:

            print(
                f"Page {page_number}: "
                f"attempt {attempt} failed:",
                error,
            )

            if attempt == 3:
                raise

            time.sleep(2)


def extract_rating(book):
    """Convert the star-rating CSS class to a number."""

    rating_element = book.select_one("p.star-rating")

    if rating_element is None:
        return None

    classes = rating_element.get("class", [])

    for word, value in RATING_MAP.items():

        if word in classes:
            return value

    return None


def main():

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    session = requests.Session()
    session.headers.update(HEADERS)

    records = []

    print("Starting Lab 3 web acquisition...")
    print()

    for page in range(1, MAX_PAGES + 1):

        url = BASE_URL.format(page)

        html = download_page(
            session,
            url,
            page,
        )

        soup = BeautifulSoup(
            html,
            "html.parser",
        )

        books = soup.select(
            "article.product_pod"
        )

        if not books:

            print(
                f"No books found on page {page}. "
                "Stopping."
            )

            break

        for book in books:

            title_element = book.select_one(
                "h3 a"
            )

            price_element = book.select_one(
                ".price_color"
            )

            availability_element = book.select_one(
                ".availability"
            )

            if (
                title_element is None
                or price_element is None
            ):
                continue

            title = title_element.get(
                "title",
                "",
            ).strip()

            price_text = (
                price_element
                .get_text(strip=True)
            )

            price_gbp = float(
                price_text
                .replace("£", "")
                .replace("Â", "")
            )

            star_rating = extract_rating(book)

            availability = (
                availability_element
                .get_text(
                    " ",
                    strip=True,
                )
                if availability_element
                else ""
            )

            product_url = urljoin(
                url,
                title_element.get(
                    "href",
                    "",
                ),
            )

            records.append({
                "record_id": len(records) + 1,
                "title": title,
                "price_gbp": price_gbp,
                "star_rating": star_rating,
                "availability": availability,
                "page": page,
                "product_url": product_url,
            })

        print(
            f"Downloaded page {page:02d} "
            f"| total records: {len(records)}"
        )

        if len(records) >= 1000:
            break

        # Basic rate limiting
        time.sleep(REQUEST_DELAY)


    if len(records) < 1000:
        raise RuntimeError(
            f"Only {len(records)} records were collected. "
            "At least 1,000 are required."
        )


    df = pd.DataFrame(
        records[:1000]
    )


    # Basic validation
    required_columns = {
        "record_id",
        "title",
        "price_gbp",
        "star_rating",
    }

    if not required_columns.issubset(
        df.columns
    ):
        raise RuntimeError(
            "Required columns are missing."
        )


    df.to_csv(
        CSV_FILE,
        index=False,
    )

    df.to_json(
        JSON_FILE,
        orient="records",
        indent=2,
    )


    print()
    print("=" * 60)
    print("LAB 3 ACQUISITION COMPLETE")
    print("=" * 60)

    print("Rows:", len(df))
    print("Columns:", df.columns.tolist())

    print()
    print("Missing values:")
    print(df.isna().sum())

    print()
    print("Price range:")
    print(
        df["price_gbp"].min(),
        "to",
        df["price_gbp"].max(),
    )

    print()
    print("Star ratings:")
    print(
        df["star_rating"]
        .value_counts()
        .sort_index()
    )

    print()
    print("Saved CSV:")
    print(CSV_FILE)

    print()
    print("Saved JSON:")
    print(JSON_FILE)

    print()
    print(df.head().to_string(index=False))


if __name__ == "__main__":
    main()
