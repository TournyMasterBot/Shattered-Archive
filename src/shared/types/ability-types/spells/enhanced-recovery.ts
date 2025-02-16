import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnhancedRecovery implements IAbility {
    private static instance: EnhancedRecovery;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Enhanced Recovery";
        this.helpFile = `
ENHANCED RECOVERY

Syntax: c 'enhanced recovery' <target>

Enhanced recovery is a powerful tool of the priest which allows him/her to
increase the rate at which an individual recovers their health, movement, and
mana.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (EnhancedRecovery.instance === undefined) {
            EnhancedRecovery.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): EnhancedRecovery {
        if (!EnhancedRecovery.instance) {
            EnhancedRecovery.instance = new EnhancedRecovery();
        }
        return EnhancedRecovery.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EnhancedRecovery.GetInstance() as T;
    }
}

export default EnhancedRecovery;