import ServerCache from "../../cache/server-cache";

const CharacterSimulator = {
    GetRace: function(raceName: string) {
        ServerCache.GetRaceByName(raceName);
    },
    GetClass: function(className: string) {

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