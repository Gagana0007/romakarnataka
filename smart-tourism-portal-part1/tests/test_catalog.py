from io import BytesIO

import pytest

import app as app_module
from catalog import DESTINATIONS, SAMPLE_LISTINGS


@pytest.fixture()
def client():
    app_module.app.config.update(TESTING=True)
    return app_module.app.test_client()


def test_homepage_and_health_are_available(client):
    assert client.get("/").status_code == 200
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json["status"] == "ok"


def test_all_karnataka_destination_pages_render(client):
    assert len(DESTINATIONS) == 10
    for destination in DESTINATIONS:
        response = client.get(f"/destinations/{destination['slug']}")
        assert response.status_code == 200
        assert destination["name"].encode() in response.data
        assert destination["state"] == "Karnataka"
        assert destination["imageUrls"]
        assert destination["location"]["latitude"]


def test_sample_listings_cover_required_categories():
    counts = {}
    for listing in SAMPLE_LISTINGS:
        counts[listing["type"]] = counts.get(listing["type"], 0) + 1
        assert listing["isSample"] is True
    assert counts == {
        "Homestay": 5,
        "Tour guide": 5,
        "Cultural experience": 5,
    }


def test_public_listing_api_filters_by_location_and_type(client):
    response = client.get("/api/listings?location=Coorg&type=Homestay")
    assert response.status_code == 200
    listings = response.json["listings"]
    assert listings
    assert all(item["location"] == "Coorg" and item["type"] == "Homestay" for item in listings)


def test_sample_listing_details_are_marked_as_samples(client):
    response = client.get("/listings/sample-coorg-homestay")
    assert response.status_code == 200
    assert b"SAMPLE LISTING" in response.data
    assert b"bookingPanel" not in response.data


@pytest.mark.parametrize(
    "path,method",
    [
        ("/api/listings", "post"),
        ("/api/listings/mine", "get"),
        ("/api/bookings", "post"),
        ("/api/bookings/mine", "get"),
        ("/api/bookings/incoming", "get"),
        ("/api/reviews", "post"),
        ("/api/wishlist", "get"),
        ("/api/notifications", "get"),
    ],
)
def test_private_endpoints_require_firebase_id_token(client, path, method):
    response = getattr(client, method)(path)
    assert response.status_code == 401


def test_booking_amount_is_computed_from_listing_price():
    listing = {"price": 2400, "priceUnit": "night"}
    assert app_module._booking_total(
        listing, 2, app_module.date(2030, 1, 1), app_module.date(2030, 1, 4)
    ) == 7200
    experience = {"price": 950, "priceUnit": "person"}
    assert app_module._booking_total(
        experience, 3, app_module.date(2030, 1, 1), app_module.date(2030, 1, 2)
    ) == 2850


def test_booking_date_overlap_is_exclusive_at_checkout():
    overlap = app_module._date_ranges_overlap
    assert overlap("2030-01-01", "2030-01-04", "2030-01-03", "2030-01-06")
    assert not overlap("2030-01-01", "2030-01-04", "2030-01-04", "2030-01-06")


def test_invalid_or_past_booking_dates_are_rejected():
    with pytest.raises(ValueError):
        app_module._booking_date("not-a-date", "Check-in")
    with pytest.raises(ValueError):
        app_module._booking_date("2000-01-01", "Check-in")


def test_listing_images_validate_mime_and_file_signature():
    valid_form = {
        "title": "Test stay",
        "type": "Homestay",
        "location": "Coorg",
        "description": "A test description long enough.",
        "price": "1200",
    }
    png = (BytesIO(b"\x89PNG\r\n\x1a\nvalid image bytes"), "room.png", "image/png")
    with app_module.app.test_request_context("/", method="POST", data={**valid_form, "images": png}):
        data, images = app_module._read_listing_form()
        assert data["priceUnit"] == "night"
        assert len(images) == 1
    fake_png = (BytesIO(b"not a png image"), "room.png", "image/png")
    with app_module.app.test_request_context("/", method="POST", data={**valid_form, "images": fake_png}):
        with pytest.raises(ValueError, match="does not match"):
            app_module._read_listing_form()


def test_admin_and_review_mutations_are_protected(client):
    assert client.get("/api/admin/summary").status_code == 401
    assert client.get("/api/admin/listings").status_code == 401
    assert client.patch("/api/admin/users/user-id/status", json={"active": False}).status_code == 401
    assert client.post("/api/reviews", json={"rating": 5}).status_code == 401
