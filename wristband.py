import os
import io
import time
from unidecode import unidecode
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, nodes
from PIL import Image
from zebrafy import ZebrafyImage
import jwt

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

env = Environment(loader=FileSystemLoader("templates"))

# Where the guest photo goes when the template doesn't say (the hand-written template).
DEFAULT_ICON_BOX = {"x": 30, "y": 210, "w": 150, "h": 150, "rotate": 0}


def slot_box(template_name: str, name: str = "icon_zpl") -> dict:
    """The photo box the ZPL editor writes at the top of an exported template:

        {% set icon_zpl_box = {"x": 30, "y": 210, "w": 150, "h": 150, "rotate": 90} %}

    x/y are relative to the template's ^LH, if it has one. rotate is 90 when the
    label prints turned: the photo is turned clockwise before converting it.
    Read from the parse tree, because Template.module would run the whole template
    and fail on {% if age < 18 %} without a guest.
    """
    source = env.loader.get_source(env, template_name)[0]
    for node in env.parse(source).find_all(nodes.Assign):
        if isinstance(node.target, nodes.Name) and node.target.name == f"{name}_box":
            return node.node.as_const()
    return DEFAULT_ICON_BOX

JWT_SECRET = os.environ['JWT_SECRET']

def load_private_key(key_path):
    path = Path(key_path).expanduser()
    with open(path, "rb") as key_file:
        private_key = serialization.load_ssh_private_key(
            key_file.read(),
        password=None)
    
    return private_key

def get_private_key():
     return load_private_key(os.environ.get('JWT_PRIVATE_KEY_PATH', "~/.ssh/id_ed25519"))

def decode_jwt(encoded_jwt):
    private_key = get_private_key()
    public_key = private_key.public_key()
    
    return jwt.decode(encoded_jwt, public_key, algorithms=["EdDSA"])


def render(name: str, handle: str = None, pronouns: str = None, mrn: str = None, icon: [str | bytes] = None, age: int = None) -> bytes:
    template = env.get_template("wristband.zpl")
    icon_zpl = ""
    if icon is not None:
        if type(icon) is str:
            try:
                with open(icon, 'rb') as image:
                    icon_bytes = image.read()
            except FileNotFoundError:
                with open('static/img/nobody.jpg', 'rb') as image:
                    icon_bytes = image.read()
        elif isinstance(icon, io.IOBase):
            icon_bytes = icon.read()
        elif type(icon) is bytes:
            icon_bytes = icon

        box = slot_box("wristband.zpl")
        if box.get("rotate"):
            image = Image.open(io.BytesIO(icon_bytes)).rotate(-box["rotate"], expand=True)
            buf = io.BytesIO()
            image.save(buf, format="PNG")
            icon_bytes = buf.getvalue()

        icon_zpl = ZebrafyImage(
            icon_bytes,
            format="Z64",
            invert=True,
            dither=True,
            width=box["w"],
            height=box["h"],
            pos_x=box["x"],
            pos_y=box["y"],
            complete_zpl=False,
        ).to_zpl()

    if age is None:
        # The template picks MINOR / 18+ / 21+ from this and the JWT records it: never guess.
        raise ValueError("render() needs the guest's age")
    over_18 = False
    over_21 = False
    if age is not None:
        if age >= 18:
            over_18 = True
        if age >= 21:
            over_21 = True

    payload = {
        "sub": mrn,
        "name": name,
        "18+": over_18,
        "21+": over_21,
        "iat": int(time.time()),
    }
    # Static secret    
    #encoded_jwt = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    private_key = get_private_key()
    encoded_jwt = jwt.encode(payload, private_key, algorithm="EdDSA")

    print(decode_jwt(encoded_jwt))

    # Clip what prints to what fits on the band; the JWT above keeps the full name.
    # handle and pronouns can be None: "" hides their lines in the template.
    return template.render(
        name=unidecode(name)[:18],
        handle=(handle or "")[:17],
        pronouns=(pronouns or "")[:10],
        mrn=mrn,
        age=age,
        icon_zpl=icon_zpl,
        encoded_jwt=encoded_jwt,
    )


if __name__ == "__main__":
    #print(
    render(name="Do Not Serve Alcohol", handle="@under21", mrn="00000000", age=18, icon="/home/rechner/Desktop/photo_2024-07-16_10-14-25.jpg")
    #print(
    render(name="Legal Adult", handle="@boozetime", mrn="00000000", age=22,
                 icon="/home/rechner/Desktop/photo_2024-07-16_10-14-25.jpg")
