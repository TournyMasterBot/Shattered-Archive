import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonEarthlord implements IAbility {
    private static instance: SummonEarthlord;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Summon Earthlord";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (SummonEarthlord.instance === undefined) {
            SummonEarthlord.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): SummonEarthlord {
        if (!SummonEarthlord.instance) {
            SummonEarthlord.instance = new SummonEarthlord();
        }
        return SummonEarthlord.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SummonEarthlord.GetInstance() as T;
    }
}

export default SummonEarthlord;