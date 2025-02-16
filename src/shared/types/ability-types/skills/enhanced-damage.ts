import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EnhancedDamage implements IAbility {
    private static instance: EnhancedDamage;

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
        this.name = "EnhancedDamage";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.helpFile = `help 'enhanced damage'
'ENHANCED DAMAGE'
Warriors and skilled thieves can become skilled enough in combat that they are
able to inflict more damage than other classes.  Enhanced damage is checked
for with each hit, although with a low skill, the chance of receiving a bonus
is very low indeed.`;

        if (EnhancedDamage.instance === undefined) {
            EnhancedDamage.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): EnhancedDamage {
        if (!EnhancedDamage.instance) {
            EnhancedDamage.instance = new EnhancedDamage();
        }
        return EnhancedDamage.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EnhancedDamage.GetInstance() as T;
    }
}

export default EnhancedDamage;