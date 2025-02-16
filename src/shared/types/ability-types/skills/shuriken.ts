import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Shuriken implements IAbility {
    private static instance: Shuriken;

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
        this.name = "Shuriken";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `SHURIKEN
Syntax: Craftshuriken

Syntax: Toss Shuriken <target>

Able to manufacture their own weapons, ninja may take any metal object and
re-fashion it into a number of deadly throwing stars known as shuriken. 
These can then be hurled at a enemy for devastatingly strong amounts of
damage.  Despite being thrown, they are short range weapons, targets must be
in the same room as the ninja.  

SEE ALSO:  NINJA`;

        if (Shuriken.instance === undefined) {
            Shuriken.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Shuriken {
        if (!Shuriken.instance) {
            Shuriken.instance = new Shuriken();
        }
        return Shuriken.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Shuriken.GetInstance() as T;
    }
}

export default Shuriken;