"""Isolate pytest from any local production .env values before backend.app is imported."""
import os

os.environ["YULYA_SKIP_DOTENV"] = "true"
os.environ["APP_ENV"] = "development"
os.environ["COOKIE_SECURE"] = "false"
os.environ["APP_ORIGIN"] = "http://testserver"
os.environ["API_ORIGIN"] = "http://testserver"
os.environ["PLAY_ORIGIN"] = "http://play.testserver"
os.environ["MONGODB_URI"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["R2_ENDPOINT_URL"] = ""
os.environ["DEV_AUTH_ENABLED"] = "false"
