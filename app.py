import asyncio
import os

from quart import Quart, render_template, url_for, request, redirect
from telethon import TelegramClient, events
from telethon.tl.functions.users import GetFullUserRequest

from wristband import render as render_wristband

api_id = os.environ['TELEGRAM_API_ID']
api_hash = os.environ['TELEGRAM_API_HASH']

app = Quart(__name__)
app.secret_key = os.environ['QUART_SECERT_KEY']

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

@app.route("/telegram/<username>/json", methods=['GET'])
async def get_user(username):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    await client.start()
    user = await client.get_entity(f"@{username}")
    full = await client(GetFullUserRequest(username))
    print(user)
    print(full.stringify())
    profile_photos = await client.get_profile_photos(user, limit=1)
    if len(profile_photos):
        print(await client.download_media(profile_photos[0], file=f"static/img/{user.username}.jpg"))
    print(user)
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "bio": full.full_user.about,
        "photo": url_for("static", filename=f"img/{user.username}.jpg")
    }

@app.route("/enrol", methods=['POST'])
async def enrol_user():
    form = await request.form
    user = {
        "name" : form["name"],
        "username": form["handle"],
        "id": form["id"],
        "pronouns": form["pronouns"],
        "age": int(form["age"]),
    }
    await print_wristband_form(user)
    return redirect(url_for("index"))

@app.route("/telegram/<username>", methods=['GET', 'POST'])
async def telegram_user_form(username):
    if request.method == "POST":
        return await enrol_user()
    user = await get_user(username)
    return await render_template("custom.html", user=user)

async def print_wristband_form(user):
    zpl = render_wristband(name=user["name"], handle=user["username"], mrn=user["id"], pronouns=user["pronouns"],
                           age=user["age"], icon=f"static/img/{user['username']}.jpg")
    with open("/tmp/wristband.zpl", "w") as f:
        f.write(zpl)
    os.system("lp -d Wristband /tmp/wristband.zpl")
    os.unlink("/tmp/wristband.zpl")

@app.route("/print/<username>", methods=['GET', 'POST'])
async def print_wristband(username):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    await client.start()
    user = await client.get_entity(f"@{username}")
    full = await client(GetFullUserRequest(username))
    profile_photos = await client.get_profile_photos(user, limit=1)
    if len(profile_photos):
        print(await client.download_media(profile_photos[0], file=f"static/img/{user.username}.jpg"))

    zpl = render_wristband(name=user.first_name, handle=user.username, mrn=user.id, icon=f"static/img/{user.username}.jpg")
    with open("/tmp/wristband.zpl", "w") as f:
        f.write(zpl)
    os.system("lp -d Wristband /tmp/wristband.zpl")
    os.unlink("/tmp/wristband.zpl")

    return {"user": {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "bio": full.full_user.about,
    }}


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
