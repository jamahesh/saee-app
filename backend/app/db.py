import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DEFAULT_DB = f"sqlite:///{os.path.join(BASE_DIR, 'universal_fit.db').replace(os.sep, '/')}"
raw_url = os.getenv("DATABASE_URL", "").strip()
if "\\n" in raw_url:
    raw_url = raw_url.split("\\n", 1)[0].strip()
if not raw_url or raw_url.startswith("sqlite:///./"):
    URL = DEFAULT_DB
else:
    URL = raw_url

engine = create_engine(
    URL,
    connect_args={"check_same_thread": False} if URL.startswith("sqlite") else {},
)
Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()
