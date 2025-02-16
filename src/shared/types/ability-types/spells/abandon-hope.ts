import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AbandonHope implements IAbility {
    private static instance: AbandonHope;

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
        this.name = "Abandon Hope";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
ABANDON HOPE

Syntax: cast 'abandon hope' target 

The hardest spell for a mentalist to cast and the most damaging in the long
run, Abandon hope will cause their enemy to lose their hope within the
battlefield, which can be detrimental to the enemy.  

Groups containing this spell: Mentalism

SEE ALSO:  MENTALIST, MENTALISM
`;

        if (AbandonHope.instance === undefined) {
            AbandonHope.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AbandonHope {
        if (!AbandonHope.instance) {
            AbandonHope.instance = new AbandonHope();
        }
        return AbandonHope.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AbandonHope.GetInstance() as T;
    }
}

export default AbandonHope;