from pathlib import Path
from datetime import date
import json
import re

import fitz
import numpy as np
import pandas as pd
import umap

from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

PDF_FILE = DATA / "DKU_UG_Bulletin_2021-22.pdf"

RAW_FILE = DATA / "bulletin_passages_raw.csv"
CLEAN_FILE = DATA / "bulletin_passages.csv"
MAP_FILE = DATA / "lab8_embedding_map.csv"
MATRIX_FILE = DATA / "lab8_topic_section_matrix.csv"
SECTION_FILE = DATA / "lab8_section_summary.csv"
TERMS_FILE = DATA / "lab8_top_terms.csv"
STATS_FILE = DATA / "lab8_corpus_stats.json"
FINDINGS_FILE = DATA / "lab8_findings.json"

N_CLUSTERS = 8


def normalize_text(text):
    text = text.replace("\u00ad", "")
    text = re.sub(r"-\s*\n\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def likely_heading(text, size, body_size, bold):
    words = text.split()

    if not text:
        return 0

    if len(words) > 18 or len(text) > 150:
        return 0

    if text.endswith((".", ";", "?", "!")):
        return 0

    upper_ratio = sum(c.isupper() for c in text if c.isalpha()) / max(
        1, sum(c.isalpha() for c in text)
    )

    if size >= body_size + 4:
        return 1

    if size >= body_size + 2:
        return 2

    if size >= body_size + 1 and bold:
        return 3

    if upper_ratio > 0.75 and len(words) <= 10:
        return 2

    return 0


def split_long_passage(text, max_words=260):
    words = text.split()

    if len(words) <= max_words:
        return [text]

    chunks = []

    for i in range(0, len(words), max_words):
        chunk = " ".join(words[i:i + max_words]).strip()

        if len(chunk.split()) >= 20:
            chunks.append(chunk)

    return chunks


def extract_pdf():
    print("\n=== STEP 1: Extract PDF ===")

    if not PDF_FILE.exists():
        raise FileNotFoundError(
            f"PDF not found: {PDF_FILE}"
        )

    doc = fitz.open(PDF_FILE)

    all_lines = []

    for page_num, page in enumerate(doc, start=1):
        page_dict = page.get_text("dict")

        for block in page_dict.get("blocks", []):
            if "lines" not in block:
                continue

            for line in block["lines"]:
                spans = line.get("spans", [])

                text = normalize_text(
                    " ".join(
                        span.get("text", "")
                        for span in spans
                    )
                )

                if not text:
                    continue

                sizes = [
                    span.get("size", 0)
                    for span in spans
                    if span.get("text", "").strip()
                ]

                fonts = [
                    span.get("font", "")
                    for span in spans
                ]

                all_lines.append({
                    "page": page_num,
                    "text": text,
                    "size": max(sizes) if sizes else 0,
                    "bold": any(
                        "bold" in f.lower()
                        for f in fonts
                    )
                })

    candidates = [
        x["size"]
        for x in all_lines
        if 8 <= len(x["text"].split()) <= 100
        and x["size"] > 0
    ]

    body_size = float(np.median(candidates))

    print("Estimated body font size:", round(body_size, 2))

    chapter = "Unclassified"
    section = "Unclassified"
    subsection = "Unclassified"

    passages = []
    pid = 1

    for item in all_lines:
        text = item["text"]

        # obvious noise
        if re.fullmatch(r"\d+", text):
            continue

        if len(text) <= 2:
            continue

        level = likely_heading(
            text,
            item["size"],
            body_size,
            item["bold"]
        )

        if level == 1:
            chapter = text
            section = "Unclassified"
            subsection = "Unclassified"
            continue

        elif level == 2:
            section = text
            subsection = "Unclassified"
            continue

        elif level == 3:
            subsection = text
            continue

        # meaningful passage threshold
        wc = len(text.split())

        if wc < 20:
            continue

        for chunk in split_long_passage(text):
            passages.append({
                "passage_id": f"p{pid:05d}",
                "chapter": chapter,
                "section": section,
                "subsection": subsection,
                "page": item["page"],
                "text": chunk
            })

            pid += 1

    raw = pd.DataFrame(passages)
    raw.to_csv(RAW_FILE, index=False)

    print("Raw passages:", len(raw))

    return raw


def clean_corpus(raw):
    print("\n=== STEP 2: Clean corpus ===")

    df = raw.copy()

    df = df.dropna(subset=["text"])

    df["text"] = (
        df["text"]
        .astype(str)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )

    df = df[
        df["text"].str.split().str.len() >= 20
    ].copy()

    # Remove exact duplicated passages.
    df = df.drop_duplicates(
        subset=["text"]
    ).copy()

    # Some very common short PDF header/footer lines can repeat.
    counts = df["text"].value_counts()

    repeated_noise = set(
        counts[
            (counts >= 5)
            & (counts.index.str.split().str.len() <= 15)
        ].index
    )

    if repeated_noise:
        df = df[
            ~df["text"].isin(repeated_noise)
        ].copy()

    df["text_clean"] = df["text"]

    df["word_count"] = (
        df["text_clean"]
        .str.split()
        .str.len()
    )

    df = df.reset_index(drop=True)

    # Reassign stable IDs after cleaning.
    df["passage_id"] = [
        f"p{i+1:05d}"
        for i in range(len(df))
    ]

    df.to_csv(CLEAN_FILE, index=False)

    print("Clean passages:", len(df))
    print(
        "Average word count:",
        round(df["word_count"].mean(), 2)
    )

    return df


def cluster_labels(df, embeddings, clusters):
    print("\n=== STEP 3: Interpret clusters with TF-IDF ===")

    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_features=5000,
        ngram_range=(1, 2),
        min_df=2
    )

    matrix = vectorizer.fit_transform(
        df["text_clean"]
    )

    terms = np.array(
        vectorizer.get_feature_names_out()
    )

    labels = {}
    term_rows = []

    for c in sorted(np.unique(clusters)):
        indices = np.where(clusters == c)[0]

        cluster_scores = np.asarray(
            matrix[indices].mean(axis=0)
        ).ravel()

        top_idx = cluster_scores.argsort()[::-1][:8]

        top_terms = [
            terms[i]
            for i in top_idx
            if cluster_scores[i] > 0
        ]

        # Compact data-derived topic label.
        label_terms = []

        for term in top_terms:
            candidate = term.title()

            if candidate not in label_terms:
                label_terms.append(candidate)

            if len(label_terms) == 3:
                break

        label = " / ".join(label_terms)

        if not label:
            label = f"Topic {c + 1}"

        labels[c] = label

        print(f"\nCluster {c}: {label}")
        print("Top terms:", ", ".join(top_terms[:8]))

        subset = df.iloc[indices]

        for text in subset["text_clean"].head(3):
            print("-", text[:180])

        for rank, term in enumerate(top_terms[:10], start=1):
            term_rows.append({
                "cluster": c,
                "cluster_name": label,
                "rank": rank,
                "term": term
            })

    pd.DataFrame(term_rows).to_csv(
        TERMS_FILE,
        index=False
    )

    return labels


def semantic_pipeline(df):
    print("\n=== STEP 4: Sentence embeddings ===")
    print("First run may download the model.")

    model = SentenceTransformer(
        "all-MiniLM-L6-v2"
    )

    embeddings = model.encode(
        df["text_clean"].tolist(),
        normalize_embeddings=True,
        show_progress_bar=True
    )

    print("Embedding shape:", embeddings.shape)

    n_clusters = min(
        N_CLUSTERS,
        max(2, len(df) // 20)
    )

    print("\n=== STEP 5: KMeans ===")

    kmeans = KMeans(
        n_clusters=n_clusters,
        random_state=401,
        n_init=20
    )

    clusters = kmeans.fit_predict(
        embeddings
    )

    df["cluster"] = clusters

    labels = cluster_labels(
        df,
        embeddings,
        clusters
    )

    df["cluster_name"] = (
        df["cluster"].map(labels)
    )

    print("\n=== STEP 6: UMAP ===")

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=401
    )

    coords = reducer.fit_transform(
        embeddings
    )

    df["x"] = coords[:, 0]
    df["y"] = coords[:, 1]

    print("\n=== STEP 7: Semantic neighbors ===")

    k = min(6, len(df))

    nn = NearestNeighbors(
        n_neighbors=k,
        metric="cosine"
    )

    nn.fit(embeddings)

    distances, indices = nn.kneighbors(
        embeddings
    )

    neighbor_ids = []
    neighbor_scores = []

    for i in range(len(df)):
        ids = []
        scores = []

        for dist, idx in zip(
            distances[i][1:],
            indices[i][1:]
        ):
            ids.append(
                df.iloc[idx]["passage_id"]
            )

            scores.append(
                f"{1-dist:.4f}"
            )

        neighbor_ids.append(
            ";".join(ids)
        )

        neighbor_scores.append(
            ";".join(scores)
        )

    df["neighbor_ids"] = neighbor_ids
    df["neighbor_scores"] = neighbor_scores

    return df, embeddings


def create_summaries(df, embeddings):
    print("\n=== STEP 8: Export summaries ===")

    export_cols = [
        "passage_id",
        "chapter",
        "section",
        "subsection",
        "page",
        "text",
        "word_count",
        "cluster",
        "cluster_name",
        "x",
        "y",
        "neighbor_ids",
        "neighbor_scores"
    ]

    df[export_cols].to_csv(
        MAP_FILE,
        index=False
    )

    matrix_df = (
        df.groupby(
            ["section", "cluster_name"],
            dropna=False
        )
        .size()
        .reset_index(name="count")
    )

    matrix_df.to_csv(
        MATRIX_FILE,
        index=False
    )

    section_summary = (
        df.groupby("section")
        .agg(
            passage_count=("passage_id", "count"),
            average_word_count=("word_count", "mean"),
            topic_count=("cluster_name", "nunique")
        )
        .reset_index()
        .sort_values(
            "passage_count",
            ascending=False
        )
    )

    section_summary.to_csv(
        SECTION_FILE,
        index=False
    )

    stats = {
        "bulletin_title":
            "Duke Kunshan University Undergraduate Instruction Bulletin",
        "academic_year":
            "2021-2022",
        "source":
            "Official Duke Kunshan University bulletin PDF",
        "source_url":
            "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf",
        "date_accessed":
            str(date.today()),
        "raw_passages":
            int(len(pd.read_csv(RAW_FILE))),
        "clean_passages":
            int(len(df)),
        "average_passage_words":
            round(float(df["word_count"].mean()), 2),
        "formal_sections":
            int(df["section"].nunique()),
        "embedding_model":
            "sentence-transformers/all-MiniLM-L6-v2",
        "embedding_normalized":
            True,
        "projection":
            "UMAP",
        "umap_n_neighbors":
            15,
        "umap_min_dist":
            0.15,
        "umap_metric":
            "cosine",
        "umap_random_state":
            401,
        "clustering":
            "KMeans",
        "n_clusters":
            int(df["cluster"].nunique()),
        "cluster_random_state":
            401
    }

    with open(
        STATS_FILE,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            stats,
            f,
            indent=2
        )

    create_findings(
        df,
        embeddings
    )


def create_findings(df, embeddings):
    topic_counts = (
        df["cluster_name"]
        .value_counts()
    )

    major_topics = [
        {
            "topic": topic,
            "count": int(count)
        }
        for topic, count
        in topic_counts.head(4).items()
    ]

    cross_sections = (
        df.groupby("cluster_name")["section"]
        .nunique()
        .sort_values(ascending=False)
    )

    broad_topic = {
        "topic": cross_sections.index[0],
        "section_count": int(
            cross_sections.iloc[0]
        )
    }

    diversity = (
        df.groupby("section")["cluster_name"]
        .nunique()
        .sort_values(ascending=False)
    )

    diverse_section = {
        "section": diversity.index[0],
        "topic_count": int(
            diversity.iloc[0]
        )
    }

    # Find strongest nearest-neighbor pair
    # from different formal sections.
    nn = NearestNeighbors(
        n_neighbors=min(15, len(df)),
        metric="cosine"
    )
    nn.fit(embeddings)

    distances, indices = nn.kneighbors(
        embeddings
    )

    best = None

    for i in range(len(df)):
        for dist, j in zip(
            distances[i][1:],
            indices[i][1:]
        ):
            if (
                df.iloc[i]["section"]
                != df.iloc[j]["section"]
            ):
                score = 1 - dist

                if (
                    best is None
                    or score > best["similarity"]
                ):
                    best = {
                        "similarity":
                            float(score),
                        "a_id":
                            df.iloc[i]["passage_id"],
                        "a_section":
                            df.iloc[i]["section"],
                        "a_text":
                            df.iloc[i]["text"][:350],
                        "b_id":
                            df.iloc[j]["passage_id"],
                        "b_section":
                            df.iloc[j]["section"],
                        "b_text":
                            df.iloc[j]["text"][:350]
                    }

    findings = {
        "major_topics": major_topics,
        "broad_topic": broad_topic,
        "diverse_section": diverse_section,
        "cross_section_pair": best
    }

    with open(
        FINDINGS_FILE,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            findings,
            f,
            indent=2,
            ensure_ascii=False
        )


def main():
    DATA.mkdir(
        parents=True,
        exist_ok=True
    )

    raw = extract_pdf()
    df = clean_corpus(raw)

    if len(df) < 30:
        raise RuntimeError(
            "Too few passages extracted. "
            "Inspect PDF extraction before continuing."
        )

    df, embeddings = semantic_pipeline(
        df
    )

    create_summaries(
        df,
        embeddings
    )

    print("\n================================")
    print("LAB 8 DATA PREPARATION COMPLETE")
    print("================================")

    for path in [
        CLEAN_FILE,
        MAP_FILE,
        MATRIX_FILE,
        SECTION_FILE,
        TERMS_FILE,
        STATS_FILE,
        FINDINGS_FILE
    ]:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
