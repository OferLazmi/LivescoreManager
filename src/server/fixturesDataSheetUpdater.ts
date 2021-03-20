import { DataThrottler, GoogleDocument, GoogleSheet, GoogleSheetRowBase, GoogleSpreadSheetManager } from "collectors-framework";
import { ConfigurationManager } from "../configuration/configurationManager";

var _ = require('lodash');

export class FixturesDataSheetUpdater {

    sheetName: string = "Stats";
    sheet: GoogleSheet;
    dataThrottler: DataThrottler;
    addDataThrottler: DataThrottler;
    constructor() {
        this.dataThrottler = new DataThrottler(5, async (rows: GoogleSheetRowBase[]) => {
            if (rows.length == 0) return;

            await this.sheet.updateRows("FixtureId", rows);
            await this.sheet.save();
            console.log(`${rows.length} rows Saved`, rows);
        });
    }
    public async init(columnNumber: number) {
        const googleSheetConfig = ConfigurationManager.getGoogleSheetConfig();
        const googleSpreadSheetManager = new GoogleSpreadSheetManager(googleSheetConfig.serviceAccountEmail, googleSheetConfig.privateKey)
        const document: GoogleDocument = await googleSpreadSheetManager.loadDocument(googleSheetConfig.documentName);
        this.sheet = await document.getSheet(this.sheetName);
        await this.sheet.loadCells(`A1:${this.getColumnName(columnNumber)}1000`);

        this.dataThrottler.start();
    }

    public async addOrUpdateFixture(row: GoogleSheetRowBase) {
        this.dataThrottler.addJob(row.rowId, row);
    }

    public async clearRow(rowId: string) {
        if (!this.sheet || this.sheet.rows.length === 0) return;
        
        console.log(`start clearing ${rowId} row...`);
        await this.sheet.clearRow("FixtureId", rowId, true);
        console.log(`row ${rowId} cleared!!!!`);
    }

    public async clearRows() {
        if (!this.sheet || this.sheet.rows.length === 0) return;

        console.log(`start clearing ${this.sheet.rows.length} rows...`);
        await this.sheet.clearAllRows(true);
        await this.sheet.save();
        console.log("all rows cleared!!!!");
    }

    private getColumnName(characterNumber: number) {        
        const a = "abcdefghijklmnopqrstuvwxyz"; // 30 bytes
        if(characterNumber < 0 || characterNumber >= a.length) throw new Error("invalid length : " + characterNumber);
        return a[characterNumber-1].toUpperCase();
    }
}