import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkEnergy implements IAbility {
    private static instance: DarkEnergy;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Dark Energy";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DarkEnergy.instance === undefined) {
            DarkEnergy.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DarkEnergy {
        if (!DarkEnergy.instance) {
            DarkEnergy.instance = new DarkEnergy();
        }
        return DarkEnergy.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DarkEnergy.GetInstance() as T;
    }
}

export default DarkEnergy;