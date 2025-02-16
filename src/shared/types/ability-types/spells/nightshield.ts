import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class NightShield implements IAbility {
    private static instance: NightShield;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Night Shield";
        this.helpFile = `
`; // Add appropriate help text if available
        this.abilityGroupType = AbilityGroupType.Unknown; // Set appropriate group type
        this.abilityUsage = AbilityUsage.Active;

        if (NightShield.instance === undefined) {
            NightShield.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): NightShield {
        if (!NightShield.instance) {
            NightShield.instance = new NightShield();
        }
        return NightShield.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return NightShield.GetInstance() as T;
    }
}

export default NightShield;