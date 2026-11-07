
function get_telegram_username(message) {
    if (message.data.startsWith("https://t.me/")) {
        return message.data.slice(13, message.data.length);
    }
    return null;
}

// Source - https://stackoverflow.com/a/38552302
// Posted by Peheje, modified by community. See post 'Timeline' for change history
// Retrieved 2026-11-06, License - CC BY-SA 4.0

function parseJwt (token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}


document.addEventListener("DOMContentLoaded", (event) => {

    const client = mqtt.connect("mqtt://localhost:8083");

    client.on("connect", () => {
        client.subscribe("checkin/presence", (err) => {
            if (!err) {
                client.publish("checkin/presence", "Hello :3");
            }
        });
        client.subscribe("checkin/scan");
    });

    client.on("message", (topic, message) => {
        // message is Buffer
        console.log(topic, message.toString());
        let payload = {};
        try {
            payload = JSON.parse(message.toString());
        } catch {
            console.log("Not a JSON payload");
            return;
        }

        if (topic === "checkin/scan") {
            if (payload.data_type === "url") {
                let username = get_telegram_username(payload);
                if (username) {
                    window.location = "/telegram/" + username;
                }
            } else if (payload.data_type == "aamva") {
                let age = calculateAge(payload.birthday);
                if (age === null) {
                    // The AAMVA parser failed (it sends null fields) or the date
                    // is unreadable. Never guess an age; drop any older held one
                    // so it can't be mistaken for this guest's.
                    console.log("ID scan has no usable birthday", payload.birthday);
                    clearPendingAge();
                    document.dispatchEvent(new CustomEvent("idscanfailed", {
                        detail: { message: "Couldn't read a date of birth from that ID. Scan it again, or check the ID and type the age." },
                    }));
                    return;
                }
                // Hold the age so scanning works in either order: if the
                // Telegram QR comes next, the enrol form picks it up on load.
                savePendingAge(age);
                // Tell whichever page is open (enrol form or start screen).
                document.dispatchEvent(new CustomEvent("idscanned", { detail: { age: age } }));
            } else if (payload.data_type == "text") {
                // A wristband's Aztec code: a JWT the server verifies at /jwt.
                let jwt_text = String(payload.text || "").trim();
                if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt_text)) {
                    try {
                        parseJwt(jwt_text);
                        window.location = "/jwt?token=" + encodeURIComponent(jwt_text);
                    } catch {
                        console.log("Text scan looks like a JWT but doesn't decode");
                    }
                }
            }

        }
        console.log(message.toString());
    });

});
