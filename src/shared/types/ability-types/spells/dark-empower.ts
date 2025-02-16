import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkEmpower implements IAbility {
    private static instance: DarkEmpower;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Dark Empower";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DarkEmpower.instance === undefined) {
            DarkEmpower.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DarkEmpower {
        if (!DarkEmpower.instance) {
            DarkEmpower.instance = new DarkEmpower();
        }
        return DarkEmpower.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DarkEmpower.GetInstance() as T;
    }
}

export default DarkEmpower;