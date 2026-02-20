#!/usr/bin/env python3
"""Hashtag discovery pipeline — finds trending creators via niche hashtags.

Scrapes top posts for each niche hashtag, extracts creator usernames,
and auto-adds high-frequency creators (3+ hashtag appearances) as seed creators.

Usage:
    python3 -m scraper.discover [--min-appearances N] [--dry-run]
"""

import sys
import time
import random
import logging
import argparse
from pathlib import Path
from collections import Counter
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import upsert_seed_creator, add_profile

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-discover")

# Hashtags by niche and platform
TIKTOK_HASHTAGS = {
    "fitness": ["GymTok", "FitTok", "WorkoutRoutine", "GymMotivation", "FitnessJourney"],
    "finance": ["MoneyTok", "FinTok", "PersonalFinance", "Investing", "BudgetTok"],
    "business": ["BizTok", "SmallBusiness", "EntrepreneurLife", "BusinessTips", "SideHustle"],
    "beauty": ["BeautyTok", "SkinTok", "SkincareRoutine", "MakeupTutorial", "GRWM"],
    "food": ["FoodTok", "TikTokFood", "EasyRecipes", "CookingTikTok", "RecipeTok"],
    "comedy": ["Comedy", "Funny", "FunnyVideos", "ComedySketch", "Skit"],
    "lifestyle": ["DayInMyLife", "GRWM", "LifestyleTok", "DailyVlog", "Aesthetic"],
    "health": ["WellnessTok", "HealthTok", "MentalHealthMatters", "GutHealth", "Mindfulness"],
    "fashion": ["FashionTok", "OOTD", "OutfitIdeas", "StreetWear", "StyleInspo"],
    "tech": ["TechTok", "TechReview", "GadgetTok", "CodingTikTok", "SetupTour"],
    "real-estate": ["RealEstateTok", "HouseTour", "DreamHome", "RealEstateAgent", "LuxuryRealEstate"],
    "education": ["StudyTok", "EduTok", "LearnOnTikTok", "StudyWithMe", "StudyTips"],
    "motivation": ["MotivationTok", "Mindset", "SuccessMindset", "SelfImprovement", "LevelUp"],
    "travel": ["TravelTok", "TravelTips", "HiddenGems", "SoloTravel", "Wanderlust"],
    "parenting": ["MomTok", "DadTok", "ParentingTok", "MomLife", "ParentingHacks"],
}

INSTAGRAM_HASHTAGS = {
    "fitness": ["FitFam", "FitnessMotivation", "GymLife", "WorkoutRoutine", "StrengthTraining"],
    "finance": ["FinancialFreedom", "InvestingTips", "PersonalFinance", "MoneyMindset", "FIRE"],
    "business": ["EntrepreneurJourney", "SmallBizInspo", "BusinessGrowth", "StartupJourney", "DigitalMarketing"],
    "beauty": ["SkincareRoutine", "BeautyTips", "MakeupLook", "SelfCare", "AntiAging"],
    "food": ["Foodie", "InstaFood", "HomeCooking", "FoodBlogger", "EasyRecipes"],
    "comedy": ["FunnyMemes", "ComedyReels", "FunnyVideos", "Humor", "ReelsFunny"],
    "lifestyle": ["LifestyleBlogger", "DailyRoutine", "SlowLiving", "LifestyleContent", "Aesthetic"],
    "health": ["WellnessJourney", "HealthyLifestyle", "MentalHealth", "HolisticHealth", "HealthyLiving"],
    "fashion": ["OOTD", "FashionBlogger", "StyleInspo", "InstaFashion", "StreetStyle"],
    "tech": ["TechNews", "Gadgets", "ArtificialIntelligence", "SmartHome", "TechReview"],
    "real-estate": ["RealEstate", "Realtor", "LuxuryHomes", "RealEstateInvesting", "DreamHome"],
    "education": ["StudyGram", "StudyMotivation", "Education", "StudentLife", "BookStagram"],
    "motivation": ["MotivationalQuotes", "Mindset", "SuccessQuotes", "GrowthMindset", "PositiveVibes"],
    "travel": ["TravelGram", "Wanderlust", "TravelBlogger", "ExploreMore", "TravelReels"],
    "parenting": ["MomsOfInstagram", "MomLife", "Motherhood", "ParentingTips", "FamilyFirst"],
}


def scrape_tiktok_hashtag(hashtag: str, limit: int = 20) -> list[str]:
    """Scrape top creators from a TikTok hashtag. Returns list of usernames."""
    try:
        from scraper.tiktok import scrape_hashtag_creators
        return scrape_hashtag_creators(hashtag, limit=limit)
    except (ImportError, AttributeError):
        log.debug(f"TikTok hashtag scraping not available for #{hashtag}")
        return []
    except Exception as e:
        log.warning(f"Error scraping TikTok #{hashtag}: {e}")
        return []


def scrape_instagram_hashtag(hashtag: str, limit: int = 20) -> list[str]:
    """Scrape top creators from an Instagram hashtag. Returns list of usernames."""
    try:
        from scraper.instagram import scrape_hashtag_creators
        return scrape_hashtag_creators(hashtag, limit=limit)
    except (ImportError, AttributeError):
        log.debug(f"Instagram hashtag scraping not available for #{hashtag}")
        return []
    except Exception as e:
        log.warning(f"Error scraping Instagram #{hashtag}: {e}")
        return []


def discover_creators(platform: str, min_appearances: int = 3, dry_run: bool = False) -> dict[str, list[str]]:
    """Discover new creators from hashtag scraping.

    Returns dict mapping niche -> list of newly discovered usernames.
    """
    hashtags = TIKTOK_HASHTAGS if platform == "tiktok" else INSTAGRAM_HASHTAGS
    scrape_fn = scrape_tiktok_hashtag if platform == "tiktok" else scrape_instagram_hashtag

    # Count appearances across all hashtags per niche
    niche_creators: dict[str, Counter] = {}

    for niche, tags in hashtags.items():
        niche_creators[niche] = Counter()
        for tag in tags:
            log.info(f"[{platform}] Scraping #{tag} ({niche})...")
            usernames = scrape_fn(tag, limit=20)
            for u in usernames:
                niche_creators[niche][u] += 1

            # Rate limit between hashtag scrapes
            delay = random.uniform(10, 20) if platform == "tiktok" else random.uniform(20, 40)
            time.sleep(delay)

    # Find creators with 3+ appearances in their niche
    discovered: dict[str, list[str]] = {}
    for niche, counter in niche_creators.items():
        frequent = [username for username, count in counter.items() if count >= min_appearances]
        if frequent:
            discovered[niche] = frequent
            for username in frequent:
                count = counter[username]
                log.info(f"[DISCOVERED] {platform}/@{username} in {niche} ({count} hashtag appearances)")
                if not dry_run:
                    upsert_seed_creator(username, platform, niche, tier="discovered")
                    add_profile(username, platform)

    return discovered


def run_discovery(min_appearances: int = 3, dry_run: bool = False):
    """Run the full discovery pipeline for both platforms."""
    log.info("Starting hashtag discovery pipeline...")

    for platform in ["tiktok", "instagram"]:
        discovered = discover_creators(platform, min_appearances=min_appearances, dry_run=dry_run)
        total = sum(len(v) for v in discovered.values())
        log.info(f"[{platform}] Discovered {total} new creators across {len(discovered)} niches")

    log.info("Hashtag discovery pipeline complete")


def main():
    parser = argparse.ArgumentParser(description="Discover trending creators via hashtag scraping")
    parser.add_argument("--min-appearances", type=int, default=3,
                        help="Minimum hashtag appearances to qualify (default: 3)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview discoveries without inserting into DB")
    args = parser.parse_args()

    run_discovery(min_appearances=args.min_appearances, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
