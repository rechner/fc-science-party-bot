import asyncio
import os
from datetime import datetime

from quart import Quart, render_template, url_for, request, redirect, flash
from telethon import TelegramClient, errors, events, types
from telethon.tl.functions.users import GetFullUserRequest

import jwt

from wristband import render as render_wristband, decode_jwt

api_id = os.environ['TELEGRAM_API_ID']
api_hash = os.environ['TELEGRAM_API_HASH']

app = Quart(__name__)
app.secret_key = os.environ['QUART_SECRET_KEY']

"""
Can't look up users by phone number as a bot, so if the QR code has /+ in it, show an error to tell them to set a
user handle.
"""

client = TelegramClient('Science Party Bot', api_id, api_hash)

# Connect the client before we start serving with Quart
@app.before_serving
async def startup():
    await client.connect()

# After we're done serving (near shutdown), clean up the client
@app.after_serving
async def cleanup():
    await client.disconnect()

async def get_me():
    return await client.get_me()

async def get_telegram_user(username):
    return await client.get_entity(f"@{username}")


def largest_still_size(photo):
    """The biggest still JPEG size of a profile photo, or None.

    Animated profile photos also carry video sizes, and Telethon's default
    download picks the largest size overall, which is the MP4. Saved under a
    .jpg name, that breaks the page preview and the wristband print.
    """
    stills = [s for s in photo.sizes if isinstance(s, (types.PhotoSize, types.PhotoSizeProgressive))]
    return max(stills, key=lambda s: s.w * s.h, default=None)


async def download_profile_photo(user):
    """Save the user's current profile photo (still image) as static/img/<username>.jpg."""
    profile_photos = await client.get_profile_photos(user, limit=1)
    if not profile_photos:
        return None
    photo = profile_photos[0]
    size = largest_still_size(photo)
    if size is None:
        return None
    # thumb=<size type> pins the download to that still size instead of the video.
    return await client.download_media(photo, file=f"static/img/{user.username}.jpg", thumb=size.type)

class TelegramLookupError(Exception):
    """A Telegram lookup failed. str(error) is a message staff can act on."""

    def __init__(self, message, status=404):
        super().__init__(message)
        self.status = status


async def lookup_telegram_user(username):
    """Fetch a guest's Telegram profile, or raise TelegramLookupError."""
    username = (username or "").strip().lstrip("@")
    if not username:
        raise TelegramLookupError("That QR code has no Telegram username in it.")
    if username.startswith("+"):
        # t.me/+... links are phone-number or private invite links, which can't be looked up.
        raise TelegramLookupError(
            "That QR code is a phone-number link. Ask the guest to set a Telegram username "
            "(Settings → Username) and show the QR again, or fill in their details by hand.")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        await client.start()
        user = await client.get_entity(f"@{username}")
        if not isinstance(user, types.User):
            raise TelegramLookupError(f"@{username} is a Telegram channel or group, not a person.")
        full = await client(GetFullUserRequest(user))
    except TelegramLookupError:
        raise
    except (ValueError, errors.UsernameNotOccupiedError, errors.UsernameInvalidError):
        # get_entity raises ValueError when no account has this username.
        raise TelegramLookupError(f"Couldn't find @{username} on Telegram. Check the handle, or fill in the details by hand.")
    except errors.FloodWaitError as err:
        raise TelegramLookupError(
            f"Telegram is rate-limiting lookups for {err.seconds} seconds. Fill in the details by hand for now.", 503)
    except (errors.RPCError, ConnectionError, OSError, asyncio.TimeoutError) as err:
        app.logger.exception("Telegram lookup for @%s failed", username)
        raise TelegramLookupError(f"Couldn't reach Telegram ({type(err).__name__}). Fill in the details by hand.", 502)

    # A missing photo shouldn't fail the lookup; the form falls back to the placeholder.
    try:
        photo_path = await download_profile_photo(user)
    except Exception:
        app.logger.exception("Profile photo download for @%s failed", username)
        photo_path = None

    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "bio": full.full_user.about,
        "photo": url_for("static", filename=f"img/{user.username}.jpg" if photo_path else "nobody.jpg"),
    }


@app.route("/telegram/<username>/json", methods=['GET'])
async def get_user(username):
    try:
        return await lookup_telegram_user(username)
    except TelegramLookupError as err:
        return {"error": str(err)}, err.status

AGE_NEEDED = "Enter the guest's age (or scan their ID) to print a wristband."


def parse_age(value):
    """A whole number of years, or None when it's missing or not believable.

    A band never prints without one: a missing age must not quietly become a
    MINOR band, and must never become a 21+ one.
    """
    try:
        age = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return age if 0 <= age <= 120 else None


@app.route("/enrol", methods=['POST'])
async def enrol_user():
    form = await request.form
    age = parse_age(form.get("age"))
    if age is None:
        # Back to the form with everything they typed, so only the age is left to fill in.
        await flash(AGE_NEEDED)
        handle = form.get("handle", "")
        user = {
            "id": form.get("id", ""),
            "first_name": form.get("name", ""),
            "last_name": "",
            "username": handle,
            "pronouns": form.get("pronouns", ""),
        }
        photo = url_for("static", filename=f"img/{handle}.jpg" if handle else "nobody.jpg")
        return await render_template("custom.html", user=user, photo=photo), 400
    user = {
        "name" : form["name"],
        "username": form["handle"],
        "id": form["id"],
        "pronouns": form["pronouns"],
        "age": age,
    }
    await print_wristband_form(user)
    return redirect(url_for("index"))

@app.route("/telegram/<username>", methods=['GET', 'POST'])
async def telegram_user_form(username):
    if request.method == "POST":
        return await enrol_user()
    try:
        user = await lookup_telegram_user(username)
    except TelegramLookupError as err:
        # Show the enrol form anyway, with the message on top, so staff can
        # finish by hand. Auto-print stays off: there's no verified profile.
        await flash(str(err))
        user = {"id": "", "first_name": "", "last_name": "", "username": username.lstrip("@+")}
        photo = url_for("static", filename="nobody.jpg")
        return await render_template("custom.html", user=user, photo=photo, telegram_verified=False), err.status
    return await render_template("custom.html", user=user, telegram_verified=True)

async def print_wristband_form(user):
    zpl = render_wristband(name=user["name"], handle=user["username"], mrn=user["id"], pronouns=user["pronouns"],
                           age=user["age"], icon=f"static/img/{user['username']}.jpg")
    with open("/tmp/wristband.zpl", "w") as f:
        f.write(zpl)
    os.system("lp -d Wristband /tmp/wristband.zpl")
    os.unlink("/tmp/wristband.zpl")

@app.route("/print/<username>", methods=['GET', 'POST'])
async def print_wristband(username):
    # /print/<username>?age=25. Without an age, go to the enrol form for this guest instead.
    age = parse_age(request.args.get("age"))
    if age is None:
        await flash(AGE_NEEDED)
        return redirect(url_for("telegram_user_form", username=username))
    try:
        user = await lookup_telegram_user(username)
    except TelegramLookupError as err:
        await flash(str(err))
        return redirect(url_for("index"))

    zpl = render_wristband(name=user["first_name"], handle=user["username"], mrn=user["id"], age=age,
                           icon=f"static/img/{user['username']}.jpg")
    with open("/tmp/wristband.zpl", "w") as f:
        f.write(zpl)
    os.system("lp -d Wristband /tmp/wristband.zpl")
    os.unlink("/tmp/wristband.zpl")
    return redirect(url_for("index"))


@app.route("/jwt", methods=['GET', 'POST'])
async def validate_jwt():
    """
    Check a wristband's JWT (the Aztec code printed on the band).

    Accepts the token as GET /jwt?token=<jwt>, or POST /jwt with JSON
    {"token": ...} or a form field "token". Renders jwt.html: 200 when the
    signature is valid, 400 when no token is supplied, 401 when it's invalid.
    """
    token = request.args.get("token")
    if token is None and request.method == "POST":
        if request.is_json:
            body = await request.get_json(silent=True) or {}
            token = body.get("token") if isinstance(body, dict) else None
        else:
            token = (await request.form).get("token")

    if not token or not isinstance(token, str):
        return await render_template("jwt.html", status="missing"), 400

    try:
        claims = decode_jwt(token.strip())
    except jwt.InvalidTokenError:
        # Don't echo decoder details back to the page.
        return await render_template("jwt.html", status="invalid"), 401

    issued_at = datetime.fromtimestamp(claims["iat"]).strftime("%Y-%m-%d %H:%M")
    return await render_template("jwt.html", status="valid", claims=claims, issued_at=issued_at)


@app.route("/")
async def index():
    return await render_template("index.html")


@app.route("/custom")
async def custom():
    context = {
        "photo": url_for("static", filename=f"nobody.jpg"),
    }
    return await render_template("custom.html", **context)


# By default, `Quart.run` uses `asyncio.run()`, which creates a new asyncio
# event loop. If we had connected the `TelegramClient` before, `telethon` will
# use `asyncio.get_running_loop()` to create some additional tasks. If these
# loops are different, it won't work.
#
# To keep things simple, be sure to not create multiple asyncio loops!
if __name__ == "__main__":
    #app.run(port=5000, host='0.0.0.0')
    app.run()
