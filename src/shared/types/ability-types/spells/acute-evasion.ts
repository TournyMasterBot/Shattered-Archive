import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AcuteEvasion implements IAbility {
    private static instance: AcuteEvasion;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Acute Evasion";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = ""; // Add relevant help file content here

        if (AcuteEvasion.instance === undefined) {
            AcuteEvasion.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AcuteEvasion {
        if (!AcuteEvasion.instance) {
            AcuteEvasion.instance = new AcuteEvasion();
        }
        return AcuteEvasion.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AcuteEvasion.GetInstance() as T;
    }
}

export default AcuteEvasion;