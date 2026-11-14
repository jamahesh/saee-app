from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, JSON, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class Brand(Base):
    __tablename__ = "brands"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    products = relationship("Product", back_populates="brand")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"))
    name: Mapped[str] = mapped_column(String(180))
    category: Mapped[str] = mapped_column(String(60))
    fit_type: Mapped[str] = mapped_column(String(20), default="regular")
    stretch: Mapped[str] = mapped_column(String(20), default="low")
    brand = relationship("Brand", back_populates="products")
    charts = relationship("SizeChart", back_populates="product")


class SizeChart(Base):
    __tablename__ = "size_charts"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    rows = relationship("SizeRow", back_populates="chart", cascade="all, delete-orphan")
    product = relationship("Product", back_populates="charts")


class SizeRow(Base):
    __tablename__ = "size_rows"
    id: Mapped[int] = mapped_column(primary_key=True)
    chart_id: Mapped[int] = mapped_column(ForeignKey("size_charts.id"))
    size: Mapped[str] = mapped_column(String(20))
    garment_cm: Mapped[dict] = mapped_column(JSON)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    chart = relationship("SizeChart", back_populates="rows")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="customer")
    plan_code: Mapped[str] = mapped_column(String(30), default="none")
    plan_status: Mapped[str] = mapped_column(String(30), default="inactive")
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StyleProfile(Base):
    __tablename__ = "style_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    body_colour: Mapped[str] = mapped_column(String(60), default="Medium Warm")
    undertone: Mapped[str] = mapped_column(String(40), default="warm")
    height_cm: Mapped[float] = mapped_column(Float, default=170.0)
    weight_kg: Mapped[float] = mapped_column(Float, default=65.0)
    chest_cm: Mapped[float] = mapped_column(Float, default=96.0)
    waist_cm: Mapped[float] = mapped_column(Float, default=82.0)
    hips_cm: Mapped[float] = mapped_column(Float, default=96.0)
    shoulder_cm: Mapped[float] = mapped_column(Float, default=44.0)
    foot_length_cm: Mapped[float] = mapped_column(Float, default=26.0)
    fit_preference: Mapped[str] = mapped_column(String(30), default="regular")
    style_vibe: Mapped[str] = mapped_column(String(60), default="contemporary")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WardrobeItem(Base):
    __tablename__ = "wardrobe_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(60))
    occasion: Mapped[str] = mapped_column(String(60))
    size_label: Mapped[str] = mapped_column(String(30), default="M")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PaymentOrder(Base):
    __tablename__ = "payment_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    plan_code: Mapped[str] = mapped_column(String(30))
    amount_inr: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    razorpay_order_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="created")
    verified_via: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PartnerAd(Base):
    __tablename__ = "partner_ads"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_name: Mapped[str] = mapped_column(String(120))
    headline: Mapped[str] = mapped_column(String(180))
    offer_text: Mapped[str] = mapped_column(String(240))
    category: Mapped[str] = mapped_column(String(60))
    target_occasion: Mapped[str] = mapped_column(String(60), default="all")
    cta_url: Mapped[str] = mapped_column(String(300))
    monthly_budget_inr: Mapped[int] = mapped_column(Integer, default=5000)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StyleHistory(Base):
    __tablename__ = "style_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    section: Mapped[str] = mapped_column(String(40))
    occasion: Mapped[str] = mapped_column(String(80))
    result_json: Mapped[dict] = mapped_column(JSON)
    used_gemini: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
