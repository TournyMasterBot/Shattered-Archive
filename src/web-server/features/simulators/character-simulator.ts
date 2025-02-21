import IRace from "@shared/types/character-types/race-interface";
import ServerCache from "../../cache/server-cache";
import IDslClass from "@shared/types/character-types/dslClass";

const CharacterSimulator = {
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