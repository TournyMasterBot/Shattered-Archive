import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class DirtKicking implements IAbility {
    private static instance: DirtKicking;

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
        this.name = "DirtKicking";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help 'dirt kicking'
'DIRT KICKING'
Considered by some to be a cowardly skill, dirt kicking gives the clever 
combatant a chance to blind his opponent by casting dirt into his eyes.  The
blindness does not last long, but can provide an edge in combat.  Dexterity
helps in hitting or avoiding a dirt kick.  Only warriors and thieves may
learn this skill.`;

        if (DirtKicking.instance === undefined) {
            DirtKicking.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): DirtKicking {
        if (!DirtKicking.instance) {
            DirtKicking.instance = new DirtKicking();
        }
        return DirtKicking.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DirtKicking.GetInstance() as T;
    }
}

export default DirtKicking;