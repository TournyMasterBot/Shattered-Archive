import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Strangle implements IAbility {
    private static instance: Strangle;

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
        this.name = "Strangle";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
STRANGLE
Syntax:  strangle <target>
Strangle is a skill which can only be learned by assassins.  An assassin
must be sneaking in order to strangle successfully.  When successful, 
the target is rendered unconscious for the remainder of the tick in which
they were strangled plus one additional tick.  If a strangle attempt is 
unsuccessful, it initiates combat with the victim.
`;

        if (Strangle.instance === undefined) {
            Strangle.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Strangle {
        if (!Strangle.instance) {
            Strangle.instance = new Strangle();
        }
        return Strangle.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Strangle.GetInstance() as T;
    }
}

export default Strangle;