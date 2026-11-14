import os
import uuid
from datetime import date, datetime
from functools import wraps
from urllib.parse import quote, unquote, urlparse

from flask import Flask, abort, jsonify, render_template, request
from dotenv import load_dotenv
from firebase_config import get_firebase_web_config, initialize_firebase_admin, get_firebase_admin_app
from catalog import DESTINATIONS, SAMPLE_LISTINGS

load_dotenv()

class StorageConfigurationError(RuntimeError):
    pass

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-only-change-me")
    app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024 + 256 * 1024
    app.config["JSON_SORT_KEYS"] = False

    # Firebase Admin is optional during the first local UI setup.
    # It will initialize only when valid service-account credentials are supplied.
    initialize_firebase_admin()

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Content-Security-Policy", "object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        if request.is_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.get("/")
    def home():
        return render_template("index.html", firebase_config=get_firebase_web_config(), destinations=DESTINATIONS)

    @app.get("/auth")
    def auth():
        return render_template("auth.html", firebase_config=get_firebase_web_config())

    @app.get("/dashboard")
    def dashboard():
        return render_template("dashboard.html", firebase_config=get_firebase_web_config())

    @app.get("/destinations/<slug>")
    def destination_detail(slug):
        destination = next((item for item in DESTINATIONS if item["slug"] == slug), None)
        if destination is None:
            abort(404)
        return render_template("destination.html", destination=destination, firebase_config=get_firebase_web_config())

    @app.get("/listings/<listing_id>")
    def listing_detail(listing_id):
        listing = next((item for item in SAMPLE_LISTINGS if item["id"] == listing_id), None)
        if listing is None:
            admin_app = get_firebase_admin_app()
            if admin_app:
                from firebase_admin import firestore
                snapshot = firestore.client(app=admin_app).collection("listings").document(listing_id).get()
                if snapshot.exists and snapshot.to_dict().get("status") in {"published", "approved"}:
                    listing = _listing_dict(snapshot)
        if listing is None:
            abort(404)
        return render_template("listing_detail.html", listing=listing, firebase_config=get_firebase_web_config())

    @app.get("/api/listings")
    def list_listings():
        filters = {
            "location": request.args.get("location", "").strip().casefold(),
            "type": request.args.get("type", "").strip().casefold(),
        }
        listings = list(SAMPLE_LISTINGS)
        admin_app = get_firebase_admin_app()
        if admin_app:
            try:
                from firebase_admin import firestore
                docs = firestore.client(app=admin_app).collection("listings").where("status", "in", ["published", "approved"]).stream()
                listings.extend(_listing_dict(doc) for doc in docs)
            except Exception:
                app.logger.exception("Failed to load published Firestore listings")
                return jsonify({"error": "Listings are temporarily unavailable."}), 503
        filtered = [
            item for item in listings
            if (not filters["location"] or filters["location"] in item.get("location", "").casefold())
            and (not filters["type"] or filters["type"] == item.get("type", "").casefold())
        ]
        return jsonify({"listings": filtered})

    @app.get("/api/listings/<listing_id>")
    def get_listing(listing_id):
        if listing_id.startswith("sample-"):
            listing = next((item for item in SAMPLE_LISTINGS if item["id"] == listing_id), None)
            if listing:
                return jsonify({"listing": listing})
        admin_app = get_firebase_admin_app()
        if admin_app:
            from firebase_admin import firestore
            snapshot = firestore.client(app=admin_app).collection("listings").document(listing_id).get()
            if snapshot.exists and snapshot.to_dict().get("status") in {"published", "approved"}:
                return jsonify({"listing": _listing_dict(snapshot)})
        return jsonify({"error": "Listing not found."}), 404

    @app.get("/api/listings/<listing_id>/availability")
    def listing_availability(listing_id):
        check_in = _booking_date(request.args.get("checkIn"), "Check-in")
        check_out = _booking_date(request.args.get("checkOut"), "Check-out")
        if check_out <= check_in:
            return _error("Check-out must be after check-in.", 400)
        if listing_id.startswith("sample-"):
            return jsonify({"available": False, "reason": "Sample listings cannot be booked."})
        admin_app = get_firebase_admin_app()
        if not admin_app:
            return _error("Availability checks require Firebase Admin credentials.", 503)
        from firebase_admin import firestore
        db = firestore.client(app=admin_app)
        listing_snapshot = db.collection("listings").document(listing_id).get()
        if not listing_snapshot.exists or listing_snapshot.to_dict().get("status") not in {"published", "approved"}:
            return _error("This listing is not available.", 404)
        booked = db.collection("bookings").where("listingId", "==", listing_id).where("status", "==", "confirmed").stream()
        for booking_snapshot in booked:
            booking = booking_snapshot.to_dict()
            if _date_ranges_overlap(
                check_in.isoformat(), check_out.isoformat(),
                booking.get("checkIn", ""), booking.get("checkOut", ""),
            ):
                return jsonify({"available": False, "reason": "Those dates already have a confirmed booking."})
        return jsonify({"available": True})

    @app.get("/api/listings/mine")
    @owner_required
    def my_listings(user, db):
        docs = db.collection("listings").where("ownerId", "==", user["uid"]).stream()
        return jsonify({"listings": [_listing_dict(doc) for doc in docs]})

    @app.post("/api/listings")
    @owner_required
    def create_listing(user, db):
        data, images = _read_listing_form()
        listing_id = uuid.uuid4().hex
        uploaded_images = _save_listing_images(user["uid"], listing_id, images)
        payload = _listing_payload(data, user, uploaded_images)
        db.collection("listings").document(listing_id).set(payload)
        return jsonify({"listing": {"id": listing_id, **payload}}), 201

    @app.put("/api/listings/<listing_id>")
    @owner_required
    def update_listing(user, db, listing_id):
        ref = db.collection("listings").document(listing_id)
        snapshot = ref.get()
        if not snapshot.exists or snapshot.to_dict().get("ownerId") != user["uid"]:
            return jsonify({"error": "Listing not found."}), 404
        data, images = _read_listing_form()
        old_images = snapshot.to_dict().get("images", [])
        if not old_images and snapshot.to_dict().get("imageUrl"):
            old_images = [{
                "imageUrl": snapshot.to_dict()["imageUrl"],
                "storagePath": snapshot.to_dict().get("imagePath", ""),
            }]
        uploaded_images = _save_listing_images(user["uid"], listing_id, images) if images else old_images
        updates = _listing_payload(data, user, uploaded_images)
        ref.update(updates)
        if images:
            _delete_listing_images(user["uid"], old_images)
        return jsonify({"listing": {"id": listing_id, **updates}})

    @app.delete("/api/listings/<listing_id>")
    @owner_required
    def delete_listing(user, db, listing_id):
        ref = db.collection("listings").document(listing_id)
        snapshot = ref.get()
        if not snapshot.exists or snapshot.to_dict().get("ownerId") != user["uid"]:
            return jsonify({"error": "Listing not found."}), 404
        old_images = snapshot.to_dict().get("images", [])
        if not old_images and snapshot.to_dict().get("imageUrl"):
            old_images = [{
                "imageUrl": snapshot.to_dict()["imageUrl"],
                "storagePath": snapshot.to_dict().get("imagePath", ""),
            }]
        ref.delete()
        _delete_listing_images(user["uid"], old_images)
        return jsonify({"status": "deleted"})

    @app.post("/api/bookings")
    @role_required("tourist")
    def create_booking(user, db):
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return _error("Booking details must be sent as a JSON object.", 400)
        listing_id = str(data.get("listingId", "")).strip()
        if not listing_id or listing_id.startswith("sample-"):
            return _error("Bookings are available for live owner listings only.", 400)
        check_in = _booking_date(data.get("checkIn"), "Check-in")
        check_out = _booking_date(data.get("checkOut"), "Check-out")
        if check_out <= check_in:
            return _error("Check-out must be after check-in.", 400)
        if (check_out - check_in).days > 90:
            return _error("Bookings can be no longer than 90 nights.", 400)
        try:
            guests = int(data.get("guests", 1))
        except (TypeError, ValueError):
            return _error("Enter a valid guest count.", 400)
        if not 1 <= guests <= 30:
            return _error("Guest count must be between 1 and 30.", 400)
        note = str(data.get("note", "")).strip()
        if len(note) > 500:
            return _error("Your note must be 500 characters or fewer.", 400)
        from firebase_admin import firestore
        booking_ref = db.collection("bookings").document()
        listing_ref = db.collection("listings").document(listing_id)
        transaction = db.transaction()

        @firestore.transactional
        def reserve_booking(txn):
            listing_snapshot = txn.get(listing_ref)
            if not listing_snapshot.exists:
                raise LookupError("This listing is no longer available.")
            listing = listing_snapshot.to_dict()
            if listing.get("status") not in {"published", "approved"}:
                raise ValueError("This listing is not accepting booking requests.")
            if listing.get("ownerId") == user["uid"]:
                raise ValueError("You cannot book your own listing.")
            if guests > int(listing.get("maxGuests", 30)):
                raise ValueError("Guest count exceeds this listing's capacity.")
            booking_total = _booking_total(listing, guests, check_in, check_out)
            confirmed_query = (
                db.collection("bookings")
                .where("listingId", "==", listing_id)
                .where("status", "==", "confirmed")
            )
            for existing_snapshot in txn.get(confirmed_query):
                existing = existing_snapshot.to_dict()
                if _date_ranges_overlap(
                    check_in.isoformat(), check_out.isoformat(),
                    existing.get("checkIn", ""), existing.get("checkOut", ""),
                ):
                    raise ValueError("Those dates are already booked. Choose different dates.")
            booking = {
                "listingId": listing_id,
                "listingTitle": listing.get("title", ""),
                "listingLocation": listing.get("location", ""),
                "listingImageUrl": listing.get("imageUrl", ""),
                "price": float(listing.get("price", 0)),
                "priceUnit": listing.get("priceUnit", "person"),
                "totalAmount": booking_total,
                "touristId": user["uid"],
                "touristName": user["name"],
                "touristEmail": user["email"],
                "ownerId": listing["ownerId"],
                "ownerName": listing.get("ownerName", ""),
                "checkIn": check_in.isoformat(),
                "checkOut": check_out.isoformat(),
                "guests": guests,
                "note": note,
                "status": "pending",
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            txn.set(booking_ref, booking)
            txn.update(listing_ref, {"bookingVersion": firestore.Increment(1)})
            _create_notification(
                txn, db, listing["ownerId"], "booking_request",
                f"{user['name'] or 'A traveller'} requested {listing.get('title', 'your listing')}.",
                booking_ref.id,
            )
            return booking

        try:
            booking = reserve_booking(transaction)
        except LookupError as error:
            return _error(str(error), 404)
        except ValueError as error:
            return _error(str(error), 409)
        booking.pop("createdAt", None)
        return jsonify({"booking": {"id": booking_ref.id, **booking}}), 201

    @app.get("/api/bookings/mine")
    @role_required("tourist")
    def my_bookings(user, db):
        docs = db.collection("bookings").where("touristId", "==", user["uid"]).stream()
        bookings = [_booking_dict(doc) for doc in docs]
        bookings.sort(key=lambda item: item.get("checkIn", ""), reverse=True)
        return jsonify({"bookings": bookings})

    @app.get("/api/bookings/incoming")
    @role_required("owner")
    def incoming_bookings(user, db):
        docs = db.collection("bookings").where("ownerId", "==", user["uid"]).stream()
        bookings = [_booking_dict(doc) for doc in docs]
        bookings.sort(key=lambda item: item.get("checkIn", ""))
        return jsonify({"bookings": bookings})

    @app.patch("/api/bookings/<booking_id>")
    @role_required("tourist", "owner")
    def update_booking(user, db, booking_id):
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return _error("Booking action must be sent as a JSON object.", 400)
        new_status = data.get("status")
        if new_status not in {"confirmed", "rejected", "cancelled", "completed"}:
            return _error("Choose a valid booking action.", 400)
        ref = db.collection("bookings").document(booking_id)
        from firebase_admin import firestore
        transaction = db.transaction()

        @firestore.transactional
        def transition_booking(txn):
            snapshot = txn.get(ref)
            if not snapshot.exists:
                raise LookupError("Booking not found.")
            booking = snapshot.to_dict()
            old_status = booking.get("status")
            if user["role"] == "owner":
                if booking.get("ownerId") != user["uid"]:
                    raise PermissionError("You cannot change this booking.")
                if old_status == "pending" and new_status in {"confirmed", "rejected"}:
                    if new_status == "confirmed":
                        listing_ref = db.collection("listings").document(booking["listingId"])
                        listing_snapshot = txn.get(listing_ref)
                        if not listing_snapshot.exists or listing_snapshot.to_dict().get("status") not in {"published", "approved"}:
                            raise ValueError("This listing is not available for confirmation.")
                        conflict_query = (
                            db.collection("bookings")
                            .where("listingId", "==", booking["listingId"])
                            .where("status", "==", "confirmed")
                        )
                        for other_snapshot in txn.get(conflict_query):
                            if other_snapshot.id == booking_id:
                                continue
                            other = other_snapshot.to_dict()
                            if _date_ranges_overlap(
                                booking["checkIn"], booking["checkOut"],
                                other.get("checkIn", ""), other.get("checkOut", ""),
                            ):
                                raise ValueError("These dates overlap another confirmed booking.")
                        txn.update(listing_ref, {"bookingVersion": firestore.Increment(1)})
                elif old_status == "confirmed" and new_status == "completed":
                    if date.fromisoformat(booking["checkOut"]) > date.today():
                        raise ValueError("A booking can only be completed after its check-out date.")
                else:
                    raise ValueError("This booking can no longer be changed by the owner.")
                recipient_id = booking.get("touristId", "")
                message = f"Your booking for {booking.get('listingTitle', 'a listing')} is {new_status}."
            elif booking.get("touristId") == user["uid"] and new_status == "cancelled":
                if old_status not in {"pending", "confirmed"}:
                    raise ValueError("Only pending or confirmed bookings can be cancelled.")
                if _booking_date(booking["checkIn"], "Check-in") <= date.today():
                    raise ValueError("Bookings can only be cancelled before the check-in date.")
                recipient_id = booking.get("ownerId", "")
                message = f"A booking request for {booking.get('listingTitle', 'your listing')} was cancelled."
            else:
                raise PermissionError("You cannot change this booking.")
            txn.update(ref, {"status": new_status})
            _create_notification(txn, db, recipient_id, "booking_status", message, booking_id)
            booking["status"] = new_status
            return booking

        try:
            booking = transition_booking(transaction)
        except LookupError as error:
            return _error(str(error), 404)
        except PermissionError as error:
            return _error(str(error), 403)
        except ValueError as error:
            return _error(str(error), 409)
        return jsonify({"booking": {"id": booking_id, **booking}})

    @app.get("/api/listings/<listing_id>/reviews")
    def list_reviews(listing_id):
        admin_app = get_firebase_admin_app()
        if not admin_app:
            return jsonify({"reviews": []})
        from firebase_admin import firestore
        docs = (
            firestore.client(app=admin_app).collection("reviews")
            .where("listingId", "==", listing_id).stream()
        )
        reviews = [_review_dict(doc) for doc in docs]
        reviews.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
        return jsonify({"reviews": reviews})

    @app.post("/api/reviews")
    @role_required("tourist")
    def create_review(user, db):
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return _error("Review details must be sent as a JSON object.", 400)
        booking_id = str(data.get("bookingId", "")).strip()
        try:
            rating = int(data.get("rating", 0))
        except (TypeError, ValueError):
            return _error("Rating must be a whole number from 1 to 5.", 400)
        comment = str(data.get("comment", "")).strip()
        if not booking_id or len(comment) < 5 or len(comment) > 1000 or not 1 <= rating <= 5:
            return _error("Provide an eligible booking, a 1–5 rating, and a 5–1,000 character review.", 400)
        from firebase_admin import firestore
        review_ref = db.collection("reviews").document(booking_id)
        booking_ref = db.collection("bookings").document(booking_id)
        transaction = db.transaction()

        @firestore.transactional
        def write_review(txn):
            booking_snapshot = txn.get(booking_ref)
            if not booking_snapshot.exists:
                raise ValueError("Reviews are only available after a completed booking.")
            booking = booking_snapshot.to_dict()
            if booking.get("touristId") != user["uid"] or booking.get("status") != "completed":
                raise PermissionError("Reviews are only available for your completed bookings.")
            if txn.get(review_ref).exists:
                raise FileExistsError("You have already reviewed this booking.")
            review = {
                "bookingId": booking_id,
                "listingId": booking["listingId"],
                "listingTitle": booking.get("listingTitle", ""),
                "ownerId": booking.get("ownerId", ""),
                "touristId": user["uid"],
                "touristName": user["name"],
                "rating": rating,
                "comment": comment,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            txn.set(review_ref, review)
            _create_notification(
                txn, db, booking.get("ownerId", ""), "new_review",
                f"{user['name'] or 'A traveller'} left a review for {booking.get('listingTitle', 'your listing')}.",
                booking_id,
            )
            return review

        try:
            review = write_review(transaction)
        except PermissionError as error:
            return _error(str(error), 403)
        except FileExistsError as error:
            return _error(str(error), 409)
        except ValueError as error:
            return _error(str(error), 400)
        review.pop("createdAt", None)
        return jsonify({"review": {"id": booking_id, **review}}), 201

    @app.get("/api/reviews/mine")
    @role_required("owner")
    def owner_reviews(user, db):
        docs = db.collection("reviews").where("ownerId", "==", user["uid"]).stream()
        reviews = [_review_dict(doc) for doc in docs]
        reviews.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
        return jsonify({"reviews": reviews})

    @app.get("/api/wishlist")
    @role_required("tourist")
    def get_wishlist(user, db):
        docs = db.collection("wishlists").document(user["uid"]).collection("items").stream()
        return jsonify({"listingIds": [doc.id for doc in docs]})

    @app.put("/api/wishlist/<listing_id>")
    @role_required("tourist")
    def save_to_wishlist(user, db, listing_id):
        listing_snapshot = db.collection("listings").document(listing_id).get()
        if not listing_snapshot.exists or listing_snapshot.to_dict().get("status") not in {"published", "approved"}:
            return _error("Only live published listings can be saved to your account.", 404)
        from firebase_admin import firestore
        db.collection("wishlists").document(user["uid"]).collection("items").document(listing_id).set({
            "listingId": listing_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return jsonify({"status": "saved"})

    @app.delete("/api/wishlist/<listing_id>")
    @role_required("tourist")
    def remove_from_wishlist(user, db, listing_id):
        db.collection("wishlists").document(user["uid"]).collection("items").document(listing_id).delete()
        return jsonify({"status": "removed"})

    @app.get("/api/notifications")
    @role_required("tourist", "owner", "admin")
    def get_notifications(user, db):
        docs = db.collection("notifications").where("recipientId", "==", user["uid"]).stream()
        notifications = [_notification_dict(doc) for doc in docs]
        notifications.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
        return jsonify({"notifications": notifications[:50]})

    @app.patch("/api/notifications/<notification_id>")
    @role_required("tourist", "owner", "admin")
    def mark_notification_read(user, db, notification_id):
        ref = db.collection("notifications").document(notification_id)
        snapshot = ref.get()
        if not snapshot.exists or snapshot.to_dict().get("recipientId") != user["uid"]:
            return _error("Notification not found.", 404)
        ref.update({"read": True})
        return jsonify({"status": "read"})

    @app.get("/api/admin/summary")
    @role_required("admin")
    def admin_summary(_user, db):
        users = [doc.to_dict() for doc in db.collection("users").stream()]
        listings = [doc.to_dict() for doc in db.collection("listings").stream()]
        bookings = [doc.to_dict() for doc in db.collection("bookings").stream()]
        month_labels, user_growth = _monthly_counts(users)
        _, booking_activity = _monthly_counts(bookings)
        return jsonify({
            "users": len(users),
            "tourists": sum(item.get("role") == "tourist" for item in users),
            "owners": sum(item.get("role") == "owner" for item in users),
            "listings": len(listings),
            "pendingListings": sum(item.get("status") == "pending" for item in listings),
            "approvedListings": sum(item.get("status") in {"published", "approved"} for item in listings),
            "bookings": len(bookings),
            "confirmedBookings": sum(item.get("status") == "confirmed" for item in bookings),
            "cancelledBookings": sum(item.get("status") == "cancelled" for item in bookings),
            "demoConfirmedValue": round(sum(
                float(item.get("totalAmount", 0) or 0)
                for item in bookings if item.get("status") == "confirmed"
            ), 2),
            "destinations": len(DESTINATIONS),
            "monthLabels": month_labels,
            "userGrowth": user_growth,
            "bookingActivity": booking_activity,
            "listingCategories": {
                kind: sum(item.get("type") == kind for item in listings)
                for kind in ("Homestay", "Tour guide", "Cultural experience")
            },
        })

    @app.get("/api/admin/listings")
    @role_required("admin")
    def admin_listings(_user, db):
        status_filter = request.args.get("status", "pending")
        if status_filter not in {"pending", "published", "approved", "rejected", "suspended"}:
            return _error("Invalid listing status filter.", 400)
        docs = db.collection("listings").where("status", "==", status_filter).stream()
        return jsonify({"listings": [_listing_dict(doc) for doc in docs]})

    @app.patch("/api/admin/listings/<listing_id>")
    @role_required("admin")
    def admin_update_listing(_user, db, listing_id):
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict) or data.get("status") not in {"published", "rejected", "suspended"}:
            return _error("Choose approved, rejected, or suspended.", 400)
        ref = db.collection("listings").document(listing_id)
        snapshot = ref.get()
        if not snapshot.exists:
            return _error("Listing not found.", 404)
        status_value = data["status"]
        ref.update({
            "status": status_value,
            "verified": status_value == "published",
        })
        listing = snapshot.to_dict()
        _store_notification(
            db, listing.get("ownerId", ""), "listing_review",
            f"Your listing “{listing.get('title', 'listing')}” was {status_value}.",
            listing_id,
        )
        return jsonify({"status": status_value})

    @app.get("/api/admin/bookings")
    @role_required("admin")
    def admin_bookings(_user, db):
        docs = db.collection("bookings").stream()
        bookings = [_booking_dict(doc) for doc in docs]
        bookings.sort(key=lambda item: item.get("checkIn", ""), reverse=True)
        return jsonify({"bookings": bookings})

    @app.patch("/api/admin/bookings/<booking_id>")
    @role_required("admin")
    def admin_update_booking(_user, db, booking_id):
        data = request.get_json(silent=True) or {}
        status_value = data.get("status") if isinstance(data, dict) else None
        if status_value not in {"cancelled", "completed"}:
            return _error("Choose cancelled or completed.", 400)
        ref = db.collection("bookings").document(booking_id)
        snapshot = ref.get()
        if not snapshot.exists:
            return _error("Booking not found.", 404)
        booking = snapshot.to_dict()
        if status_value == "completed":
            try:
                check_out = date.fromisoformat(booking.get("checkOut", ""))
            except (TypeError, ValueError):
                return _error("Booking has an invalid check-out date.", 409)
            if booking.get("status") != "confirmed" or check_out > date.today():
                return _error("Only past confirmed bookings can be completed.", 409)
        ref.update({"status": status_value})
        _store_notification(db, booking.get("touristId", ""), "booking_status",
                            f"An administrator updated your booking to {status_value}.", booking_id)
        _store_notification(db, booking.get("ownerId", ""), "booking_status",
                            f"An administrator updated a booking to {status_value}.", booking_id)
        return jsonify({"status": status_value})

    @app.patch("/api/admin/users/<user_id>/status")
    @role_required("admin")
    def admin_update_user_status(user, db, user_id):
        data = request.get_json(silent=True) or {}
        active = data.get("active") if isinstance(data, dict) else None
        if not isinstance(active, bool):
            return _error("Active must be true or false.", 400)
        if user_id == user["uid"] and not active:
            return _error("You cannot suspend your own administrator account.", 400)
        ref = db.collection("users").document(user_id)
        if not ref.get().exists:
            return _error("User not found.", 404)
        ref.update({"active": active})
        return jsonify({"userId": user_id, "active": active})

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "smart-tourism-portal"})

    @app.errorhandler(404)
    def not_found(_error):
        return render_template("404.html", firebase_config=get_firebase_web_config()), 404

    @app.errorhandler(500)
    def server_error(_error):
        return render_template("500.html", firebase_config=get_firebase_web_config()), 500

    @app.errorhandler(ValueError)
    def invalid_listing(error):
        return _error(str(error), 400)

    @app.errorhandler(413)
    def request_too_large(_error):
        return _error("The request is too large. Each image must be 5 MB or smaller, with at most five images per listing.", 413)

    @app.errorhandler(StorageConfigurationError)
    def storage_not_configured(error):
        return _error(str(error), 503)

    return app

def _listing_dict(snapshot):
    return {"id": snapshot.id, **_normalize_firestore(snapshot.to_dict())}

def _booking_dict(snapshot):
    return {"id": snapshot.id, **_normalize_firestore(snapshot.to_dict())}

def _review_dict(snapshot):
    return {"id": snapshot.id, **_normalize_firestore(snapshot.to_dict())}

def _notification_dict(snapshot):
    return {"id": snapshot.id, **_normalize_firestore(snapshot.to_dict())}

def _normalize_firestore(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _normalize_firestore(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_firestore(item) for item in value]
    return value

def _create_notification(transaction, db, recipient_id, kind, message, resource_id):
    if not recipient_id:
        return
    from firebase_admin import firestore
    ref = db.collection("notifications").document()
    transaction.set(ref, {
        "recipientId": recipient_id,
        "type": kind,
        "message": message,
        "resourceId": resource_id,
        "read": False,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })

def _store_notification(db, recipient_id, kind, message, resource_id):
    if not recipient_id:
        return
    from firebase_admin import firestore
    db.collection("notifications").document().set({
        "recipientId": recipient_id,
        "type": kind,
        "message": message,
        "resourceId": resource_id,
        "read": False,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })

def _booking_total(listing, guests, check_in, check_out):
    try:
        price = float(listing.get("price", 0))
    except (TypeError, ValueError):
        raise ValueError("This listing has an invalid price.")
    if price < 0:
        raise ValueError("This listing has an invalid price.")
    if listing.get("priceUnit") == "night":
        quantity = (check_out - check_in).days
    else:
        quantity = guests
    return round(price * quantity, 2)

def _date_ranges_overlap(start_a, end_a, start_b, end_b):
    if not start_b or not end_b:
        return False
    return start_a < end_b and start_b < end_a

def _monthly_counts(documents):
    current = date.today().replace(day=1)
    months = []
    for offset in range(5, -1, -1):
        month_index = current.year * 12 + current.month - 1 - offset
        year, month = divmod(month_index, 12)
        months.append(date(year, month + 1, 1))
    counts = [0] * len(months)
    for document in documents:
        created_at = document.get("createdAt")
        if not isinstance(created_at, datetime):
            continue
        for index, month_start in enumerate(months):
            next_start = date(months[index + 1].year, months[index + 1].month, 1) if index + 1 < len(months) else date(current.year + (current.month == 12), current.month % 12 + 1, 1)
            if month_start <= created_at.date() < next_start:
                counts[index] += 1
                break
    labels = [month.strftime("%b %Y") for month in months]
    return labels, counts

def _booking_date(value, label):
    try:
        parsed = date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValueError(f"{label} date is required and must be valid.")
    if parsed < date.today():
        raise ValueError(f"{label} cannot be in the past.")
    return parsed

def _error(message, status):
    return jsonify({"error": message}), status

def owner_required(view):
    return role_required("owner")(view)

def role_required(*allowed_roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return _error("Sign in to continue.", 401)
            admin_app = get_firebase_admin_app()
            if not admin_app:
                return _error("This action requires Firebase Admin credentials in the server environment.", 503)
            try:
                from firebase_admin import auth as firebase_auth, firestore
                decoded = firebase_auth.verify_id_token(header[7:], app=admin_app)
                db = firestore.client(app=admin_app)
                profile = db.collection("users").document(decoded["uid"]).get()
                if not profile.exists:
                    return _error("Account profile not found.", 403)
                profile_data = profile.to_dict()
                role = profile_data.get("role")
                if role not in allowed_roles:
                    return _error("Your account is not permitted to perform this action.", 403)
                if profile_data.get("active") is False:
                    return _error("This account is suspended. Contact the platform administrator.", 403)
            except Exception:
                app.logger.exception("Firebase authorization failed")
                return _error("Authentication failed. Sign in again and retry.", 401)
            user = {
                "uid": decoded["uid"],
                "name": profile_data.get("name") or decoded.get("name", ""),
                "email": decoded.get("email", ""),
                "role": role,
            }
            return view(user, db, *args, **kwargs)
        return wrapped
    return decorator

def _read_listing_form():
    data = request.form if request.mimetype == "multipart/form-data" else request.get_json(silent=True) or {}
    if not hasattr(data, "get"):
        raise ValueError("Listing details must be sent as form data or a JSON object.")
    title = str(data.get("title", "")).strip()
    kind = str(data.get("type", "")).strip()
    location = str(data.get("location", "")).strip()
    description = str(data.get("description", "")).strip()
    price = data.get("price", "")
    if not title or len(title) > 100:
        raise ValueError("Title is required and must be 100 characters or fewer.")
    if kind not in {"Homestay", "Tour guide", "Cultural experience"}:
        raise ValueError("Choose a valid listing category.")
    if not location or len(location) > 80:
        raise ValueError("Location is required and must be 80 characters or fewer.")
    if not description or len(description) > 2000:
        raise ValueError("Description is required and must be 2,000 characters or fewer.")
    try:
        price = float(price)
    except (TypeError, ValueError):
        raise ValueError("Enter a valid price.")
    if not 0 <= price <= 10000000:
        raise ValueError("Price must be between 0 and 10,000,000.")
    images = [
        image for image in (request.files.getlist("images") or request.files.getlist("image"))
        if image and image.filename
    ]
    if len(images) > 5:
        raise ValueError("Upload no more than five images per listing.")
    valid_signatures = {
        "image/jpeg": lambda signature: signature.startswith(b"\xff\xd8\xff"),
        "image/png": lambda signature: signature.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": lambda signature: signature.startswith(b"RIFF") and signature[8:12] == b"WEBP",
    }
    for image in images:
        if image.mimetype not in valid_signatures:
            raise ValueError("Upload JPEG, PNG or WebP images.")
        image.stream.seek(0)
        content = image.stream.read(5 * 1024 * 1024 + 1)
        image.stream.seek(0)
        if len(content) > 5 * 1024 * 1024:
            raise ValueError("Each image must be 5 MB or smaller.")
        if not content or not valid_signatures[image.mimetype](content[:12]):
            raise ValueError("An uploaded file does not match its image type.")
    return {
        "title": title, "type": kind, "location": location, "description": description,
        "price": price, "priceUnit": "night" if kind == "Homestay" else "person",
    }, images

def _listing_payload(data, user, images):
    return {
        **data, "ownerId": user["uid"], "ownerName": user["name"],
        "imageUrl": images[0]["imageUrl"] if images else "",
        "imageUrls": [image["imageUrl"] for image in images],
        "imagePaths": [image["storagePath"] for image in images],
        "images": images,
        "status": "pending", "verified": False,
    }

def _save_listing_images(uid, listing_id, images):
    if not images:
        return []
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()
    if not bucket_name:
        raise StorageConfigurationError(
            "Image uploads require FIREBASE_STORAGE_BUCKET. Set it to the Firebase Storage bucket name, then restart Flask."
        )
    from firebase_admin import storage
    bucket = storage.bucket(bucket_name, app=get_firebase_admin_app())
    uploaded = []
    try:
        for image in images:
            content = image.read(5 * 1024 * 1024 + 1)
            if len(content) > 5 * 1024 * 1024:
                raise ValueError("Each image must be 5 MB or smaller.")
            if not content:
                raise ValueError("An uploaded image is empty.")
            extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[image.mimetype]
            storage_path = f"businesses/{uid}/{listing_id}/{uuid.uuid4().hex}.{extension}"
            blob = bucket.blob(storage_path)
            token = uuid.uuid4().hex
            blob.metadata = {"firebaseStorageDownloadTokens": token}
            blob.upload_from_string(content, content_type=image.mimetype)
            uploaded.append({
                "imageUrl": f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{quote(storage_path, safe='')}?alt=media&token={token}",
                "storagePath": storage_path,
            })
        return uploaded
    except Exception:
        _delete_listing_images(uid, uploaded)
        raise

def _delete_listing_images(uid, images):
    if not images:
        return
    from firebase_admin import storage
    bucket = storage.bucket(app=get_firebase_admin_app())
    for image in images:
        storage_path = image.get("storagePath", "") if isinstance(image, dict) else ""
        if not storage_path and isinstance(image, dict):
            image_url = image.get("imageUrl", "")
            parsed = urlparse(image_url)
            if parsed.hostname == "firebasestorage.googleapis.com":
                storage_path = unquote(parsed.path.rsplit("/o/", 1)[-1])
        if not storage_path.startswith(f"businesses/{uid}/"):
            continue
        try:
            bucket.blob(storage_path).delete()
        except Exception:
            app.logger.exception("Failed to remove listing image")

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
