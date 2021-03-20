import { SheetColumItem } from "collectors-framework";

export class FixtureRowBase {
    FixtureId: SheetColumItem;
}

export class StatsRow extends FixtureRowBase {
    HomeScore: SheetColumItem;
    AwayScore: SheetColumItem;
    HomeHTScore: SheetColumItem;
    AwayHTScore: SheetColumItem;
    HomeFTScore: SheetColumItem;
    AwayFTScore: SheetColumItem;
    HomeCorners: SheetColumItem;
    AwayCorners: SheetColumItem;
    HomeCornersHT: SheetColumItem;
    AwayCornersHT: SheetColumItem;
    HomeCornersFT: SheetColumItem;
    AwayCornersFT: SheetColumItem;
    HomeYellowCard: SheetColumItem;
    AwayYellowCard: SheetColumItem;
    HomeYellowCardHT: SheetColumItem;
    AwayYellowCardHT: SheetColumItem;
    HomeYellowCardFT: SheetColumItem;
    AwayYellowCardFT: SheetColumItem;
    LastUpdate: SheetColumItem;
}