
function get_telegram_username(message) {
    if (message.data.startsWith("https://t.me/")) {
        return message.data.slice(13, message.data.length);
    }
    return null;
}

document.addEventListener("DOMContentLoaded", (event) => {

    const client = mqtt.connect("mqtt://localhost:8883");

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
            if (payload.data_type === "generic") {
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
            }
        }
        console.log(message.toString());
    });

});
