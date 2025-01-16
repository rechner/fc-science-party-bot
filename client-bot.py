from telethon import TelegramClient, events, sync
from telethon.tl.functions.users import GetFullUserRequest


# These example values won't work. You must get your own api_id and
# api_hash from https://my.telegram.org, under API Development.
api_id = xxxxx
api_hash = 'hash goes here'

client = TelegramClient('Science Party Bot', api_id, api_hash)
client.start()

#print(client.get_me().stringify())

#print(client.get_entity('@rechner'))

#users = client.get_participants(-1002281104312)
#for user in users:
#    if not user.bot:
#        full = client(GetFullUserRequest(user))
#        print(user.id, user.username, user.first_name, user.last_name, full.full_user.about)
