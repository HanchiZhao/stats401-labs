from pathlib import Path
import html
import re

import pandas as pd
from datasets import load_dataset
from transformers import pipeline


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

RAW_FILE = (
    DATA_DIR
    / "lab4_raw_tweets.csv"
)

CLEAN_FILE = (
    DATA_DIR
    / "lab4_clean_tweets.csv"
)

SUMMARY_FILE = (
    DATA_DIR
    / "lab4_topic_sentiment.csv"
)

RUN_SUMMARY_FILE = (
    DATA_DIR
    / "lab4_run_summary.txt"
)


TOPICS = {
    0: "Analyst Update",
    1: "Fed | Central Banks",
    2: "Company | Product News",
    3: "Treasuries | Corporate Debt",
    4: "Dividend",
    5: "Earnings",
    6: "Energy | Oil",
    7: "Financials",
    8: "Currencies",
    9: "General News | Opinion",
    10: "Gold | Metals | Materials",
    11: "IPO",
    12: "Legal | Regulation",
    13: "M&A | Investments",
    14: "Macro",
    15: "Markets",
    16: "Politics",
    17: "Personnel Change",
    18: "Stock Commentary",
    19: "Stock Movement",
}


def prepare_for_roberta(text):

    text = str(text)

    # Normalize Twitter usernames
    text = re.sub(
        r"@\w+",
        "@user",
        text,
    )

    # Normalize URLs
    text = re.sub(
        r"https?://\S+|www\.\S+",
        "http",
        text,
    )

    return text.strip()


def normalize_model_label(label):

    label = label.lower()

    aliases = {
        "label_0": "negative",
        "label_1": "neutral",
        "label_2": "positive",
    }

    return aliases.get(
        label,
        label,
    )


def scores_to_dict(scores):

    output = {}

    for item in scores:

        label = normalize_model_label(
            item["label"]
        )

        output[label] = item["score"]

    return output


def predicted_label(scores):

    return max(
        scores,
        key=scores.get,
    ).capitalize()


def main():

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )


    # --------------------------------
    # 1. Acquire raw tweet dataset
    # --------------------------------

    print(
        "Downloading Twitter Financial "
        "News Topic validation split..."
    )

    dataset = load_dataset(
        "zeroshot/twitter-financial-news-topic",
        split="validation",
    )

    raw_df = dataset.to_pandas()

    raw_df = raw_df[
        [
            "text",
            "label",
        ]
    ].copy()

    raw_df.insert(
        0,
        "tweet_id",
        range(
            1,
            len(raw_df) + 1,
        ),
    )

    raw_rows = len(raw_df)

    missing_text_before = (
        raw_df["text"]
        .isna()
        .sum()
    )

    duplicate_text_before = (
        raw_df
        .duplicated(
            subset=["text"]
        )
        .sum()
    )

    raw_df.to_csv(
        RAW_FILE,
        index=False,
    )


    print()
    print("=" * 60)
    print("RAW DATA QUALITY")
    print("=" * 60)

    print(
        "Raw rows:",
        raw_rows,
    )

    print(
        "Missing text:",
        missing_text_before,
    )

    print(
        "Duplicate text:",
        duplicate_text_before,
    )

    print()
    print(raw_df.info())


    # --------------------------------
    # 2. Clean structured data
    # --------------------------------

    df = raw_df.copy()

    df = df.dropna(
        subset=["text"]
    ).copy()


    df["tweet_text_raw"] = (
        df["text"]
        .astype(str)
    )


    # Decode HTML entities
    df["tweet_text_clean"] = (
        df["tweet_text_raw"]
        .apply(html.unescape)
    )


    # Standardize whitespace
    df["tweet_text_clean"] = (
        df["tweet_text_clean"]
        .str.replace(
            r"\s+",
            " ",
            regex=True,
        )
        .str.strip()
    )


    # Remove empty strings
    df = df[
        df["tweet_text_clean"] != ""
    ].copy()


    rows_before_duplicates = len(df)

    df = df.drop_duplicates(
        subset=["tweet_text_clean"],
        keep="first",
    ).copy()

    duplicates_removed = (
        rows_before_duplicates
        - len(df)
    )


    # Validate topic labels
    df["topic_id"] = pd.to_numeric(
        df["label"],
        errors="coerce",
    )

    invalid_labels = (
        df["topic_id"]
        .isna()
        .sum()
    )

    df = df.dropna(
        subset=["topic_id"]
    ).copy()

    df["topic_id"] = (
        df["topic_id"]
        .astype(int)
    )

    df = df[
        df["topic_id"]
        .between(
            0,
            19,
        )
    ].copy()

    df["topic"] = (
        df["topic_id"]
        .map(TOPICS)
    )


    print()
    print("=" * 60)
    print("AFTER CLEANING")
    print("=" * 60)

    print(
        "Rows:",
        len(df),
    )

    print(
        "Duplicates removed:",
        duplicates_removed,
    )

    print(
        "Invalid labels:",
        invalid_labels,
    )

    print(
        "Missing topics:",
        df["topic"]
        .isna()
        .sum(),
    )


    # --------------------------------
    # 3. Prepare sentiment input
    # --------------------------------

    df["sentiment_text"] = (
        df["tweet_text_raw"]
        .apply(
            prepare_for_roberta
        )
    )


    # --------------------------------
    # 4. Load RoBERTa
    # --------------------------------

    print()
    print(
        "Loading RoBERTa sentiment model..."
    )

    sentiment_model = pipeline(
        "sentiment-analysis",
        model=(
            "cardiffnlp/"
            "twitter-roberta-base-"
            "sentiment-latest"
        ),
        top_k=None,
    )


    # --------------------------------
    # 5. Analyze all tweets
    # --------------------------------

    texts = (
        df["sentiment_text"]
        .tolist()
    )

    results = []

    CHUNK_SIZE = 256

    print()
    print(
        "Starting sentiment analysis "
        f"for {len(texts)} tweets..."
    )


    for start in range(
        0,
        len(texts),
        CHUNK_SIZE,
    ):

        end = min(
            start + CHUNK_SIZE,
            len(texts),
        )

        chunk = texts[
            start:end
        ]

        chunk_results = sentiment_model(
            chunk,
            truncation=True,
            batch_size=16,
        )

        results.extend(
            chunk_results
        )

        print(
            f"Sentiment progress: "
            f"{end}/{len(texts)}"
        )


    if len(results) != len(df):

        raise RuntimeError(
            "Sentiment result count "
            "does not match tweet count."
        )


    # --------------------------------
    # 6. Extract probabilities
    # --------------------------------

    score_dicts = [
        scores_to_dict(scores)
        for scores in results
    ]


    df["sentiment_negative"] = [
        scores.get(
            "negative",
            0.0,
        )
        for scores in score_dicts
    ]


    df["sentiment_neutral"] = [
        scores.get(
            "neutral",
            0.0,
        )
        for scores in score_dicts
    ]


    df["sentiment_positive"] = [
        scores.get(
            "positive",
            0.0,
        )
        for scores in score_dicts
    ]


    df["sentiment"] = [
        predicted_label(scores)
        for scores in score_dicts
    ]


    # Official lab numeric definition
    df["sentiment_score"] = (
        df["sentiment_positive"]
        - df["sentiment_negative"]
    )


    # --------------------------------
    # 7. Tidy clean data
    # --------------------------------

    vis_df = df[
        [
            "tweet_id",
            "tweet_text_raw",
            "tweet_text_clean",
            "topic_id",
            "topic",
            "sentiment_negative",
            "sentiment_neutral",
            "sentiment_positive",
            "sentiment",
            "sentiment_score",
        ]
    ].copy()


    vis_df.to_csv(
        CLEAN_FILE,
        index=False,
    )


    # --------------------------------
    # 8. Aggregate for D3
    # --------------------------------

    topic_summary = (
        vis_df
        .groupby("topic")
        .agg(
            n=(
                "tweet_id",
                "size",
            ),
            average_sentiment_score=(
                "sentiment_score",
                "mean",
            ),
            mean_negative_probability=(
                "sentiment_negative",
                "mean",
            ),
            mean_neutral_probability=(
                "sentiment_neutral",
                "mean",
            ),
            mean_positive_probability=(
                "sentiment_positive",
                "mean",
            ),
        )
        .reset_index()
    )


    shares = pd.crosstab(
        vis_df["topic"],
        vis_df["sentiment"],
        normalize="index",
    )


    for column in [
        "Negative",
        "Neutral",
        "Positive",
    ]:

        if column not in shares.columns:
            shares[column] = 0.0


    shares = (
        shares[
            [
                "Negative",
                "Neutral",
                "Positive",
            ]
        ]
        .reset_index()
        .rename(
            columns={
                "Negative":
                    "negative_share",
                "Neutral":
                    "neutral_share",
                "Positive":
                    "positive_share",
            }
        )
    )


    topic_summary = (
        topic_summary
        .merge(
            shares,
            on="topic",
            how="left",
        )
        .sort_values(
            "average_sentiment_score"
        )
    )


    topic_summary.to_csv(
        SUMMARY_FILE,
        index=False,
    )


    # --------------------------------
    # 9. Final factual summary
    # --------------------------------

    clean_rows = len(vis_df)

    most_negative = (
        topic_summary.iloc[0]
    )

    most_positive = (
        topic_summary.iloc[-1]
    )

    sentiment_counts = (
        vis_df["sentiment"]
        .value_counts()
    )


    summary_text = f"""
LAB 4 RUN SUMMARY
=================

Raw rows: {raw_rows}
Missing text before cleaning: {missing_text_before}
Duplicate text before cleaning: {duplicate_text_before}
Duplicates removed: {duplicates_removed}
Invalid labels: {invalid_labels}
Clean rows: {clean_rows}

Sentiment counts:
{sentiment_counts.to_string()}

Sentiment score range:
{vis_df["sentiment_score"].min():.4f}
to
{vis_df["sentiment_score"].max():.4f}

Most negative topic:
{most_negative["topic"]}
Average score:
{most_negative["average_sentiment_score"]:.4f}

Most positive topic:
{most_positive["topic"]}
Average score:
{most_positive["average_sentiment_score"]:.4f}
""".strip()


    RUN_SUMMARY_FILE.write_text(
        summary_text,
        encoding="utf-8",
    )


    print()
    print("=" * 60)
    print("LAB 4 COMPLETE")
    print("=" * 60)
    print(summary_text)

    print()
    print("Saved raw data:")
    print(RAW_FILE)

    print()
    print("Saved cleaned data:")
    print(CLEAN_FILE)

    print()
    print("Saved D3 summary:")
    print(SUMMARY_FILE)

    print()
    print("Saved run summary:")
    print(RUN_SUMMARY_FILE)


if __name__ == "__main__":
    main()
