import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PoisonDagger implements IAbility {
    private static instance: PoisonDagger;

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
        this.name = "Poison Dagger";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
'POISON DAGGER' 'POISONDAGGER'
POISON DAGGER, POISONDAGGER
Syntax:  poisondagger <target>
This is a skill of assassins which enables them to permanently poison any
dagger type weapon that doesn't already have certain permanent effects
flags. The drawback is that the poison damages the weapon and will 
eventually corrode it completely.
`;
        
        if (PoisonDagger.instance === undefined) {
            PoisonDagger.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): PoisonDagger {
        if (!PoisonDagger.instance) {
            PoisonDagger.instance = new PoisonDagger();
        }
        return PoisonDagger.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PoisonDagger.GetInstance() as T;
    }
}

export default PoisonDagger;