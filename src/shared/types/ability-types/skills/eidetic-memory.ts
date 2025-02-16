import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EideticMemory implements IAbility {
    private static instance: EideticMemory;

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
        this.name = "Eidetic Memory";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help mentalist
Eidetic Memory - castable only upon yourself, making the caster immune
to mental and psychological attacks.`;

        if (EideticMemory.instance === undefined) {
            EideticMemory.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): EideticMemory {
        if (!EideticMemory.instance) {
            EideticMemory.instance = new EideticMemory();
        }
        return EideticMemory.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EideticMemory.GetInstance() as T;
    }
}

export default EideticMemory;