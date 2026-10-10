"""Structured outputs for the Claim Extractor and the Verdict agent."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ExtractedClaims(BaseModel):
    company_name: Optional[str] = Field(None, description="Company the offer claims to be from")
    claimed_role: Optional[str] = Field(None, description="Job or internship title offered")
    hr_name: Optional[str] = Field(None, description="Name of the recruiter / HR person")
    sender_email: Optional[str] = Field(None, description="Email address the offer came from")
    phone_or_whatsapp: list[str] = Field(default_factory=list)
    office_address: Optional[str] = Field(None, description="Office / reporting address mentioned")
    website_mentioned: Optional[str] = None
    stipend_or_salary: Optional[str] = None
    money_requested: Optional[str] = Field(
        None, description="Any fee, deposit or payment the candidate is asked to make, verbatim")
    pressure_tactics: Optional[str] = Field(None, description="Deadlines, 'limited seats', urgency")
    checkable_claims: list[str] = Field(
        default_factory=list,
        description="Short, independently checkable statements made by the offer, "
                    "e.g. 'Infosys is hiring Data Analyst interns', "
                    "'The office is at 4th Floor, Sector 18, Noida'")


class ClaimCheck(BaseModel):
    claim: str
    status: Literal["VERIFIED", "CONTRADICTED", "UNVERIFIED"]
    evidence: str = Field(description="One or two sentences: what the search evidence shows")
    sources: list[str] = Field(default_factory=list, description="URLs that back the evidence")


class Verdict(BaseModel):
    verdict: Literal["LIKELY_SCAM", "SUSPICIOUS", "LIKELY_LEGIT", "NOT_ENOUGH_EVIDENCE"]
    risk_score: int = Field(description="0 (clearly genuine) to 100 (clearly a scam)")
    one_line_summary: str
    claim_checks: list[ClaimCheck]
    red_flags: list[str] = Field(default_factory=list)
    green_flags: list[str] = Field(default_factory=list)
    official_website: Optional[str] = None
    official_contact: Optional[str] = Field(
        None, description="Official HR / careers email or page found in search results, if any")
    verification_email: str = Field(
        description="A short, polite email the candidate can send to the OFFICIAL contact "
                    "asking them to confirm whether this offer is genuine")
    next_steps: list[str] = Field(default_factory=list)
