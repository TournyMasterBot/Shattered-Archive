import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ShieldBlock implements IAbility {
    private static instance: ShieldBlock;

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
        this.name = "ShieldBlock";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.helpFile = `help 'Shield Block'
'SHIELD BLOCK'
Shield block is a rather fancy name for the art of parrying with a shield.
Characters with no shield block skill will not be able to defend themselves
well with a shield.  All classes may learn shield block, but only warriors and
clerics are good at it.  Beware, flails ignore shield blocking attempts, and
whips have an easier time getting around them.  Axes may split shields in two.
Shield block now works against charges from other rooms.`;

        if (ShieldBlock.instance === undefined) {
            ShieldBlock.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): ShieldBlock {
        if (!ShieldBlock.instance) {
            ShieldBlock.instance = new ShieldBlock();
        }
        return ShieldBlock.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ShieldBlock.GetInstance() as T;
    }
}

export default ShieldBlock;