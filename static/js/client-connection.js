
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
                let dob = payload.birthday;
                let age = calculateAge(payload.birthday);
                let age_element = document.getElementById("age");
                if (age_element) {
                    age_element.value = age;
                    if (age > 21) {
                        age_element.classList.remove('bg-danger');
                        age_element.classList.add('bg-success');
                    }
                }
            } else if (payload.data_type == "text") {
                let jwt_text = payload.text;
                try { 
                    let parsed_jwt = parseJwt(jwt_text);
                    window.location = "/jwt?token=" + jwt_text;
                } catch {
                }
            }

        }
        console.log(message.toString());
    });

});
