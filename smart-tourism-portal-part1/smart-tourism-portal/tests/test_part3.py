from app import create_app
from routes.businesses import validate_listing
from routes.destinations import SAMPLE_DESTINATIONS

def test_sample_destinations_contain_ten_karnataka_places():
    assert len(SAMPLE_DESTINATIONS) == 10
    assert all(item["state"] == "Karnataka" and item["isSample"] is True for item in SAMPLE_DESTINATIONS)

def test_listing_validation_accepts_valid_owner_payload():
    payload = {
        "businessName": "Western Ghats Homestay",
        "businessType": "homestay",
        "description": "A quiet family-run stay surrounded by coffee plantations.",
        "city": "Madikeri",
        "price": 2500,
        "imageUrls": ["https://example.com/stay.jpg"]
    }
    cleaned, error = validate_listing(payload)
    assert error is None
    assert cleaned["businessName"] == "Western Ghats Homestay"
    assert cleaned["verified"] is False

def test_listing_validation_rejects_invalid_image_url():
    payload = {
        "businessName": "Western Ghats Homestay",
        "businessType": "homestay",
        "description": "A quiet family-run stay surrounded by coffee plantations.",
        "city": "Madikeri",
        "price": 2500,
        "imageUrls": ["http://not-secure.example/image.jpg"]
    }
    cleaned, error = validate_listing(payload)
    assert cleaned is None
    assert "HTTPS" in error

def test_explore_route_renders():
    app = create_app()
    app.config.update(TESTING=True)
    response = app.test_client().get("/explore")
    assert response.status_code == 200
