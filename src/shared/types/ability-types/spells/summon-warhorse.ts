import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonWarhorse implements IAbility {
    private static instance: SummonWarhorse;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Summon Warhorse";
        this.helpFile = ``;
        this.manualDescription = ``;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (SummonWarhorse.instance === undefined) {
            SummonWarhorse.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): SummonWarhorse {
        if (!SummonWarhorse.instance) {
            SummonWarhorse.instance = new SummonWarhorse();
        }
        return SummonWarhorse.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SummonWarhorse.GetInstance() as T;
    }
}

export default SummonWarhorse;