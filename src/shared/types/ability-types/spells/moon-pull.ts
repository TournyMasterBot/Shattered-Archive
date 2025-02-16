import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MoonPull implements IAbility {
    private static instance: MoonPull;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Moon Pull";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (MoonPull.instance === undefined) {
            MoonPull.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): MoonPull {
        if (!MoonPull.instance) {
            MoonPull.instance = new MoonPull();
        }
        return MoonPull.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return MoonPull.GetInstance() as T;
    }
}

export default MoonPull;