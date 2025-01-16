import os
import io
import time
from unidecode import unidecode

from jinja2 import Environment, FileSystemLoader
from zebrafy import ZebrafyImage
import jwt

env = Environment(loader=FileSystemLoader("templates"))

JWT_SECRET = os.environ['JWT_SECRET']

def render(name: str, handle: str = None, pronouns: str = None, mrn: str = None, icon: [str | bytes] = None, age: int = 0) -> bytes:
    template = env.get_template("wristband.zpl")
    icon_zpl = ""
    if icon is not None:
        if type(icon) is str:
            with open(icon, 'rb') as image:
                icon_bytes = image.read()
        elif isinstance(icon, io.IOBase):
            icon_bytes = icon.read()
        elif type(icon) is bytes:
            icon_bytes = icon

        icon_zpl = ZebrafyImage(
            icon_bytes,
            format="Z64",
            invert=False,
            dither=True,
            width=150,
            height=150,
            pos_x=30,
            pos_y=210,
            complete_zpl=False,
        ).to_zpl()

    over_18 = False
    over_21 = False
    if age is not None:
        if age >= 18:
            over_18 = True
        elif age >= 21:
            over_21 = True

    payload = {
        "sub": mrn,
        "name": name,
        "18+": over_18,
        "21+": over_21,
        "iat": int(time.time()),
    }
    encoded_jwt = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    return template.render(name=unidecode(name), handle=handle, pronouns=pronouns, mrn=mrn, age=age, icon_zpl=icon_zpl, encoded_jwt=encoded_jwt)


if __name__ == "__main__":
    print(render(name="Do Not Serve Alcohol", handle="@under21", mrn="00000000", age=18, icon="/home/rechner/Desktop/photo_2024-07-16_10-14-25.jpg"))
    print(render(name="Legal Adult", handle="@boozetime", mrn="00000000", age=22,
                 icon="/home/rechner/Desktop/photo_2024-07-16_10-14-25.jpg"))