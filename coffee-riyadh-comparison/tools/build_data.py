from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


SOURCE_DIR = Path(
    r"C:\Users\T\Desktop\Gogole_mao_scaper_final_025_06_2024\google\Final code fast 04_07_2024\Coffee_2026_03\Coffee_testing_2026\New folder\map\chatgpt"
)
OUT_DIR = Path(__file__).resolve().parents[1] / "data"

FILES = {
    "old": "Coffee_Riyadh_google_25_06_2024.csv",
    "current": "Coffee_Riyadh_04_05_2026.csv",
    "new": "Coffee_Riyadh_04_05_2026_new_items.csv",
    "deleted": "Coffee_Riyadh_04_05_2026_deleted_items.csv",
    "stable": "Coffee_Riyadh_04_05_2026_still_active.csv",
    "changed": "Coffee_Riyadh_04_05_2026_Changes.csv",
    "verify_failed": "Coffee_Riyadh_04_05_2026_verify_failed.csv",
}

FIELD_LABELS = {
    "restaurant_name": "الاسم",
    "Type": "التصنيف",
    "rate": "التقييم",
    "reviews_count": "عدد المراجعات",
    "Phone_number": "رقم الهاتف",
    "location": "العنوان الإنجليزي",
    "Ar_location": "العنوان العربي",
    "working_hours": "ساعات العمل",
    "restaurant_lat": "خط العرض",
    "restaurant_lng": "خط الطول",
    "restaurant_map_link": "رابط الخريطة",
    "place_id": "Google Place ID",
    "google_place_url": "رابط Google Places",
    "review_link": "رابط المراجعات",
    "photo_count": "عدد الصور",
    "main_photo_url": "الصورة الرئيسية",
    "owner_name": "اسم المالك",
    "owner_id": "معرف المالك",
    "is_claimed": "موثق/مطالب به",
    "claim_business_link": "رابط المطالبة",
    "order_online_link": "رابط الطلب",
    "category_code": "كود التصنيف",
    "district": "الحي",
    "city": "المدينة",
    "postal_code": "الرمز البريدي",
    "country": "الدولة",
    "timezone": "المنطقة الزمنية",
    "offerings": "الخدمات والميزات",
    "business_status": "حالة العمل",
    "open_now_text": "حالة الفتح الآن",
    "photo_date": "تاريخ الصورة",
    "business_added_date": "تاريخ إضافة النشاط",
}

IMPORTANT_FIELDS = [
    "restaurant_name",
    "Type",
    "rate",
    "reviews_count",
    "Phone_number",
    "location",
    "Ar_location",
    "working_hours",
    "business_status",
    "open_now_text",
    "district",
    "restaurant_lat",
    "restaurant_lng",
    "is_claimed",
    "photo_count",
    "owner_name",
    "order_online_link",
]

MISSING_VALUES = {"", "NA", "N/A", "nan", "NaN", "None", "null", "NULL"}


def read_csv(name: str) -> pd.DataFrame:
    return pd.read_csv(SOURCE_DIR / FILES[name], dtype=str, encoding="utf-8-sig")


def clean(value: Any) -> Any:
    if value is None:
        return None
    if pd.isna(value):
        return None
    text = str(value).strip()
    if text in MISSING_VALUES:
        return None
    return text


def num(value: Any) -> float | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def int_num(value: Any) -> int | None:
    value = num(value)
    if value is None:
        return None
    return int(value)


def pick(row: pd.Series, column: str) -> Any:
    if column not in row:
        return None
    return clean(row[column])


def record_from_row(row: pd.Series, status: str) -> dict[str, Any]:
    lat = num(pick(row, "restaurant_lat"))
    lng = num(pick(row, "restaurant_lng"))
    google_place_url = pick(row, "google_place_url")
    map_url = google_place_url or pick(row, "restaurant_map_link")
    return {
        "id": pick(row, "_id"),
        "status": status,
        "name": pick(row, "restaurant_name") or "بدون اسم",
        "type": pick(row, "Type") or "غير محدد",
        "district": pick(row, "district") or "غير محدد",
        "location": pick(row, "location") or pick(row, "Ar_location"),
        "arLocation": pick(row, "Ar_location"),
        "phone": pick(row, "Phone_number"),
        "rate": num(pick(row, "rate")),
        "reviews": int_num(pick(row, "reviews_count")),
        "lat": lat,
        "lng": lng,
        "mapUrl": map_url,
        "placeUrl": google_place_url,
        "photoCount": int_num(pick(row, "photo_count")),
        "claimed": pick(row, "is_claimed"),
        "businessStatus": pick(row, "business_status") or pick(row, "open_now_text"),
        "dateScraped": pick(row, "Date_Scraped"),
    }


def records(df: pd.DataFrame, status: str) -> list[dict[str, Any]]:
    return [record_from_row(row, status) for _, row in df.iterrows()]


def valid_count(df: pd.DataFrame, column: str) -> int:
    if column not in df.columns:
        return 0
    return int(df[column].map(clean).notna().sum())


def coverage(df: pd.DataFrame, column: str) -> dict[str, Any]:
    count = valid_count(df, column)
    total = len(df)
    return {"count": count, "pct": round((count / total * 100) if total else 0, 1)}


def top_values(df: pd.DataFrame, column: str, limit: int = 12) -> list[dict[str, Any]]:
    if column not in df.columns:
        return []
    series = df[column].map(clean).dropna()
    counts = series.value_counts().head(limit)
    return [{"label": str(k), "value": int(v)} for k, v in counts.items()]


def parse_changes(value: Any) -> list[list[Any]]:
    value = clean(value)
    if value is None:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def change_entry(raw: list[Any]) -> dict[str, Any] | None:
    if len(raw) < 3:
        return None
    kind, field, values = raw[0], raw[1], raw[2]
    if kind != "change" or not isinstance(values, list) or len(values) != 2:
        return None
    # The generated comparison stores [2026 value, 2024 value].
    after_2026 = clean(values[0])
    before_2024 = clean(values[1])
    return {
        "field": field,
        "label": FIELD_LABELS.get(field, field),
        "before": before_2024,
        "after": after_2026,
    }


def compact_change_text(changes: list[dict[str, Any]]) -> str:
    labels = [item["label"] for item in changes if item["field"] in IMPORTANT_FIELDS]
    if not labels:
        labels = [item["label"] for item in changes]
    return "، ".join(labels[:5])


def changed_records(
    changed_df: pd.DataFrame, old_df: pd.DataFrame, current_df: pd.DataFrame
) -> list[dict[str, Any]]:
    old_by_id = old_df.set_index("_id", drop=False)
    current_by_id = current_df.set_index("_id", drop=False)
    output = []
    for _, row in changed_df.iterrows():
        item_id = pick(row, "_id")
        old_row = old_by_id.loc[item_id] if item_id in old_by_id.index else pd.Series(dtype=str)
        current_row = (
            current_by_id.loc[item_id] if item_id in current_by_id.index else pd.Series(dtype=str)
        )
        parsed = [entry for raw in parse_changes(pick(row, "CHANGES")) if (entry := change_entry(raw))]
        important = [entry for entry in parsed if entry["field"] in IMPORTANT_FIELDS]
        base = record_from_row(current_row if len(current_row) else old_row, "changed")
        base.update(
            {
                "id": item_id,
                "name": pick(current_row, "restaurant_name")
                or pick(old_row, "restaurant_name")
                or pick(row, "restaurant_name")
                or "بدون اسم",
                "type2024": pick(old_row, "Type"),
                "type2026": pick(current_row, "Type"),
                "rate2024": num(pick(old_row, "rate")),
                "rate2026": num(pick(current_row, "rate")),
                "reviews2024": int_num(pick(old_row, "reviews_count")),
                "reviews2026": int_num(pick(current_row, "reviews_count")),
                "changeCount": len(parsed),
                "changeSummary": compact_change_text(parsed),
                "changes": (important or parsed)[:10],
            }
        )
        output.append(base)
    return output


def sorted_by(records_list: list[dict[str, Any]], key: str, limit: int = 15) -> list[dict[str, Any]]:
    return sorted(
        [item for item in records_list if item.get(key) is not None],
        key=lambda item: item.get(key) or 0,
        reverse=True,
    )[:limit]


def status_rollup(df: pd.DataFrame) -> list[dict[str, Any]]:
    if "business_status" not in df.columns:
        return []
    counts: Counter[str] = Counter()
    for value in df["business_status"].map(clean):
        if value is None:
            counts["بدون حالة"] += 1
        elif "24 hours" in value or "24 ساعة" in value:
            counts["مفتوح 24 ساعة"] += 1
        elif value.lower().startswith("open") or "Open" in value:
            counts["مفتوح/له ساعات معلنة"] += 1
        elif value.lower().startswith("closed") or "Closed" in value:
            counts["مغلق الآن/يفتح لاحقاً"] += 1
        else:
            counts["حالة أخرى"] += 1
    return [{"label": label, "value": value} for label, value in counts.most_common()]


def build() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    old_df = read_csv("old")
    current_df = read_csv("current")
    new_df = read_csv("new")
    deleted_df = read_csv("deleted")
    stable_df = read_csv("stable")
    changed_df = read_csv("changed")
    verify_failed_df = read_csv("verify_failed")

    new_records = records(new_df, "new")
    deleted_records = records(deleted_df, "deleted")
    stable_records = records(stable_df, "stable")
    changed_items = changed_records(changed_df, old_df, current_df)
    current_records = records(current_df, "current")

    change_counter: Counter[str] = Counter()
    for value in changed_df["CHANGES"]:
        for raw in parse_changes(value):
            entry = change_entry(raw)
            if entry:
                change_counter[entry["field"]] += 1

    summary = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceDir": str(SOURCE_DIR),
        "sourceFiles": FILES,
        "counts": {
            "oldTotal2024": len(old_df),
            "currentTotal2026": len(current_df),
            "newIn2026": len(new_df),
            "deletedSince2024": len(deleted_df),
            "changed": len(changed_df),
            "stable": len(stable_df),
            "verifyFailed": len(verify_failed_df),
            "netGrowth": len(current_df) - len(old_df),
            "growthPct": round((len(current_df) - len(old_df)) / len(old_df) * 100, 1),
        },
        "coverage": {
            "rate2024": coverage(old_df, "rate"),
            "rate2026": coverage(current_df, "rate"),
            "reviews2024": coverage(old_df, "reviews_count"),
            "reviews2026": coverage(current_df, "reviews_count"),
            "phone2024": coverage(old_df, "Phone_number"),
            "phone2026": coverage(current_df, "Phone_number"),
            "district2026": coverage(current_df, "district"),
            "businessStatus2026": coverage(current_df, "business_status"),
        },
        "topTypes2026": top_values(current_df, "Type", 12),
        "topTypes2024": top_values(old_df, "Type", 12),
        "topNewTypes": top_values(new_df, "Type", 12),
        "topDeletedTypes": top_values(deleted_df, "Type", 12),
        "topDistricts2026": top_values(current_df, "district", 14),
        "topNewDistricts": top_values(new_df, "district", 14),
        "claimed2026": top_values(current_df, "is_claimed", 5),
        "businessStatus2026": status_rollup(current_df),
        "changeFields": [
            {
                "field": field,
                "label": FIELD_LABELS.get(field, field),
                "value": int(count),
            }
            for field, count in change_counter.most_common(18)
        ],
        "highlights": {
            "topNewByReviews": sorted_by(new_records, "reviews", 12),
            "topDeletedByReviews": sorted_by(deleted_records, "reviews", 12),
            "topCurrentByPhotos": sorted_by(current_records, "photoCount", 12),
            "topChangedByReview2024": sorted_by(changed_items, "reviews2024", 12),
        },
        "notes": [
            "ملف 2026 يحتوي حقولاً إضافية غير موجودة في 2024 مثل الحي، المالك، المطالبة بالنشاط، الصور، وحالة العمل.",
            "تغطية التقييمات في ملف 2026 منخفضة جداً مقارنة بملف 2024؛ لذلك أي مقارنة تقييمات يجب قراءتها كجودة بيانات لا كهبوط حقيقي في السوق.",
            "اتجاه التغيير في ملف CHANGES هو: قيمة 2026 ثم قيمة 2024.",
        ],
    }

    payloads = {
        "summary.json": summary,
        "new_items.json": new_records,
        "deleted_items.json": deleted_records,
        "stable_items.json": stable_records,
        "changed_items.json": changed_items,
    }

    for filename, payload in payloads.items():
        with (OUT_DIR / filename).open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote dashboard data to {OUT_DIR}")


if __name__ == "__main__":
    build()
