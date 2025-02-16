import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class TailThrash implements IAbility {
    private static instance: TailThrash;

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
        this.name = "Tail Thrash";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
'TAIL THRASH'
Syntax:  tail thrash
         tail thrash <target>
Tail thrash is a dragon only attack. (Of course, who else has a tail capable
of doing damage? *grin*)  It may be used while in combat without an argument
or with an argument to initiate combat.  The effects are similar to those of
the bash skill used by warriors of other races.
See also:  BASH DRAGON`;

        this.manualDescription = "";
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): TailThrash {
        if (!TailThrash.instance) {
            TailThrash.instance = new TailThrash();
        }
        return TailThrash.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return TailThrash.GetInstance() as T;
    }
}

export default TailThrash;