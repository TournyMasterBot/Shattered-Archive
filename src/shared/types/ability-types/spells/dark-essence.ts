import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkEssence implements IAbility {
    private static instance: DarkEssence;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Dark Essence";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DarkEssence.instance === undefined) {
            DarkEssence.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DarkEssence {
        if (!DarkEssence.instance) {
            DarkEssence.instance = new DarkEssence();
        }
        return DarkEssence.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DarkEssence.GetInstance() as T;
    }
}

export default DarkEssence;