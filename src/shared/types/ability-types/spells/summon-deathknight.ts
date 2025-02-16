import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonDeathknight implements IAbility {
    private static instance: SummonDeathknight;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Summon Deathknight";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (SummonDeathknight.instance === undefined) {
            SummonDeathknight.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): SummonDeathknight {
        if (!SummonDeathknight.instance) {
            SummonDeathknight.instance = new SummonDeathknight();
        }
        return SummonDeathknight.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SummonDeathknight.GetInstance() as T;
    }
}

export default SummonDeathknight;