import os
import logging

import telebot

BOT_TOKEN = os.environ["BOT_TOKEN"]

logger = telebot.logger
telebot.logger.setLevel(logging.INFO)
bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=['chatid'])
def get_chat_id(message):
    logger.info(message.chat)
    bot.reply_to(message, message.chat.id)

#@bot.message_handler(func=lambda msg: True)
def debug(message):
    logger.info(message)

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    logger.info(message)
    bot.reply_to(message, "Howdy, lab partner. How are you doing?")

#info = bot.get_chat(-1002281104312)
logger.info(info)
bot.infinity_polling()
