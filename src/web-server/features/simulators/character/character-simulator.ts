import IRace from "@shared/types/character-types/race-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import ServerCache from "@shared/cache/server-cache";

const CharacterSimulator = {
    /**
     * 0-40: 1000,
    * 41-60: (TotalCp-40)*50+1000 <br />
    * 61-80: (TotalCp-60)*100+2000 <br />
    * 81-100: (TotalCp-80)*200+4000 <br />
    * 101-120: (TotalCp-100)*400+8000 <br />
    * 121-140: (TotalCp-120)*800+16000 <br />
    * 141-160: (TotalCp-140)*1600+32000 <br />
    * 161-180: (TotalCp-160)*3200+64000 <br />
    * 181-200: (TotalCp-180)*6400+128000 <br />
    * 201-220: (TotalCp-200)*12800+256000 <br />
    * 221-240: (TotalCp-220)*25600+512000 <br />
    * 241+: 1000000
     */
    CalculateCp: function(totalCp: number, racialModifier: number) {
        let tnl: number;

        if (totalCp > 40 && totalCp < 240) {
            const roundCpModifier = this.RoundCpMultiplier(totalCp, 20);
            let expectedCpModifier = totalCp % 20 !== 0 
                ? roundCpModifier + 1 
                : roundCpModifier;
            if (expectedCpModifier === 0) {
                expectedCpModifier = 1;
            }
    
            let multiplierCP = 40;
            let multiplier = 50;
            let additive = 1000;
            for (let i = 1; i < expectedCpModifier; i++) {
                multiplierCP += 20;
                multiplier *= 2;
                additive *= 2;
            }
            const cpCheck = totalCp - multiplierCP;
            tnl = (cpCheck * multiplier) + additive;
            console.debug("CP Calculation Result", {
                roundCpModifier: roundCpModifier,
                multiplierCP: multiplierCP,
                expectedCpModifier: expectedCpModifier,
                multiplier: multiplier,
                additive: additive,
                racialModifier: racialModifier
            });
        } else if (totalCp >= 240) {
            tnl = 1000000;
        } else {
            tnl = 1000;
        }
    
        const total = tnl * racialModifier;
        const racialModifiedTnl = this.RoundDown(total);
        console.debug("Expected TNL", {
            racialModifiedTnl: racialModifiedTnl
        });
        return racialModifiedTnl;
    },
    RoundCpMultiplier: function(totalCp: number, increment: number) {
        const interval = Math.floor(totalCp / increment) - 2;
        return interval;
    },
    RoundDown: function(input: number) {
        const decimalPlaces = 0;
        const factor = Math.pow(10, decimalPlaces);
        const result = Math.floor(input * factor) / factor;
        return result;
    },
    GetRace: function(raceName: string): IRace | undefined {
        const race = ServerCache.GetRaceByName(raceName);
        return race;
    },
    GetClass: function(className: string): IDslClass | undefined {
        const dslClass = ServerCache.GetClassByName(className);
        return dslClass;
    },
    GetAbility: function(abilityName: string) {

    },
    ModifyCP: function(isTakingItem: boolean, cpAmount: number, modifyType: string) {

    },
    AddCP: function(cpAmount: number) {

    },
    RemoveCP: function(cpAmount: number) {

    }
}
  
export default CharacterSimulator;